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
 *   - retargetable cubic-Hermite easing evaluated on absolute time (see
 *     _glideState) instead of upstream's fixed 30%-per-FRAME exponential
 *     lerp: identical glide on 60Hz and 240Hz displays, C1-continuous
 *     chaining between wheel notches (each notch re-segments from the exact
 *     current zoom AND velocity), and a bounded-time landing that arrives ON
 *     the goal with zero terminal velocity. An exponential approach never
 *     lands — it creeps sub-pixel for hundreds of ms, which shimmers against
 *     Leaflet's whole-pixel transform rounding (tile translates and marker
 *     positions round independently every frame) and read as the map
 *     "shaking" at the end of every zoom, worst on low-Hz displays.
 *   - full float zoom precision mid-glide. Upstream floored zoom to 0.01
 *     steps each frame; on high-Hz displays most frames moved less than one
 *     quantum and the zoom visibly stair-stepped.
 *   - integer rest: the landing target is the fractional intent snapped AT
 *     WHEEL TIME to whole levels (independent of zoomSnap, which the app
 *     zeroes to free mobile pinch — see SafeMapContainer), so the glide
 *     always comes to rest on a whole zoom level — raster tiles rest at
 *     native 1:1 scale instead of parking CSS-scaled with shrunken/blurry
 *     label text. One notch from rest = exactly one level. (Snapping at idle
 *     instead was tried and reverted: it moved the map after the wheel had
 *     stopped.)
 *   - the gesture only ends once the glide has landed, rather than being
 *     cut off mid-ease by a fixed idle timeout
 *   - if anything else moves the map mid-gesture (invalidateSize from a
 *     layout change, a setView, an animation) the gesture aborts completely,
 *     closing its move state; the next wheel event starts fresh
 *   - respects maxBounds every glide frame via a CONTINUOUS clamp (same
 *     geometry as the _limitCenter clamp setView applies; raw _move has none,
 *     so zoom-out near an edge could drift the view out of bounds and get
 *     snapped back on moveend). See limitCenterSmooth for why the stock
 *     function can't be fed back per frame.
 *   - per-frame _move is tagged {flyTo: true} so GridLayer rides its ANIMATED
 *     tile path (deferred pruning, no per-frame abort/re-queue of tile
 *     fetches) — untagged, every frame tore the tile pipeline down, which
 *     gutted zoom-out (its coarse backfill tiles need fetching, and the
 *     fetches kept being aborted)
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
//   fluidWheelZoomEase      ms one glide segment takes to land on its goal
//                           (each wheel notch starts a fresh segment from the
//                           current zoom+velocity). Lower = snappier stop,
//                           higher = longer coast after the wheel stops.
//   fluidWheelZoomMinSpeed  zoom-levels/second, the SLOWEST the zoom moves
//                           while the wheel is actively scrolling. This is
//                           the slow-mouse compensation: raise it and gentle
//                           or feather-delta scrolling zooms faster. (The
//                           post-release coast always runs to the nearest
//                           whole level — see the integer-rest snap in
//                           _onWheeling.)
//   fluidWheelZoomMaxSpeed  zoom-levels/second ceiling. This is the flick
//                           cap: lower it and violent spins top out slower.
//                           If minSpeed >= maxSpeed, minSpeed wins.
// fluidWheelZoomSensitivity scales how far one notch travels BETWEEN those
//                           two bounds (it cannot push past them).
L.Map.mergeOptions({
  // false | true (zoom about the cursor) | 'center' (zoom about map center)
  fluidWheelZoom: false,
  fluidWheelZoomSensitivity: 1,
  fluidWheelZoomEase: 300,
  fluidWheelZoomMinSpeed: 6,
  fluidWheelZoomMaxSpeed: 8,
});

