import L from 'leaflet';
import { prepareGroupedTileLevel } from '@/lib/leafletGroupedTiles';

/**
 * Smooth, retargetable +/- control zoom.
 *
 * Leaflet's stock control starts a 250ms CSS zoom for every click. A second
 * click during that transition either gets swallowed or forces the first
 * transition to finish immediately before starting another, which looks like
 * a series of hard jumps. This animator folds rapid clicks into one integer
 * target and carries the current velocity into every retarget.
 *
 * GridLayer.updateWhenZooming=false means the rAF loop only transforms the
 * existing raster level. The final level is requested once and crossfaded by
 * leafletGroupedTiles, so rapid button presses add no intermediate tile churn.
 */

const CONTROL_SEGMENT_MS = 240;
const MAX_CONTROL_VELOCITY = 0.012; // zoom levels / ms

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
      ? (left - right) / 2
      : Math.max(0, left) - Math.max(0, right)
  );
  const dx = rebound(minOffset.x, -maxOffset.x);
  const dy = rebound(minOffset.y, -maxOffset.y);
  if (dx === 0 && dy === 0) return center;
  return map.unproject(centerPoint.add(L.point(dx, dy)), zoom);
}

function glideState(state, now) {
  const T = state.segDur;
  const s = T > 0 ? (now - state.segT0) / T : 1;
  if (s >= 1) return [state.segGoal, 0, true];

  const s2 = s * s;
  const s3 = s2 * s;
  return [
    (2 * s3 - 3 * s2 + 1) * state.segZ0
      + (s3 - 2 * s2 + s) * T * state.segV0
      + (3 * s2 - 2 * s3) * state.segGoal,
    (6 * s2 - 6 * s) * (state.segZ0 - state.segGoal) / T
      + (3 * s2 - 4 * s + 1) * state.segV0,
    false,
  ];
}

// Anchored glides (double-tap) keep the tapped point stationary: the center
// is re-derived from the anchor every frame, exactly like setZoomAround
// would, but continuously along the glide.
function glideCenter(map, state, zoom) {
  if (!state.anchorLatLng) return state.baseCenter;
  return map.unproject(
    map.project(state.anchorLatLng, zoom).subtract(state.anchorOffset),
    zoom,
  );
}

function cancelControlZoom(map) {
  const state = map?._groupedControlZoomState;
  if (!state?.active) return;

  state.active = false;
  cancelAnimationFrame(state.raf);
  if (state.moved) {
    state.moved = false;
    map._moveEnd(true);
  }
}

function finishControlZoom(map, state) {
  if (!state.active || map._groupedControlZoomState !== state) return;

  const center = limitCenterSmooth(map, glideCenter(map, state, state.segGoal), state.segGoal);
  map._move(center, state.segGoal, { flyTo: true });
  prepareGroupedTileLevel(map, center, state.segGoal);

  state.active = false;
  state.moved = false;
  map._moveEnd(true);
}

function updateControlZoom(map, state) {
  if (!state.active || map._groupedControlZoomState !== state || !map._loaded) return;

  const [rawZoom, , done] = glideState(state, performance.now());
  const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), rawZoom));
  const center = limitCenterSmooth(map, glideCenter(map, state, zoom), zoom);

  if (!state.moved) {
    map._moveStart(true, false);
    state.moved = true;
  }
  map._move(center, zoom, { flyTo: true });

  if (done) {
    finishControlZoom(map, state);
    return;
  }
  state.raf = requestAnimationFrame(() => updateControlZoom(map, state));
}

