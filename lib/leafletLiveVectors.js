import L from 'leaflet';

/**
 * Two Leaflet canvas-renderer patches, both about the same thing: the vector
 * canvas' backing store is enormous and stock Leaflet throws it away far more
 * often than it needs to.
 *
 * ---------------------------------------------------------------------------
 * 1. Live vector reprojection during frame-driven zooms
 * ---------------------------------------------------------------------------
 * Leaflet's vector renderers (SVG + canvas) do NOT reproject paths while the
 * zoom is changing: they CSS-scale the whole renderer container from the last
 * redraw baseline and only reproject at zoomend/moveend. That is fine for a
 * one-level pinch, but this app runs multi-level frame-driven zooms — reveal
 * flyTo/flyToBounds (up to ~5+ levels), round-focus flights on the summary
 * screens, and the fluid wheel glide. Consequences (the "line glitch" bug):
 *
 *   - a reveal flight scales the container up to 2^levels: canvas raster
 *     lines render HUGE and blurred, SVG strokes render massively thick,
 *     until the flight's moveend redraw finally lands
 *   - any polyline added or updated MID-flight (the answer line mounting
 *     during the reveal, round highlights while the camera is flying) gets
 *     projected at the CURRENT camera but drawn inside a container that is
 *     still transformed from the OLD baseline — the line sits off its points
 *     until the next zoomend; interrupting the flight with another one just
 *     extends the broken window
 *
 * Fix: on every 'zoom' event of a frame-driven movement, reproject all of the
 * renderer's layers and re-baseline + redraw (subclass _update work; its
 * setPosition also clears any leftover scale transform).
 *
 * CSS-animated zooms (double-click, zoom buttons: _animatingZoom) keep the
 * stock transform path — there the container must ride the same CSS
 * transition as the tile layer, and lib/leafletSettleZoomAnim.js guarantees
 * those animations always settle before new motion starts.
 *
 * ---------------------------------------------------------------------------
 * 2. Reusable canvas backing store  (the expensive one)
 * ---------------------------------------------------------------------------
 * Stock `Canvas._update` assigns `container.width`/`height` on EVERY call.
 * Per spec that reallocates and clears the entire backing store, even when the
 * assigned value is identical. That store is not small: Leaflet sizes it
 * `viewport * (1 + padding * 2)`, then doubles again for retina. Map.js runs
 * `padding: 0.5`, so a 1920x1080 desktop reveal wants a 7680x4320 canvas —
 * about 133 MB.
 *
 * `_update` runs on 'moveend', and `map.invalidateSize()` fires 'moveend'
 * SYNCHRONOUSLY (no debounce by default — read the 1.9.4 source). Map.js's
 * RevealController calls invalidateSize once per animation frame for the whole
 * 300ms that #miniMapArea CSS-animates from corner-minimap to fullscreen —
 * that per-frame call is load-bearing, it is what keeps the camera centre
 * locked while the container grows, so it is NOT going anywhere. But it meant
 * the reveal allocated-and-zeroed a canvas growing toward 133 MB about
 * eighteen times in 300ms, on the main thread. Roughly a gigabyte of memset
 * during the single most frame-starved moment of a round. The same thing
 * happened, smaller, on every hover-expand of the desktop minimap.
 *
 * Fix: keep our own allocation size and only touch container.width/height when
 * the store is genuinely too small (or has been oversized for a while).
 *   - GROW: allocate exactly what is needed the first time. If a second grow
 *     arrives within GROW_BURST_MS we are mid-transition, so jump straight to
 *     the largest this renderer can ever need (the padded viewport) and stop
 *     reallocating for the rest of it. Two reallocations per reveal, not ~18.
 *   - REUSE: reset the transform and clearRect instead. Same pixels, no
 *     allocation. GPU-side fill rather than a main-thread buffer swap.
 *   - SHRINK: only after the size has stayed small for SHRINK_DELAY_MS, so a
 *     fullscreen->corner collapse does not realloc per frame either, and an
 *     idle corner minimap does not sit on a fullscreen-sized buffer.
 *
 * `_bounds` stays EXACT throughout — it is what paths clip to and what
 * `_containsPoint` hit-tests against, so an oversized store draws and behaves
 * identically. The surplus is transparent, sits outside `_bounds`, and is
 * clipped by `.leaflet-container`'s own `overflow: hidden`.
 */

