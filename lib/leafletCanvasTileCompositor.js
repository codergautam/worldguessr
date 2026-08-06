import L from 'leaflet';

/**
 * Single-surface tile compositor — the root-cause fix for the white tile-seam
 * hairlines.
 *
 * WHY: Chromium re-rasterizes content whenever its transform scale changes
 * via script (never during CSS animations — Chrome 53+, documented at
 * developer.chrome.com/blog/re-rastering-composite). Our smooth zoom writes a
 * fractional scale() on the tile containers from rAF ~60x/s, so every frame
 * every tile <img> was re-rastered and device-pixel-snapped INDEPENDENTLY;
 * adjacent tiles landing sub-pixel apart is the flickering white/bright
 * hairline. A will-change raster pin was tried first (Aug 6) and rejected:
 * pinned rasters go soft mid-motion and the seams only faded, not died.
 *
 * THE FIX: stop compositing N independent tile surfaces at all. One <canvas>
 * per map sits in the tilePane; every visible tile of every GridLayer is
 * drawn into it each time the camera or tile set changes. Each tile edge is
 * computed ONCE in device pixels and shared with its neighbour
 * (left(x+1) === right(x) by construction), so gaps and overlaps are
 * geometrically impossible at ANY zoom, integer or fractional, moving or at
 * rest. Every draw resamples the source bitmaps at the exact current scale,
 * so motion stays as crisp as a per-frame re-raster — without per-tile
 * snapping, because there is only one surface.
 *
 * The stock <img> pipeline (loading, levels, crossfade bookkeeping, pruning,
 * grouped-tiles patches) is left fully intact and drives WHAT we draw; the
 * imgs themselves are hidden via a scoped class on the map container. If the
 * compositor ever throws, it destroys itself and unhides the imgs — graceful
 * fallback to the status quo.
 *
 * Free structural wins:
 *  - viewprereset teardowns (forceCrispViewReset, rebirthTiles' _resetView)
 *    no longer blank the map: the canvas keeps its last bitmap until new
 *    content draws, so the gray/blue teardown flash is gone by construction.
 *  - fp32 giant-coordinate compositor wobble can't happen: all math is done
 *    in doubles here and lands as one integer translate on one element.
 *
 * CSS-animated zooms (mobile pinch settle, double-click, animated setView)
 * are handled exactly like GridLayer handles them: on 'zoomanim' the canvas
 * gets the same translate+scale a tile level would get and its
 * .leaflet-zoom-animated class lets Leaflet's transition interpolate it on
 * the compositor; the post-anim 'zoom'/'moveend' redraw snaps it crisp.
 * Redraws are skipped while _animatingZoom for the same reason GridLayer
 * defers: logical map state jumps to the target at animation START.
 */

// Must match TILE_FADE_MS in lib/leafletGroupedTiles.js — the imgs are hidden
// but their loaded-timestamps still drive our alpha ramp.
const FADE_MS = 220;
// Extra drawn margin around the viewport (css px). Draws run on EVERY move
// frame (see _onMove), so this only needs to cover one frame of pan between
// draw and paint — kept small because the canvas backing store costs
// (w+2b)(h+2b)·dpr²·4 bytes and this module must use LESS memory than the
// per-tile GPU textures it replaced.
const BUFFER_PX = 128;

