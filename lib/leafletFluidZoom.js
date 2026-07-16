import L from 'leaflet';

/**
 * Fluid scroll-wheel zoom for Leaflet: instead of stepping a whole zoom level
 * per wheel notch, wheel input moves a zoom target and a rAF loop glides the
 * actual zoom toward it in fractional increments, anchored at the cursor.
 *
 * Local fork of a public Leaflet wheel-zoom smoothing plugin (credited in the
 * README's Acknowledgements) so we can tweak the feel freely. Fork changes:
 *   - renamed API: options `fluidWheelZoom` / `fluidWheelZoomSensitivity` /
 *     `fluidWheelZoomEase` / `fluidWheelZoomMinSpeed` / `fluidWheelZoomMaxSpeed`,
 *     handler `L.Map.FluidWheelZoom`
 *   - rate shaping in speed units: while the wheel is scrolling, sustained
 *     zoom speed is pinned between fluidWheelZoomMinSpeed (slow-mouse
 *     compensation) and fluidWheelZoomMaxSpeed (flick cap), levels/second.
 *     See the knob cheat sheet above the mergeOptions block.
 *   - re-anchors at the cursor on every wheel event. Upstream pinned the
 *     GESTURE-START anchor to the moving cursor, which dragged the whole map
 *     sideways along with the mouse mid-zoom.
 *   - time-based exponential easing (fluidWheelZoomEase, a time constant in
 *     ms) instead of a fixed 30%-per-FRAME lerp, so 60Hz and 240Hz displays
 *     get the identical glide instead of a stiffer, steppier one.
 *   - full float zoom precision with a snap-to-goal epsilon. Upstream floored
 *     zoom to 0.01 steps each frame; on high-Hz displays most frames moved
 *     less than one quantum and the zoom visibly stair-stepped.
 *   - the gesture only ends once the glide has converged, rather than being
 *     cut off mid-ease by a fixed idle timeout
 *   - if anything else moves the map mid-gesture (invalidateSize from a
 *     layout change, a setView, an animation) the gesture aborts completely,
 *     closing its move state; the next wheel event starts fresh
 *   - respects maxBounds every glide frame via _limitCenter, the same clamp
 *     setView applies; raw _move has none, so zoom-out near an edge could
 *     drift the view out of bounds and get snapped back on moveend
 *   - auto-disables Leaflet's stock stepped scrollWheelZoom handler if both
 *     are enabled (they would double-handle every wheel event)
 *   - clean teardown when the handler is removed mid-wheel: the upstream left
 *     its end-timeout and rAF running, which could poke a removed map
 *     (this app unmounts maps mid-interaction at round transitions)
 *
 * Usage (react-leaflet): pass `scrollWheelZoom={false} fluidWheelZoom` on the
 * MapContainer. Use `fluidWheelZoom="center"` to zoom about the map center
 * instead of the cursor. The handler is registered on L.Map when this module
 * is imported; maps without the option are untouched.
 */

// Outside the registration guard so edited numbers apply on every reload.
// THE THREE FEEL KNOBS (independent, human units):
//   fluidWheelZoomEase      ms the glide trails behind the target.
//                           Lower = snappier stop, higher = floatier.
//   fluidWheelZoomMinSpeed  zoom-levels/second, the SLOWEST the zoom moves
//                           while the wheel is actively scrolling. This is
//                           the slow-mouse compensation: raise it and gentle
//                           or feather-delta scrolling zooms faster.
//   fluidWheelZoomMaxSpeed  zoom-levels/second ceiling. This is the flick
//                           cap: lower it and violent spins top out slower.
//                           If minSpeed >= maxSpeed, minSpeed wins.
// fluidWheelZoomSensitivity scales how far one notch travels BETWEEN those
//                           two bounds (it cannot push past them).
L.Map.mergeOptions({
  // false | true (zoom about the cursor) | 'center' (zoom about map center)
  fluidWheelZoom: false,
  fluidWheelZoomSensitivity: 1,
  fluidWheelZoomEase: 100,
  fluidWheelZoomMinSpeed: 6,
  fluidWheelZoomMaxSpeed: 8,
});