const GROW_BURST_MS = 250;
const SHRINK_DELAY_MS = 500;

if (!L.Canvas.prototype._reusableBackingStore) {
  L.Canvas.prototype._reusableBackingStore = true;

  // Largest store this renderer can ever need: the padded VIEWPORT. Every
  // container that grows (corner minimap -> fullscreen answer map, hover
  // expand) tops out there, so it is a real ceiling, not a guess.
  L.Canvas.prototype._maxBackingSize = function () {
    const p = this.options.padding;
    const w = typeof window === 'undefined' ? 0 : window.innerWidth;
    const h = typeof window === 'undefined' ? 0 : window.innerHeight;
    return {
      x: Math.ceil(w * (1 + p * 2)),
      y: Math.ceil(h * (1 + p * 2)),
    };
  };

  L.Canvas.prototype._clearShrinkTimer = function () {
    if (this._shrinkTimer) {
      clearTimeout(this._shrinkTimer);
      this._shrinkTimer = null;
    }
  };

  L.Canvas.prototype._update = function () {
    if (this._map._animatingZoom && this._bounds) { return; }

    // Fresh _bounds / _center / _zoom. Untouched: this is the exact clip box.
    L.Renderer.prototype._update.call(this);

    const container = this._container;
    const b = this._bounds;
    const size = b.getSize();
    const m = L.Browser.retina ? 2 : 1;

    L.DomUtil.setPosition(container, b.min);

    if (size.x > (this._allocX || 0) || size.y > (this._allocY || 0)) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      // A second grow inside the burst window means a container is animating
      // open, not a one-off resize. Allocate the ceiling once and coast.
      const midTransition = this._lastGrowAt != null && (now - this._lastGrowAt) < GROW_BURST_MS;
      this._lastGrowAt = now;

      let allocX = size.x;
      let allocY = size.y;
      if (midTransition) {
        const cap = this._maxBackingSize();
        allocX = Math.max(allocX, cap.x);
        allocY = Math.max(allocY, cap.y);
      }
      this._allocX = allocX;
      this._allocY = allocY;
      this._clearShrinkTimer();

      // The only path that reallocates. Assigning width/height also clears the
      // store and resets the context to the identity transform.
      container.width = m * allocX;
      container.height = m * allocY;
      container.style.width = allocX + 'px';
      container.style.height = allocY + 'px';
      if (m !== 1) { this._ctx.scale(m, m); }
    } else {
      // Reuse. Equivalent to what the realloc did, minus the allocation.
      this._ctx.setTransform(m, 0, 0, m, 0, 0);
      this._ctx.clearRect(0, 0, this._allocX, this._allocY);

      // Sitting on a store more than twice what we need: give it back, but
      // only once the size has settled, so a collapse animation coasts too.
      this._clearShrinkTimer();
      if (size.x * 2 < this._allocX || size.y * 2 < this._allocY) {
        this._shrinkTimer = setTimeout(() => {
          this._shrinkTimer = null;
          if (!this._map || !this._ctx) return;
          this._allocX = 0;
          this._allocY = 0;
          this._lastGrowAt = null;
          this._update();
        }, SHRINK_DELAY_MS);
      }
    }

    // Same path coordinates whatever the store size — this is what makes an
    // oversized buffer indistinguishable from an exact one.
    this._ctx.translate(-b.min.x, -b.min.y);

    this.fire('update');
  };

  const origDestroyContainer = L.Canvas.prototype._destroyContainer;
  L.Canvas.prototype._destroyContainer = function () {
    this._clearShrinkTimer();
    this._allocX = 0;
    this._allocY = 0;
    this._lastGrowAt = null;
    origDestroyContainer.call(this);
  };
}

if (!L.Renderer.prototype._liveVectorZoom) {
  L.Renderer.prototype._liveVectorZoom = true;

  const origOnZoom = L.Renderer.prototype._onZoom;
  L.Renderer.prototype._onZoom = function () {
    if (!this._map || !this._container) return;
    if (this._map._animatingZoom) {
      origOnZoom.call(this);
      return;
    }
    for (const id in this._layers) {
      this._layers[id]._project();
    }
    // No canvas special-case here any more. The patch above already makes a
    // same-size _update() allocation-free, which is exactly the case a camera
    // flight hits every frame — and it now covers the changing-size case too,
    // which the old hand-rolled fast path here did not.
    this._update();
  };
}

export default true;
