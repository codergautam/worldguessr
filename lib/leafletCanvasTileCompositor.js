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
// Backing-store reuse windows. Mirrors lib/leafletLiveVectors.js, which fixed
// this exact disease for the VECTOR canvas on July 28 — see the block comment
// on _resizeBacking below for why the tile canvas needed the same treatment.
const GROW_BURST_MS = 250;
const SHRINK_DELAY_MS = 500;
// Mid-animation growth factor. leafletLiveVectors jumps straight to the padded
// viewport ceiling on a burst; that kills reallocations but makes a HOVER
// EXPAND (which only needs ~40% of the viewport) hold a full-viewport buffer —
// on a 1366x768 potato that is 6.3MB instead of 2.6MB, and this codebase's
// low-end users are the priority. Growing 1.5x per burst step instead gets
// nearly all the benefit for a fraction of the overshoot: measured on the
// corner->expand animation, 15 reallocations drop to 3 while the transient
// overshoot is ~2.2MB rather than ~3.7MB, and reveal (which really does need
// the whole viewport) still lands there in 4 steps instead of 24.
const GROW_FACTOR = 1.5;
// Hand memory back when the allocation exceeds what is needed by this much.
// Tighter than a 2x rule so a geometric overshoot cannot linger: after any
// animation settles, one delayed pass returns the buffer to the exact size.
const SHRINK_SLACK = 1.15;

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
    // Content size (css px, = map size + 2·BUFFER_PX). This is what the draw
    // math and the cover-pass culls measure against — it is NOT the allocated
    // size, which may be larger while a container animates (_allocW/_allocH).
    this._lastW = 0;
    this._lastH = 0;
    this._lastDpr = 0;
    // Allocated backing size in CSS px, and the burst/shrink bookkeeping that
    // keeps it stable across a resize animation. See _resizeBacking.
    this._allocW = 0;
    this._allocH = 0;
    this._lastGrowAt = null;
    this._shrinkTimer = null;
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

  _clearShrinkTimer() {
    if (this._shrinkTimer) {
      clearTimeout(this._shrinkTimer);
      this._shrinkTimer = null;
    }
  }

  // Hard cap for mid-animation over-allocation: the padded VIEWPORT. Every
  // container that grows (corner minimap -> fullscreen answer map, hover
  // expand) tops out there, so it is a real ceiling, not a guess. Growth only
  // approaches it geometrically — reaching it is the reveal's business, not a
  // hover's (see GROW_FACTOR).
  _maxBackingSize() {
    const w = typeof window === 'undefined' ? 0 : window.innerWidth;
    const h = typeof window === 'undefined' ? 0 : window.innerHeight;
    return { x: w + BUFFER_PX * 2, y: h + BUFFER_PX * 2 };
  }

  /**
   * Size the backing store for `cssW x cssH` of content, REUSING the existing
   * allocation whenever it is already big enough.
   *
   * WHY (Aug 10): assigning canvas.width/height reallocates and zeroes the
   * whole backing store per spec, even when the assigned value is unchanged —
   * and this ran on every size change. Every MP round transition animates
   * #miniMapArea fullscreen<->corner for 400ms while the ResizeObserver and
   * RevealController call invalidateSize once per frame ('resize' -> draw), so
   * one round reallocated a buffer of up to (1920+256)(1080+256)·dpr²·4 bytes
   * — 12MB at dpr 1, 46MB at dpr 2 — about 36 times, growing then shrinking.
   * Sustained churn like that on ONE long-lived composited canvas layer is the
   * prime suspect for the reported "imagery goes soft mid-session, survives
   * round transitions, only a refresh fixes it": the drawn bitmap is fine and
   * Chrome is displaying a degraded texture for the layer.
   *
   * This is the SAME defect and the same cure as stock Canvas._update's
   * per-frame realloc, root-caused and fixed for the vector canvas on July 28
   * in lib/leafletLiveVectors.js (GROW_BURST_MS / SHRINK_DELAY_MS are shared
   * constants by intent). This module was written afterwards and never got the
   * treatment — it was the last full-screen surface in the map stack still
   * reallocating on a per-frame path.
   *
   * INVARIANT (load-bearing, do not break): style.width/height must always
   * equal width/height ÷ dpr. Any divergence makes the browser rescale the
   * bitmap to fit the box, which IS blur — i.e. it would cause the exact bug
   * this function exists to fix. Surplus area hangs off the RIGHT and BOTTOM,
   * outside the container, transparent, clipped by .leaflet-container's
   * overflow:hidden — and because .leaflet-zoom-animated sets
   * transform-origin: 0 0 (leaflet.css), CSS zoom animations scale away from
   * the anchored top-left, so the surplus can never scale into view either.
   */
  _resizeBacking(cssW, cssH, dpr) {
    // A dpr change (monitor swap, browser zoom) invalidates the ceiling and
    // every allocated pixel — drop the high-water mark and size exactly.
    if (dpr !== this._lastDpr) {
      this._allocW = 0;
      this._allocH = 0;
      this._lastGrowAt = null;
      this._clearShrinkTimer();
    }
    this._lastW = cssW;
    this._lastH = cssH;
    this._lastDpr = dpr;

    if (cssW > this._allocW || cssH > this._allocH) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      // A second grow inside the burst window means a container is animating
      // open, not a one-off resize — so over-allocate and coast instead of
      // paying a realloc every frame. A lone resize still sizes exactly.
      const midTransition = this._lastGrowAt != null && (now - this._lastGrowAt) < GROW_BURST_MS;
      this._lastGrowAt = now;

      let allocW = cssW;
      let allocH = cssH;
      if (midTransition) {
        // Geometric, capped at the padded viewport. Overshoot is proportional
        // to the CURRENT size, so a corner->expand animation overshoots by a
        // couple of MB instead of jumping to a full-viewport buffer, while a
        // corner->fullscreen reveal still reaches the ceiling in a handful of
        // steps. The shrink pass below reclaims the overshoot at rest.
        const cap = this._maxBackingSize();
        allocW = Math.max(allocW, Math.min(cap.x, Math.ceil(this._allocW * GROW_FACTOR)));
        allocH = Math.max(allocH, Math.min(cap.y, Math.ceil(this._allocH * GROW_FACTOR)));
      }
      this._allocW = allocW;
      this._allocH = allocH;
      this._clearShrinkTimer();

      // The only path that reallocates.
      this._canvas.width = Math.round(allocW * dpr);
      this._canvas.height = Math.round(allocH * dpr);
      // Derived from the rounded backing so the texel mapping stays exactly
      // 1:dpr — a fractional px string is correct here, cssW is not.
      this._canvas.style.width = `${this._canvas.width / dpr}px`;
      this._canvas.style.height = `${this._canvas.height / dpr}px`;
      return;
    }

    // Reuse: the existing allocation already covers the content. Nothing to
    // do — the caller clears and redraws as usual (drawKey tracks
    // canvas.width/height, which is now stable across a resize animation, so
    // the no-clear stale-cover behaviour that keeps rebirth windows flashless
    // is preserved).
    //
    // Holding more than we need: give it back, but only once the size has
    // settled, so a fullscreen->corner collapse coasts too and an idle corner
    // minimap never sits on a fullscreen buffer. SHRINK_SLACK is deliberately
    // tight (not a 2x rule) so a geometric grow overshoot is reclaimed at the
    // first rest rather than held for the round — resting memory is therefore
    // the EXACT size, same as before this optimisation existed.
    this._clearShrinkTimer();
    if (cssW * SHRINK_SLACK < this._allocW || cssH * SHRINK_SLACK < this._allocH) {
      this._shrinkTimer = setTimeout(() => {
        this._shrinkTimer = null;
        if (!this._map) return;
        this._allocW = 0;
        this._allocH = 0;
        this._lastGrowAt = null;
        this.draw();
      }, SHRINK_DELAY_MS);
    }
  }

  _drawUnsafe(contentOnly, frame) {
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
      this._resizeBacking(size.x + BUFFER_PX * 2, size.y + BUFFER_PX * 2, dpr);

      // Canvas top-left in layer coordinates (integer, so the element's own
      // translate never introduces sub-pixel phase of its own). Pure pane
      // math (-mapPanePos), so it is frame-independent: valid for both the
      // live camera and a zoomanim target frame.
      const viewTL = map.containerPointToLayerPoint([0, 0]);
      origin = L.point(Math.round(viewTL.x - BUFFER_PX), Math.round(viewTL.y - BUFFER_PX));
      if (frame) {
        // Target-frame draw for the shrinking-settle FLIP: the caller owns
        // the element transform (writing it here would run under the active
        // zoom-anim transition and glide instead of placing instantly).
        zoom = frame.zoom;
        pixelOrigin = map._getNewPixelOrigin(frame.center, frame.zoom);
      } else {
        L.DomUtil.setTransform(this._canvas, origin);
        zoom = map.getZoom();
        pixelOrigin = map.getPixelOrigin();
      }
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
    // Content size is part of the key too: the backing store is now reused
    // across a resize animation, so canvas.width/height alone no longer
    // witnesses every surface change (pixelOrigin does today, being
    // size-derived — this keeps the clear correct regardless).
    const drawKey = `${zoom}|${origin.x},${origin.y}|${pixelOrigin.x},${pixelOrigin.y}|${this._canvas.width}x${this._canvas.height}|${this._lastW}x${this._lastH}`;
    if (drawKey !== this._lastDrawKey) {
      this._lastDrawKey = drawKey;
      // Full allocation, not just the content box: surplus from a previous
      // larger content size must never survive into a later frame.
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    const now = +new Date();
    const fadeAnimated = !!map._fadeAnimated;
    // All draw math must use the dpr the backing store was sized with —
    // content-only draws reuse a frozen canvas, so a mid-animation browser
    // zoom must not shift the rect math off the bitmap.
    const drawDpr = this._lastDpr || dpr;
    // Cull against the CONTENT box, not the allocation. With a reused backing
    // the surplus is invisible (outside the container, clipped), so drawing
    // into it would be pure waste — this keeps the per-frame drawImage count
    // identical to an exactly-sized canvas.
    const drawW = Math.min(this._canvas.width, Math.round(this._lastW * drawDpr));
    const drawH = Math.min(this._canvas.height, Math.round(this._lastH * drawDpr));
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
              if (cr <= 0 || cb <= 0 || cl >= drawW || ct >= drawH
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
          if (r <= 0 || b <= 0 || l >= drawW || t >= drawH) continue;
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

    // SHRINKING settle (zoom-out): riding the old frame scales the canvas
    // BELOW viewport size — on tall phones the height shorts first and
    // backdrop bars flash top/bottom for the whole settle. Re-baseline
    // instead: draw the WIDER target frame now (retained fine tiles +
    // ancestor cover keep continuity), then FLIP — place the canvas
    // instantly so it still shows the current camera, and let the CSS
    // transition carry it down to rest, covered the entire way. Bonus:
    // tiles arriving mid-settle now paint into the target frame at full
    // resolution. (Zoomanim fires BEFORE the suppressed _move, so
    // map.getZoom()/getPixelOrigin() still hold the pre-settle camera.)
    if (map.getZoomScale(e.zoom, this._drawnZoom) < 1) {
      const oldZoom = map.getZoom();
      const oldPixelOrigin = map.getPixelOrigin();
      try {
        this._drawUnsafe(false, { center: e.center, zoom: e.zoom });
      } catch (err) {
        try { console.error('[tileCompositor] draw failed, falling back', err); } catch {}
        this.destroy();
        return;
      }
      const s0 = map.getZoomScale(oldZoom, e.zoom);
      const start = this._drawnOriginWorld
        .multiplyBy(s0)
        .subtract(oldPixelOrigin)
        .round();
      const el = this._canvas;
      el.style.transition = 'none';
      L.DomUtil.setTransform(el, start, s0);
      void el.offsetWidth;
      el.style.transition = '';
      L.DomUtil.setTransform(el, this._drawnOrigin);
      this.schedule();
      return;
    }

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
      this._clearShrinkTimer();
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
      this._allocW = 0;
      this._allocH = 0;
      this._canvas.remove();
    } catch {}
    // Release the map's latch so a compositor can be rebuilt. The init hook's
    // 'layeradd' arm is still attached and early-returns on a stale reference,
    // so without this a single thrown draw left the map on the DOM-tile
    // fallback (hidden-img class removed, so it RENDERS — just without the
    // seam fix) until a full page reload. The fallback stays graceful; it is
    // now also self-healing on the next layer add.
    try {
      if (map._wgCompositor === this) map._wgCompositor = null;
    } catch {}
  }
}

// DESKTOP-ONLY. The compositor solved a desktop disease (white seam lines
// from per-frame re-rasterization during scripted wheel/flight zooms) and
// earned its keep there. On mobile it kept sprouting edge cases (settle
// coverage bars, expanded-map grey bands, zoom+pan jitter) and its canvas
// backing is NON-purgeable memory iOS charges against the tab — ~25MB for
// a 3x corner minimap, 60-80MB expanded, per map — which fed jetsam tab
// reloads. Mobile pinches are CSS-animated with normal blend and never had
// the seam complaint; it keeps the proven DOM tile pipeline plus all the
// gesture/level/pin logic fixes, which are compositor-independent.
if (typeof window !== 'undefined' && !L.Map.prototype._wgTileCompositor && !L.Browser.mobile) {
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