function controlZoomBy(map, delta, anchorPoint) {
  if (!map?._loaded || !delta) return;

  const now = performance.now();
  let state = map._groupedControlZoomState;

  if (!state?.active) {
    // Finish any unrelated CSS/fly/pan motion before taking ownership.
    map._stop();
    const zoom = map.getZoom();
    const goal = Math.max(
      map.getMinZoom(),
      Math.min(map.getMaxZoom(), Math.round(zoom) + delta),
    );
    if (goal === zoom) return;

    state = {
      active: true,
      moved: false,
      baseCenter: map.getCenter(),
      anchorLatLng: null,
      anchorOffset: null,
      segT0: now,
      segZ0: zoom,
      segV0: 0,
      segGoal: goal,
      segDur: CONTROL_SEGMENT_MS,
      raf: null,
    };
    if (anchorPoint) {
      state.anchorLatLng = map.containerPointToLatLng(anchorPoint);
      state.anchorOffset = L.point(anchorPoint).subtract(map.getSize().divideBy(2));
      // Double-tap parity with the CSS path it replaces, which kicked off
      // the destination-level fetch at animation start: load under the
      // glide so tiles fade in as the camera lands.
      try { prepareGroupedTileLevel(map, glideCenter(map, state, goal), goal); } catch {}
    }
    map._groupedControlZoomState = state;
    state.raf = requestAnimationFrame(() => updateControlZoom(map, state));
    return;
  }

  const [zoom, velocity] = glideState(state, now);
  // A new tap re-anchors mid-glide; +/- clicks keep whatever anchor the
  // glide already follows (continuity beats a mid-flight recenter jump).
  if (anchorPoint) {
    state.anchorLatLng = map.containerPointToLatLng(anchorPoint);
    state.anchorOffset = L.point(anchorPoint).subtract(map.getSize().divideBy(2));
  }
  const goal = Math.max(
    map.getMinZoom(),
    Math.min(map.getMaxZoom(), state.segGoal + delta),
  );
  if (goal === state.segGoal) return;

  // C1 retarget: continue from the exact in-flight zoom and velocity instead
  // of restarting ease-out from zero on every click.
  state.segT0 = now;
  state.segZ0 = zoom;
  state.segV0 = Math.max(
    -MAX_CONTROL_VELOCITY,
    Math.min(MAX_CONTROL_VELOCITY, velocity),
  );
  state.segGoal = goal;
  state.segDur = CONTROL_SEGMENT_MS;
}

if (!L.Map.prototype._groupedZoomControls) {
  L.Map.prototype._groupedZoomControls = true;

  // Any non-control motion owns the camera once it calls _stop.
  const origStop = L.Map.prototype._stop;
  L.Map.prototype._stop = function () {
    cancelControlZoom(this);
    return origStop.call(this);
  };

  const zoomControl = L.Control.Zoom?.prototype;
  if (zoomControl) {
    zoomControl._zoomIn = function (event) {
      if (!this._disabled && this._map.getZoom() < this._map.getMaxZoom()) {
        const multiplier = event?.shiftKey ? 3 : 1;
        controlZoomBy(this._map, this._map.options.zoomDelta * multiplier);
      }
    };

    zoomControl._zoomOut = function (event) {
      if (!this._disabled && this._map.getZoom() > this._map.getMinZoom()) {
        const multiplier = event?.shiftKey ? 3 : 1;
        controlZoomBy(this._map, -this._map.options.zoomDelta * multiplier);
      }
    };
  }

  // Double-click / double-tap zoom rides the same glide instead of Leaflet's
  // 250ms CSS zoom animation. Under the canvas tile compositor the CSS path
  // can only magnify the already-drawn bitmap (2x = visibly blurry, and
  // tiles arriving mid-animation got painted into the pre-tap frame at half
  // resolution). The glide is per-frame scripted zoom, which the compositor
  // redraws at full resolution every frame — double-tap stays as crisp as
  // wheel zoom, and the tapped point stays anchored throughout.
  const dblClickZoom = L.Map.DoubleClickZoom?.prototype;
  if (dblClickZoom) {
    dblClickZoom._onDoubleClick = function (e) {
      const map = this._map;
      const delta = map.options.zoomDelta * (e.originalEvent?.shiftKey ? -1 : 1);
      if (map.options.doubleClickZoom === 'center') {
        controlZoomBy(map, delta);
      } else {
        controlZoomBy(map, delta, e.containerPoint);
      }
    };
  }

  L.Map.addInitHook(function () {
    this.on('unload', () => cancelControlZoom(this));
  });
}

export default true;