function injectStylesOnce() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('leaflet-canvas-tile-compositor-style')) return;
  const style = document.createElement('style');
  style.id = 'leaflet-canvas-tile-compositor-style';
  style.textContent = `
    .wg-canvas-tiles .leaflet-tile-pane img.leaflet-tile {
      visibility: hidden !important;
    }
    .wg-tile-compositor {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
    }
    /* PIN-LAG KILL (probe-convicted Aug 6): getAnimations() showed a live
       'transform' CSS transition on .leaflet-marker-icon in EVERY frame —
       even at rest with no zoom-anim classes anywhere — so each of
       Leaflet's per-zoom-event position writes eased over ~300ms instead
       of applying instantly. Result: the guess pin surfed behind fast
       pinches by up to hundreds of px and glided back at rest, while the
       (transition-free) tile canvas tracked perfectly. Source rule never
       identified; this kill is absolute by construction: NOTHING in the
       overlay panes may transition, from any stylesheet, at any
       specificity. */
    .wg-canvas-tiles .leaflet-marker-pane *,
    .wg-canvas-tiles .leaflet-shadow-pane *,
    .wg-canvas-tiles .leaflet-tooltip-pane * {
      transition: none !important;
    }
    /* The one legitimate overlay transition: riding a real CSS zoom
       animation (pinch settle, animated setView) in lockstep with the
       canvas's own zoomanim mimic. Mirror Leaflet's stock rule... */
    .wg-canvas-tiles .leaflet-zoom-anim .leaflet-marker-pane .leaflet-zoom-animated,
    .wg-canvas-tiles .leaflet-zoom-anim .leaflet-shadow-pane .leaflet-zoom-animated,
    .wg-canvas-tiles .leaflet-zoom-anim .leaflet-tooltip-pane .leaflet-zoom-animated {
      transition: transform 0.25s cubic-bezier(0,0,0.25,1) !important;
    }
    /* ...and keep the grouped-tiles slow-pinch settle (300ms linear, see
       leafletGroupedTiles PINCH_SETTLE_MS) winning over the 0.25s above
       for the settle window, or icons would land 50ms before the tiles. */
    .leaflet-slow-pinch-settle.wg-canvas-tiles .leaflet-zoom-anim .leaflet-marker-pane .leaflet-zoom-animated,
    .leaflet-slow-pinch-settle.wg-canvas-tiles .leaflet-zoom-anim .leaflet-shadow-pane .leaflet-zoom-animated,
    .leaflet-slow-pinch-settle.wg-canvas-tiles .leaflet-zoom-anim .leaflet-tooltip-pane .leaflet-zoom-animated {
      transition-duration: 300ms !important;
      transition-timing-function: linear !important;
    }
  `;
  document.head.appendChild(style);
}

class TileCompositor {
  constructor(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'wg-tile-compositor leaflet-zoom-animated');
    this._ctx = this._canvas.getContext('2d');
    this._frame = null;
    this._lastW = 0;
    this._lastH = 0;
    this._lastDpr = 0;
    // The frame the canvas content was last drawn in. _drawnOriginWorld is
    // the pseudo-level origin the 'zoomanim' transform mimic needs; zoom,
    // pixelOrigin and origin let content-only draws (mid CSS zoom
    // animation) keep painting new tiles into the SAME coordinate system
    // while the CSS transition owns the camera.
    this._drawnZoom = null;
    this._drawnOriginWorld = null;
    this._drawnOrigin = null;
    this._drawnPixelOrigin = null;

    map.getPane('tilePane').appendChild(this._canvas);
    L.DomUtil.addClass(map.getContainer(), 'wg-canvas-tiles');

    this._onZoom = () => this.draw();
    this._onMoveEnd = () => this.draw();
    this._onResize = () => this.draw();
    // EVERY move frame, unthrottled. A throttle here made fast pans out-run
    // the painted buffer: already-loaded imagery sat invisible for up to
    // 100ms while the viewport slid onto unpainted canvas — the "grey/blue
    // edge flashes even though the tile is loaded" report. The draw is the
    // same ~1ms blit the zoom path already runs per frame.
    this._onMove = () => this.draw();
    this._onZoomAnim = (e) => this._applyZoomAnimTransform(e);
    this._onLayerChange = () => this.schedule();
    this._onTileEvent = () => this.schedule();

    map.on('zoom', this._onZoom);
    map.on('move', this._onMove);
    map.on('moveend zoomend viewreset', this._onMoveEnd);
    map.on('resize', this._onResize);
    map.on('zoomanim', this._onZoomAnim);
    map.on('layeradd layerremove', this._onLayerChange);
    // GridLayer tile events bubble to the map with layer context via
    // map.on? They don't — listen on each layer lazily each schedule pass
    // instead: cheaper to just hook the classes' events through the map's
    // layeradd. We keep it simpler: every GridLayer gets our listener once.
    this._hookedLayers = new Set();