if (!L.Map.FluidWheelZoom) {
  L.Map.FluidWheelZoom = L.Handler.extend({
    addHooks() {
      if (this._map.scrollWheelZoom && this._map.scrollWheelZoom.enabled()) {
        this._map.scrollWheelZoom.disable();
      }
      L.DomEvent.on(this._map._container, 'wheel', this._onWheelScroll, this);
    },

    removeHooks() {
      L.DomEvent.off(this._map._container, 'wheel', this._onWheelScroll, this);
      this._abort();
    },

    _onWheelScroll(e) {
      if (!this._isWheeling) this._onWheelStart(e);
      this._onWheeling(e);
    },

    _onWheelStart(e) {
      const map = this._map;
      this._isWheeling = true;
      this._centerPoint = map.getSize()._divideBy(2);
      this._startLatLng = map.containerPointToLatLng(this._centerPoint);
      this._moved = false;
      this._lastFrameTime = performance.now();

      map._stop();
      if (map._panAnim) map._panAnim.stop();

      this._goalZoom = map.getZoom();
      this._prevCenter = map.getCenter();
      this._prevZoom = map.getZoom();

      this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
    },

    _onWheeling(e) {
      const map = this._map;
      const opts = map.options;

      const raw = L.DomEvent.getWheelDelta(e) * 0.003 * opts.fluidWheelZoomSensitivity;
      if (raw !== 0) {
        const cur = map.getZoom();
        // Glide speed is lead/ease, so bounding the goal's lead over the live
        // zoom pins the sustained rate into [minSpeed, maxSpeed] levels/sec
        // regardless of what deltas the wheel hardware emits.
        const tau = opts.fluidWheelZoomEase / 1000;
        const minSpeed = Math.max(0, opts.fluidWheelZoomMinSpeed);
        const maxSpeed = Math.max(minSpeed, opts.fluidWheelZoomMaxSpeed);
        const dir = raw > 0 ? 1 : -1;

        const goal = this._goalZoom + raw;
        // lead measured in the direction of THIS event, so a reversal notch
        // mid-glide bites immediately instead of shaving old momentum
        const lead = (goal - cur) * dir;
        const clamped = Math.min(maxSpeed * tau, Math.max(minSpeed * tau, lead));
        let next = cur + clamped * dir;

        if (next < map.getMinZoom() || next > map.getMaxZoom()) {
          next = map._limitZoom(next);
        }
        this._goalZoom = next;
      }

      // Re-anchor at the cursor's CURRENT position: each tick zooms about
      // whatever is under the mouse right now. (Keeping the gesture-start
      // anchor would drag the map sideways along with the moving cursor.)
      this._wheelMousePosition = map.mouseEventToContainerPoint(e);
      this._anchorLatLng = map.containerPointToLatLng(this._wheelMousePosition);

      clearTimeout(this._timeoutId);
      this._timeoutId = setTimeout(this._onWheelIdle.bind(this), 200);

      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
    },

    // The wheel has been idle for a beat, but let the glide land before
    // committing the gesture; cutting it off mid-ease reads as a hitch.
    _onWheelIdle() {
      if (!this._isWheeling) return;
      if (Math.abs(this._goalZoom - this._map.getZoom()) > 0.002) {
        this._timeoutId = setTimeout(this._onWheelIdle.bind(this), 50);
        return;
      }
      this._finish();
    },

    _finish() {
      this._isWheeling = false;
      cancelAnimationFrame(this._zoomAnimationId);
      this._map._moveEnd(true);
    },

    // Dismantle the gesture without fighting whoever now owns the map.
    _abort() {
      if (!this._isWheeling) return;
      clearTimeout(this._timeoutId);
      cancelAnimationFrame(this._zoomAnimationId);
      this._isWheeling = false;
      if (this._moved) {
        this._moved = false;
        this._map._moveEnd(true);
      }
    },

    _updateWheelZoom() {
      const map = this._map;

      // Something else (invalidateSize, setView, an animation) moved the map.
      // Let it win, and tear the WHOLE gesture down. Just stopping the loop
      // left _isWheeling latched: every later wheel event fed a goal nobody
      // consumed (zoom locked forever), the idle poller re-armed eternally,
      // and the unclosed _moveStart starved tile loading (grey flashes).
      if (!map.getCenter().equals(this._prevCenter) || map.getZoom() !== this._prevZoom) {
        this._abort();
        return;
      }

      const now = performance.now();
      const dt = now - this._lastFrameTime;
      this._lastFrameTime = now;

      const cur = map.getZoom();
      const remaining = this._goalZoom - cur;
      // Frame-rate independent ease: same glide on a 60Hz or a 240Hz display.
      const zoom = Math.abs(remaining) < 1e-4
        ? this._goalZoom
        : cur + remaining * (1 - Math.exp(-dt / map.options.fluidWheelZoomEase));

      if (zoom !== cur) {
        const delta = this._wheelMousePosition.subtract(this._centerPoint);
        let center;
        if (map.options.fluidWheelZoom === 'center' || (delta.x === 0 && delta.y === 0)) {
          center = this._startLatLng;
        } else {
          // keep the latlng under the cursor fixed while the zoom glides
          center = map.unproject(map.project(this._anchorLatLng, zoom).subtract(delta), zoom);
        }

        // _move applies no maxBounds clamping (setView does, via _limitCenter),
        // so a cursor-anchored zoom-out near an edge could glide the view past
        // the bounds — grey past the poles, then a jarring panInsideBounds
        // snap-back on moveend. Clamp every frame exactly like setView would.
        if (map.options.maxBounds && map._limitCenter) {
          center = map._limitCenter(center, zoom, map.options.maxBounds);
        }

        if (!this._moved) {
          map._moveStart(true, false);
          this._moved = true;
        }

        map._move(center, zoom);
        this._prevCenter = map.getCenter();
        this._prevZoom = map.getZoom();
      }

      this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
    },
  });

  L.Map.addInitHook('addHandler', 'fluidWheelZoom', L.Map.FluidWheelZoom);
}

export default L.Map.FluidWheelZoom;