// Continuous per-frame maxBounds clamp. Same geometry as map._limitCenter,
// minus its quantizers: _rebound rounds the correction to whole/half pixels
// (Math.round / Math.ceil / Math.floor) and _limitCenter drops corrections
// under 1px entirely. Both are fine for the one-shot setView calls they were
// written for, but fed back into a per-frame glide the quantized correction
// staircases in ~1px jumps against the smooth anchor path and the map judders
// — and since the clamp only bites while the view exceeds the bounds, it made
// exactly ZOOM-OUT shake while zoom-in stayed smooth. No deadband needed
// here: the result feeds _move directly (no pan loop to destabilize), and any
// sub-pixel residue left at moveend sits inside _panInsideMaxBounds' own 1px
// tolerance, so no snap-back pan fires.
function limitCenterSmooth(map, center, zoom) {
  if (!map.options.maxBounds) return center;
  const bounds = L.latLngBounds(map.options.maxBounds);
  const centerPoint = map.project(center, zoom);
  const viewHalf = map.getSize().divideBy(2);
  const projected = L.bounds(
    map.project(bounds.getNorthEast(), zoom),
    map.project(bounds.getSouthWest(), zoom),
  );
  const minOffset = projected.min.subtract(centerPoint.subtract(viewHalf));
  const maxOffset = projected.max.subtract(centerPoint.add(viewHalf));
  const rebound = (left, right) => (
    left + right > 0
      ? (left - right) / 2                       // view can't fit: center it
      : Math.max(0, left) - Math.max(0, right)   // push fully inside
  );
  const dx = rebound(minOffset.x, -maxOffset.x);
  const dy = rebound(minOffset.y, -maxOffset.y);
  if (dx === 0 && dy === 0) return center;
  return map.unproject(centerPoint.add(L.point(dx, dy)), zoom);
}

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

      map._stop();
      if (map._panAnim) map._panAnim.stop();

      this._goalZoom = map.getZoom();
      this._prevCenter = map.getCenter();
      this._prevZoom = map.getZoom();

      // Trivial landed segment at the current zoom; the first _onWheeling
      // retargets from it with velocity 0.
      this._segT0 = performance.now();
      this._segZ0 = this._goalZoom;
      this._segV0 = 0;
      this._segGoal = this._goalZoom;
      this._segDur = 0;

      this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
    },

    _onWheeling(e) {
      const map = this._map;
      const opts = map.options;

      const raw = L.DomEvent.getWheelDelta(e) * 0.003 * opts.fluidWheelZoomSensitivity;
      if (raw !== 0) {
        const cur = map.getZoom();
        // A continuously retargeted Hermite segment cruises at 1.5·lead/T
        // (its stable equilibrium: acceleration is zero when velocity =
        // 1.5·(goal-zoom)/duration), so bounding the goal's lead over the
        // live zoom pins the sustained rate into [minSpeed, maxSpeed]
        // levels/sec regardless of what deltas the wheel hardware emits.
        const leadPerSpeed = opts.fluidWheelZoomEase / 1500;
        const minSpeed = Math.max(0, opts.fluidWheelZoomMinSpeed);
        const maxSpeed = Math.max(minSpeed, opts.fluidWheelZoomMaxSpeed);
        const dir = raw > 0 ? 1 : -1;

        const goal = this._goalZoom + raw;
        // lead measured in the direction of THIS event, so a reversal notch
        // mid-glide bites immediately instead of shaving old momentum
        const lead = (goal - cur) * dir;
        const clamped = Math.min(maxSpeed * leadPerSpeed, Math.max(minSpeed * leadPerSpeed, lead));
        let next = cur + clamped * dir;

        if (next < map.getMinZoom() || next > map.getMaxZoom()) {
          next = map._limitZoom(next);
        }
        this._goalZoom = next;

        // Land on whole zoom levels: the segment target is the fractional
        // intent rounded to the nearest zoomSnap increment (default 1), so
        // the glide always comes to REST on an integer zoom — a fractional
        // rest leaves raster tiles permanently CSS-scaled, i.e. shrunken or
        // blurry label text. Snapped at WHEEL time so it is all one
        // continuous motion; snapping at IDLE instead (tried, reverted)
        // moved the map again after the wheel had stopped and read as the
        // map acting on its own. The speed pinning above keeps `next`
        // strictly beyond the live zoom, so the rounded target is always
        // ahead: mid-glide a notch may be absorbed by a target already
        // queued a level ahead, but from rest (always an integer now) one
        // notch is exactly one level, and no notch ever reads dead or
        // reversed.
        //
        // The app sets zoomSnap: 0 on every map (SafeMapContainer) to free
        // mobile PINCH from TouchZoom's end-of-gesture snap, so zoomSnap
        // cannot double as this snap's size — the wheel hard-snaps to whole
        // levels via `|| 1`. Integer wheel rest is a product rule (raster
        // labels stay 1:1 crisp), and unlike a pinch, a wheel gesture
        // carries no fractional intent worth honoring. A map that really
        // sets zoomSnap to a finer increment (e.g. 0.5) is still honored.
        const snap = (L.Browser.any3d ? map.options.zoomSnap : 1) || 1;
        const target = Math.max(
          map.getMinZoom(),
          Math.min(map.getMaxZoom(), Math.round(next / snap) * snap),
        );

        // C1 retarget: the new segment starts from the glide's EXACT current
        // zoom and velocity, so consecutive notches chain into one continuous
        // motion instead of hitching to a fresh curve each event.
        if (target !== this._segGoal) {
          const now = performance.now();
          const state = this._glideState(now);
          this._segT0 = now;
          this._segZ0 = state[0];
          this._segV0 = state[1];
          this._segGoal = target;
          this._segDur = opts.fluidWheelZoomEase;
        }
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
    // Convergence is measured against _segGoal (the snapped landing target),
    // NOT _goalZoom — that is the fractional intent accumulator, which can
    // sit up to half a level away from where the glide actually lands, and
    // comparing against it would keep this poller re-arming forever (gesture
    // never commits, moveend never fires, tiles never finalize).
    _onWheelIdle() {
      if (!this._isWheeling) return;
      if (Math.abs(this._segGoal - this._map.getZoom()) > 0.002) {
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

    // Exact [zoom, velocity(levels/ms)] of the glide at time `now`: a cubic
    // Hermite from (_segZ0, velocity _segV0) to (_segGoal, velocity 0) over
    // _segDur ms. Lands ON the goal with zero terminal velocity in bounded
    // time — no asymptotic sub-pixel creep (which shimmers against Leaflet's
    // whole-pixel transform rounding) and no constant-rate touchdown clunk.
    // Evaluated on absolute time: a dropped or janky frame samples the same
    // smooth curve instead of compounding integration error.
    _glideState(now) {
      const T = this._segDur;
      const s = T > 0 ? (now - this._segT0) / T : 1;
      if (s >= 1) return [this._segGoal, 0];
      const s2 = s * s;
      const s3 = s2 * s;
      return [
        (2 * s3 - 3 * s2 + 1) * this._segZ0
          + (s3 - 2 * s2 + s) * T * this._segV0
          + (3 * s2 - 2 * s3) * this._segGoal,
        (6 * s2 - 6 * s) * (this._segZ0 - this._segGoal) / T
          + (3 * s2 - 4 * s + 1) * this._segV0,
      ];
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

      const cur = map.getZoom();
      const zoom = this._glideState(performance.now())[0];

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
        // snap-back on moveend. Clamp every frame like setView would, but with
        // the continuous variant above — stock _limitCenter's whole-pixel
        // quantization judders when applied per frame.
        center = limitCenterSmooth(map, center, zoom);

        if (!this._moved) {
          map._moveStart(true, false);
          this._moved = true;
        }

        // The flyTo tag routes GridLayer onto its ANIMATED tile path, exactly
        // like a real flyTo frame (pinch uses {pinch:true} the same way). An
        // untagged _move makes GridLayer._resetView treat every frame as a
        // one-shot view change: _abortLoading (kills in-flight tile fetches),
        // _updateLevels, _resetGrid, _update (re-queues the same fetches) and
        // an immediate _pruneTiles — 60x/second. Zoom-in survives it because
        // the coarse backfill is already loaded; zoom-out needs to FETCH its
        // parent tiles, and per-frame abort+prune removed the old fine tiles
        // before replacements could ever land — popping, grey gaps, tile
        // density lagging the camera. The animated path defers pruning until
        // the queued tiles finish loading (+250ms fade), so old tiles keep
        // covering the view until the new level is actually ready.
        map._move(center, zoom, { flyTo: true });
        this._prevCenter = map.getCenter();
        this._prevZoom = map.getZoom();
      }

      this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
    },
  });

  L.Map.addInitHook('addHandler', 'fluidWheelZoom', L.Map.FluidWheelZoom);
}

export default L.Map.FluidWheelZoom;