    this.schedule();
  }

  _eachGridLayer(fn) {
    // Sorted stable by options.zIndex (all our maps have one tile layer;
    // this just keeps multi-layer maps sane).
    const layers = [];
    this._map.eachLayer((layer) => {
      if (layer instanceof L.GridLayer) layers.push(layer);
    });
    layers.sort((a, b) => (a.options.zIndex || 1) - (b.options.zIndex || 1));
    for (const layer of layers) fn(layer);
  }

  _hookLayerEvents() {
    this._eachGridLayer((layer) => {
      if (this._hookedLayers.has(layer)) return;
      this._hookedLayers.add(layer);
      layer.on('tileload load tileunload', this._onTileEvent);
      layer.once('remove', () => {
        this._hookedLayers.delete(layer);
        layer.off('tileload load tileunload', this._onTileEvent);
        this.schedule();
      });
    });
  }

  schedule() {
    if (this._frame) return;
    this._frame = L.Util.requestAnimFrame(() => {
      this._frame = null;
      this.draw();
    });
  }

  draw() {
    const map = this._map;
    if (!map || !map._loaded) return;
    try {
      // Logical state sits at the TARGET during a CSS zoom animation
      // (pinch settle, double-click); drawing the camera from it would snap
      // the imagery while overlays are still gliding — the zoomanim
      // transform mimic owns the camera until the transition ends. But
      // CONTENT must keep flowing: tiles that finish loading during the
      // settle paint into the last-drawn frame and ride the transition,
      // exactly like DOM tiles used to fade inside a CSS-scaling level
      // container. Without this, a fast mobile zoom showed nothing until
      // the settle ended, then snapped fully-faded tiles in.
      this._drawUnsafe(!!map._animatingZoom);
    } catch (err) {
      // Never let a compositor bug take the map down — unhide the imgs and
      // bow out. The stock pipeline is still fully alive underneath.
      try { console.error('[tileCompositor] draw failed, falling back', err); } catch {}
      this.destroy();
    }
  }

  _drawUnsafe(contentOnly) {
    const map = this._map;
    this._hookLayerEvents();

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let origin;
    let zoom;
    let pixelOrigin;
    if (contentOnly) {
      // Mid CSS zoom animation: reuse the frame the bitmap was drawn in.
      // No reposition, no resize (resizing wipes the canvas), no transform
      // write (it would stomp the running transition), no clear (new tiles
      // paint over the old frame — that IS the crossfade).
      if (this._drawnZoom == null || !this._drawnOrigin || !this._drawnPixelOrigin) return;
      zoom = this._drawnZoom;
      origin = this._drawnOrigin;
      pixelOrigin = this._drawnPixelOrigin;
    } else {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const cssW = size.x + BUFFER_PX * 2;
      const cssH = size.y + BUFFER_PX * 2;
      if (cssW !== this._lastW || cssH !== this._lastH || dpr !== this._lastDpr) {
        this._lastW = cssW;
        this._lastH = cssH;
        this._lastDpr = dpr;
        this._canvas.width = Math.round(cssW * dpr);
        this._canvas.height = Math.round(cssH * dpr);
        this._canvas.style.width = `${cssW}px`;
        this._canvas.style.height = `${cssH}px`;
      }

      // Canvas top-left in layer coordinates (integer, so the element's own
      // translate never introduces sub-pixel phase of its own).
      const viewTL = map.containerPointToLayerPoint([0, 0]);
      origin = L.point(Math.round(viewTL.x - BUFFER_PX), Math.round(viewTL.y - BUFFER_PX));
      L.DomUtil.setTransform(this._canvas, origin);

      zoom = map.getZoom();
      pixelOrigin = map.getPixelOrigin();
      this._drawnZoom = zoom;
      this._drawnOrigin = origin;
      this._drawnPixelOrigin = pixelOrigin;
      this._drawnOriginWorld = origin.add(pixelOrigin);
    }

    const ctx = this._ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Clear ONLY when the camera (or surface) changed. Same-camera refreshes
    // (tile loads, fades, rebirthTiles' registry swap) paint OVER the last
    // frame instead: fading tiles crossfade against the old imagery exactly
    // like the DOM stack did, and a mid-reload draw can never flash backdrop
    // holes where coverage is temporarily missing — the previous frame keeps
    // covering until fresh content lands on top.
    const drawKey = `${zoom}|${origin.x},${origin.y}|${pixelOrigin.x},${pixelOrigin.y}|${this._canvas.width}x${this._canvas.height}`;
    if (drawKey !== this._lastDrawKey) {
      this._lastDrawKey = drawKey;
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    const now = +new Date();
    const fadeAnimated = !!map._fadeAnimated;
    // All draw math must use the dpr the backing store was sized with —
    // content-only draws reuse a frozen canvas, so a mid-animation browser
    // zoom must not shift the rect math off the bitmap.
    const drawDpr = this._lastDpr || dpr;
    let fading = false;

    this._eachGridLayer((layer) => {
      const levels = layer._levels || {};
      // Draw levels in ascending stacking order so the current level (or a
      // deliberately demoted one — see the reveal-exit prefetch's zIndex=1)
      // paints last exactly like the DOM stack would.
      const order = Object.keys(levels)
        .filter((z) => levels[z] && levels[z].el)
        .sort((a, b) => {
          const za = parseInt(levels[a].el.style.zIndex, 10) || 0;
          const zb = parseInt(levels[b].el.style.zIndex, 10) || 0;
          return za - zb;
        });
      if (!order.length) return;

      const ts = layer.getTileSize();
      const byLevel = {};
      for (const key in layer._tiles) {
        const tile = layer._tiles[key];
        if (!tile || !tile.loaded || !tile.el) continue;
        const el = tile.el;
        if (el.tagName !== 'IMG' || !el.complete || !el.naturalWidth) continue;
        (byLevel[tile.coords.z] || (byLevel[tile.coords.z] = [])).push(tile);
      }

      // Ancestor-cover pass (drawn FIRST = under everything, zero extra
      // memory: it reuses already-decoded ancestor imgs and the existing
      // canvas). Every cell of the round(zoom) grid not yet covered by an
      // opaque tile gets the matching subrect of its nearest loaded
      // ancestor. Fast zoom-outs stop flashing the backdrop ring and
      // popcorn arrivals: coarse imagery is there instantly and the real
      // tiles sharpen in over it — the organized look stock
      // updateWhenZooming loading had.
      // The expected grid lives at the layer's CURRENT tile level — that is
      // where new tiles arrive (eager zoom-out prepares retarget it mid-
      // gesture). round(zoom) would misclassify those arrivals as
      // "ancestors" and paint them at alpha 1, bypassing their fade.
      const zc = Number.isFinite(layer._tileZoom) ? layer._tileZoom : Math.round(zoom);
      const cellCss = ts.x * map.getZoomScale(zoom, zc);
      if (cellCss > 1) {
        const worldL = pixelOrigin.x + origin.x;
        const worldT = pixelOrigin.y + origin.y;
        const gx0 = Math.floor(worldL / cellCss);
        const gx1 = Math.ceil((worldL + this._lastW) / cellCss) - 1;
        const maxRow = Math.pow(2, zc) - 1;
        const gy0 = Math.max(0, Math.floor(worldT / cellCss));
        const gy1 = Math.min(maxRow, Math.ceil((worldT + this._lastH) / cellCss) - 1);
        if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) <= 2048) {
          ctx.globalAlpha = 1;
          for (let gx = gx0; gx <= gx1; gx++) {
            for (let gy = gy0; gy <= gy1; gy++) {
              const own = layer._tiles[`${gx}:${gy}:${zc}`];
              const ownDrawable = own && own.loaded && own.el
                && own.el.tagName === 'IMG' && own.el.complete && own.el.naturalWidth;
              const ownOpaque = ownDrawable
                && (!fadeAnimated || now - own.loaded >= FADE_MS);
              if (ownOpaque) continue;

              // Same shared-edge dest math as the real tiles below, so
              // covers butt against real tiles with zero seams too.
              const cl = Math.round((gx * cellCss - worldL) * drawDpr);
              const cr = Math.round(((gx + 1) * cellCss - worldL) * drawDpr);
              const ct = Math.round((gy * cellCss - worldT) * drawDpr);
              const cb = Math.round(((gy + 1) * cellCss - worldT) * drawDpr);
              if (cr <= 0 || cb <= 0 || cl >= this._canvas.width || ct >= this._canvas.height
                || cr <= cl || cb <= ct) continue;

              let covered = false;
              for (let d = 1; d <= 5 && zc - d >= 0; d++) {
                const anc = layer._tiles[`${gx >> d}:${gy >> d}:${zc - d}`];
                const el = anc && anc.loaded && anc.el;
                if (!el || el.tagName !== 'IMG' || !el.complete || !el.naturalWidth) continue;
                // Only FULLY-FADED tiles may serve as instant cover — a
                // still-fading tile used as cover would snap to opaque here
                // and skip its own fade (the level loop draws it properly).
                if (fadeAnimated && now - anc.loaded < FADE_MS) continue;
                const f = 1 << d;
                const srcW = el.naturalWidth / f;
                const srcH = el.naturalHeight / f;
                try {
                  ctx.drawImage(
                    el,
                    (gx - ((gx >> d) << d)) * srcW,
                    (gy - ((gy >> d) << d)) * srcH,
                    srcW, srcH,
                    cl, ct, cr - cl, cb - ct,
                  );
                  covered = true;
                } catch {}
                break;
              }

              // A fading tile's cell must be RESET every frame — by the
              // cover above, or by this clear — so the tile's alpha below
              // composites against a fresh base. Without this, no-clear
              // frames stack the tile over its own previous draws and the
              // 220ms fade compounds to ~100ms: reads as a snap. With it,
              // fades are absolute-alpha, DOM-exact: over coarse cover
              // when an ancestor exists, over backdrop when not (old prod
              // look). Cells with NO drawable own tile are left untouched
              // when uncovered — stale content keeps covering reload
              // windows (rebirthTiles) instead of flashing holes.
              if (!covered && ownDrawable) {
                ctx.clearRect(cl, ct, cr - cl, cb - ct);
              }
            }
          }
        }
      }

      for (const z of order) {
        const tiles = byLevel[z];
        if (!tiles) continue;
        const scale = map.getZoomScale(zoom, Number(z));
        for (const tile of tiles) {
          const c = tile.coords;
          // Shared-edge rule: each grid line is rounded once in device px,
          // so tile k's right edge IS tile k+1's left edge. No seams, ever.
          const l = Math.round((c.x * ts.x * scale - pixelOrigin.x - origin.x) * drawDpr);
          const r = Math.round(((c.x + 1) * ts.x * scale - pixelOrigin.x - origin.x) * drawDpr);
          const t = Math.round((c.y * ts.y * scale - pixelOrigin.y - origin.y) * drawDpr);
          const b = Math.round(((c.y + 1) * ts.y * scale - pixelOrigin.y - origin.y) * drawDpr);
          if (r <= 0 || b <= 0 || l >= this._canvas.width || t >= this._canvas.height) continue;
          if (r <= l || b <= t) continue;

          let alpha = 1;
          if (fadeAnimated) {
            alpha = Math.min(1, (now - tile.loaded) / FADE_MS);
            if (alpha < 1) fading = true;
          }
          if (alpha <= 0) continue;
          ctx.globalAlpha = alpha;
          try {
            ctx.drawImage(tile.el, l, t, r - l, b - t);
          } catch {
            // A decode raced the draw; the next pass gets it.
          }
        }
      }
    });
    ctx.globalAlpha = 1;

    if (fading) this.schedule();
  }

  // Mirror of GridLayer._setZoomTransform for our pseudo-level: during a CSS
  // zoom animation the canvas must glide exactly like a tile container.
  _applyZoomAnimTransform(e) {
    if (this._drawnZoom == null || !this._drawnOriginWorld) return;
    const map = this._map;
    const scale = map.getZoomScale(e.zoom, this._drawnZoom);
    const translate = this._drawnOriginWorld
      .multiplyBy(scale)
      .subtract(map._getNewPixelOrigin(e.center, e.zoom))
      .round();
    L.DomUtil.setTransform(this._canvas, translate, scale);
    // Tiles that finished loading just before (or during) the animation
    // still need to appear — content-only draws paint them into the riding
    // frame (see draw()).
    this.schedule();
  }

  destroy() {
    const map = this._map;
    if (!map) return;
    this._map = null;
    try {
      if (this._frame) L.Util.cancelAnimFrame(this._frame);
      map.off('zoom', this._onZoom);
      map.off('move', this._onMove);
      map.off('moveend zoomend viewreset', this._onMoveEnd);
      map.off('resize', this._onResize);
      map.off('zoomanim', this._onZoomAnim);
      map.off('layeradd layerremove', this._onLayerChange);
      for (const layer of this._hookedLayers) {
        try { layer.off('tileload load tileunload', this._onTileEvent); } catch {}
      }
      this._hookedLayers.clear();
      L.DomUtil.removeClass(map.getContainer(), 'wg-canvas-tiles');
      // Zero the backing store before detaching — releases the (buffered,
      // dpr²-sized) allocation immediately instead of waiting for GC, which
      // matters when maps unmount every round transition.
      this._canvas.width = 0;
      this._canvas.height = 0;
      this._canvas.remove();
    } catch {}
  }
}

if (typeof window !== 'undefined' && !L.Map.prototype._wgTileCompositor) {
  L.Map.prototype._wgTileCompositor = true;
  injectStylesOnce();

  L.Map.addInitHook(function () {
    // Lazy: only maps that actually gain a GridLayer get a compositor.
    const arm = (e) => {
      if (!(e.layer instanceof L.GridLayer)) return;
      if (this._wgCompositor) return;
      try {
        this._wgCompositor = new TileCompositor(this);
      } catch {
        this._wgCompositor = null;
      }
    };
    this.on('layeradd', arm);
    this.on('unload', () => {
      this.off('layeradd', arm);
      if (this._wgCompositor) {
        this._wgCompositor.destroy();
        this._wgCompositor = null;
      }
    });
  });
}
