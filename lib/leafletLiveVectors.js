import L from 'leaflet';

/**
 * Live vector reprojection during frame-driven zooms.
 *
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
 * setPosition also clears any leftover scale transform). Two-point guess
 * lines project in microseconds, but big multiplayer round-over screens can
 * hold ~100 of them, so the canvas hot path below dodges the one genuinely
 * expensive part: Canvas._update reassigns container.width/height on EVERY
 * call — a full backing-store realloc + clear per frame — even though the
 * size never changes mid-zoom (SVG._update guards this; Canvas doesn't).
 * When the size is unchanged we do the equivalent work by hand: reset the
 * context transform, clear, retranslate, and let the paths redraw.
 *
 * CSS-animated zooms (double-click, zoom buttons: _animatingZoom) keep the
 * stock transform path — there the container must ride the same CSS
 * transition as the tile layer, and lib/leafletSettleZoomAnim.js guarantees
 * those animations always settle before new motion starts.
 */

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
    if (this._ctx && this._bounds) {
      // canvas fast path: skip the per-frame backing-store realloc
      const oldSize = this._bounds.getSize();
      L.Renderer.prototype._update.call(this); // fresh _bounds/_center/_zoom
      const b = this._bounds, size = b.getSize();
      if (size.x === oldSize.x && size.y === oldSize.y) {
        const m = L.Browser.retina ? 2 : 1;
        L.DomUtil.setPosition(this._container, b.min);
        this._ctx.setTransform(m, 0, 0, m, 0, 0);
        this._ctx.clearRect(0, 0, size.x, size.y);
        this._ctx.translate(-b.min.x, -b.min.y);
        this.fire('update'); // paths re-clip + redraw
        return;
      }
    }
    this._update();
  };
}

export default true;
