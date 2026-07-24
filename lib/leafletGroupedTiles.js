import L from 'leaflet';

/**
 * Grouped raster updates for smooth zooms.
 *
 * With GridLayer.updateWhenZooming=false, Leaflet CSS-scales the current
 * tile level through an entire flyTo / pinch / fluid-wheel gesture and only
 * swaps rasters when the camera settles. That prevents the jarring
 * "labels jump size every integer level" effect on a fast multi-level zoom.
 *
 * Two extras on top of stock Leaflet:
 *   1. moveend sync — stock _update only calls _setView when
 *      |mapZoom - tileZoom| > 1, so a one-level gesture with
 *      updateWhenZooming=false can leave permanently scaled tiles. We force
 *      a level sync whenever the rounded camera zoom disagrees.
 *   2. prepareGroupedTileLevel — fluid wheel preloads ONLY the final
 *      integer level once a wheel burst goes idle, so the crossfade can
 *      start during the coast instead of waiting for moveend. Intermediate
 *      levels crossed mid-burst are never requested.
 *   3. held-pinch preload — once the rounded pinch target remains stable
 *      briefly, request that one level while the fingers are still down.
 *      Fast pinches that cross several levels replace the pending target
 *      instead of loading every level. A minimum interval prevents decode /
 *      DOM work from stealing frames during a slow, long pinch.
 *
 * fadeAnimation on the map must stay enabled: new tiles fade 0→1 over
 * ~220ms while the previous level is held until the crossfade finishes.
 */

const TILE_FADE_MS = 220;
const TILE_PRUNE_AFTER_FADE_MS = 270;
const PINCH_TARGET_STABLE_MS = 90;
const PINCH_PREPARE_MIN_INTERVAL_MS = 180;
const PINCH_SNAP_EPSILON = 0.01;
const PINCH_DIRECTION_THRESHOLD = 0.01;
const WORLD_PINCH_SNAP_MAX_ZOOM = 5;
const WORLD_PINCH_SNAP_STEP = 0.25;
const PINCH_SETTLE_MS = 300;

if (!L.GridLayer.prototype._groupedTiles) {
  L.GridLayer.prototype._groupedTiles = true;

  // Leaflet 1.9.4 ships `plus-lighter` specifically to join Chromium's
  // independently rasterized tile edges during a fractional zoom. Disabling
  // it globally exposes one-frame grid lines while the parent level is scaled.
  // It is only reliable on quarter-step DPRs, though, and Android/iOS WebViews
  // can turn it into a white grid. Keep normal compositing there; on supported
  // desktop Chromium let Leaflet's native CSS workaround apply. This changes
  // no tile geometry or sampling, so sharpness and zoom-frame cost stay intact.
  const dpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);
  const useChromiumSeamBlend = L.Browser.chrome
    && !L.Browser.mobile
    && Math.abs(dpr * 4 - Math.round(dpr * 4)) < 0.001;
  const origInitTile = L.GridLayer.prototype._initTile;
  L.GridLayer.prototype._initTile = function (tile) {
    origInitTile.call(this, tile);
    if (this.options.updateWhenZooming === false) {
      tile.style.mixBlendMode = useChromiumSeamBlend && tile.tagName === 'IMG'
        ? ''
        : 'normal';
    }
  };

  // A small cushion over Leaflet's stock 200ms: visible, but not sluggish.
  const origUpdateOpacity = L.GridLayer.prototype._updateOpacity;
  L.GridLayer.prototype._updateOpacity = function () {
    if (!this._map) return;
    if (!this._map._fadeAnimated) {
      return origUpdateOpacity.call(this);
    }

    // IE doesn't inherit filter opacity properly — stock path handles it.
    if (L.Browser.ielt9) {
      return origUpdateOpacity.call(this);
    }

    L.DomUtil.setOpacity(this._container, this.options.opacity);

    const now = +new Date();
    let nextFrame = false;
    let willPrune = false;

    for (const key in this._tiles) {
      const tile = this._tiles[key];
      if (!tile.current || !tile.loaded) continue;

      const fade = Math.min(1, (now - tile.loaded) / TILE_FADE_MS);
      L.DomUtil.setOpacity(tile.el, fade);
      if (fade < 1) {
        nextFrame = true;
      } else {
        if (tile.active) {
          willPrune = true;
        } else {
          this._onOpaqueTile(tile);
        }
        tile.active = true;
      }
    }

    if (willPrune && !this._noPrune) this._pruneTiles();

    if (nextFrame) {
      L.Util.cancelAnimFrame(this._fadeFrame);
      this._fadeFrame = L.Util.requestAnimFrame(this._updateOpacity, this);
    }
  };

  // Match prune delay to the longer crossfade (stock waits 250ms for 200ms fade).
  const origTileReady = L.GridLayer.prototype._tileReady;
  L.GridLayer.prototype._tileReady = function (coords, err, tile) {
    if (!this._map?._fadeAnimated) {
      return origTileReady.call(this, coords, err, tile);
    }

    if (err) {
      this.fire('tileerror', { error: err, tile, coords });
    }

    const key = this._tileCoordsToKey(coords);
    tile = this._tiles[key];
    if (!tile) return;

    tile.loaded = +new Date();
    L.DomUtil.setOpacity(tile.el, 0);
    L.Util.cancelAnimFrame(this._fadeFrame);
    this._fadeFrame = L.Util.requestAnimFrame(this._updateOpacity, this);

    if (!err) {
      L.DomUtil.addClass(tile.el, 'leaflet-tile-loaded');
      this.fire('tileload', { tile: tile.el, coords });
    }

    if (this._noTilesToLoad()) {
      this._loading = false;
      this.fire('load');
      // Stock Leaflet's untracked 250ms timer ignores _noPrune. Keep exactly
      // one cancelable timer instead: if a grouped transition still owns the
      // old level, its release timer will prune after the final tile fades.
      clearTimeout(this._groupedTileLoadPruneTimer);
      this._groupedTileLoadPruneTimer = setTimeout(() => {
        delete this._groupedTileLoadPruneTimer;
        if (!this._map || this._noPrune) return;
        try { this._pruneTiles(); } catch (_) { /* unmounted */ }
      }, TILE_PRUNE_AFTER_FADE_MS);
    }
  };

  // Force a tile-level sync on moveend when updateWhenZooming is off.
  const origOnMoveEnd = L.GridLayer.prototype._onMoveEnd;
  L.GridLayer.prototype._onMoveEnd = function () {
    if (!this._map || this._map._animatingZoom) return;
    // Desktop GridLayer wires this same method to a 200ms-throttled `move`
    // event. Ignore those callbacks during a grouped +/- glide; the animator
    // prepares its one final level before the real moveend.
    if (this._map._groupedControlZoomState?.active) return;

    if (this.options.updateWhenZooming === false) {
      const zoom = this._map.getZoom();
      const tileZoom = Math.round(zoom);
      if (this._tileZoom !== tileZoom) {
        // noPrune so the outgoing level can crossfade under the new tiles.
        this._setView(this._map.getCenter(), zoom, true, false);
        // Allow prune once the fade marks new tiles active.
        this._noPrune = false;
        return;
      }
    }

    return origOnMoveEnd.call(this);
  };
}

/**
 * Preload exactly one GridLayer level for a settled fluid-wheel target.
 * Keeps the currently visible level as the crossfade base, then restores
 * transforms to the LIVE camera so the preload doesn't jump tiles ahead
 * of markers mid-glide.
 */
export function prepareGroupedTileLevel(map, targetCenter, targetZoom) {
  if (!map?.eachLayer) return;

  const liveCenter = map.getCenter();
  const liveZoom = map.getZoom();

  map.eachLayer((layer) => {
    if (!(layer instanceof L.GridLayer) || layer.options.updateWhenZooming !== false) {
      return;
    }

    try {
      const roundedTarget = Math.round(targetZoom);
      // Never restart an in-flight load for the same level. TileLayer's
      // _setView calls _abortLoading; repeating it here was the main source
      // of a hitch when pinch-end arrived while the held-pinch preload was
      // already decoding. Preserve its existing load/release timers too.
      if (layer._tileZoom === roundedTarget) {
        layer._setZoomTransforms(liveCenter, liveZoom);
        return;
      }

      clearTimeout(layer._groupedTileReleaseTimer);
      delete layer._groupedTileReleaseTimer;
      clearTimeout(layer._groupedTileLoadPruneTimer);
      delete layer._groupedTileLoadPruneTimer;
      if (layer._groupedTileRelease) {
        layer.off('load', layer._groupedTileRelease);
        delete layer._groupedTileRelease;
      }

      // noPrune=true keeps the currently visible level as the crossfade base.
      layer._setView(targetCenter, targetZoom, true, false);
      layer._setZoomTransforms(liveCenter, liveZoom);

      const release = () => {
        if (layer._groupedTileRelease !== release) return;
        layer.off('load', release);
        delete layer._groupedTileRelease;
        clearTimeout(layer._groupedTileReleaseTimer);
        // `load` means the final tile has only just entered at opacity 0.
        // Hold the outgoing level for the complete short fade, then prune once.
        layer._groupedTileReleaseTimer = setTimeout(() => {
          delete layer._groupedTileReleaseTimer;
          if (!layer._map) return;
          layer._noPrune = false;
          try { layer._pruneTiles(); } catch (_) { /* unmounted */ }
        }, TILE_PRUNE_AFTER_FADE_MS);
      };

      if (layer.isLoading()) {
        layer._groupedTileRelease = release;
        layer.once('load', release);
      } else {
        // Cached hit: still hold the old level through the soft fade window.
        layer._groupedTileRelease = release;
        release();
      }
    } catch (_) {
      // Map can unmount mid-round-transition.
    }
  });
}

function clearPinchPrepare(handler, resetTarget = false) {
  clearTimeout(handler._groupedPinchTimer);
  delete handler._groupedPinchTimer;
  if (resetTarget) {
    handler._groupedPinchCandidate = null;
    handler._groupedPinchPreparedTarget = null;
  }
}

function pinchTarget(handler) {
  const map = handler?._map;
  if (!map || !Number.isFinite(handler._zoom)) return null;

  const zoom = handler._zoom;
  // At world/continent scale a whole level is a 2x visual jump. Keep the
  // directional rule but use quarter-level rests there; once zoomed into a
  // place, return to whole levels for native-sharp labels.
  const step = zoom < WORLD_PINCH_SNAP_MAX_ZOOM ? WORLD_PINCH_SNAP_STEP : 1;
  const nearest = Math.round(zoom / step) * step;
  if (Math.abs(zoom - nearest) <= PINCH_SNAP_EPSILON) {
    return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), nearest));
  }

  // Nearest-level snapping can visibly reverse the user's final motion:
  // zooming in to 4.3 used to animate backward to 4. Follow the latest
  // meaningful pinch direction instead (in -> ceil, out -> floor). Fall back
  // to net gesture direction when the last move was below the noise floor.
  const direction = handler._groupedPinchDirection
    || Math.sign(zoom - handler._startZoom);
  const target = direction >= 0
    ? Math.ceil((zoom - PINCH_SNAP_EPSILON) / step) * step
    : Math.floor((zoom + PINCH_SNAP_EPSILON) / step) * step;
  return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), target));
}

function schedulePinchPrepare(handler) {
  if (!handler?._zooming || !handler._moved || !handler._center) return;

  const target = pinchTarget(handler);
  if (target == null || target === handler._groupedPinchCandidate) return;

  clearPinchPrepare(handler);
  handler._groupedPinchCandidate = target;

  const elapsed = Date.now() - (handler._groupedPinchPreparedAt || 0);
  const delay = Math.max(
    PINCH_TARGET_STABLE_MS,
    PINCH_PREPARE_MIN_INTERVAL_MS - elapsed,
  );

  handler._groupedPinchTimer = setTimeout(() => {
    delete handler._groupedPinchTimer;
    if (!handler._zooming || pinchTarget(handler) !== target) return;

    prepareGroupedTileLevel(handler._map, handler._center, target);
    handler._groupedPinchPreparedTarget = target;
    handler._groupedPinchPreparedAt = Date.now();
  }, delay);
}

// Leaflet hardcodes both its pinch-settle CSS transition and fallback timer to
// 250ms. Extend only this finger-up transition; other setView/double-click
// animations keep stock timing. A new interaction can still force-settle it
// immediately through leafletSettleZoomAnim.
if (!L.Map.prototype._groupedPinchSettle) {
  L.Map.prototype._groupedPinchSettle = true;

  if (typeof document !== 'undefined' && !document.getElementById('leaflet-grouped-pinch-style')) {
    const style = document.createElement('style');
    style.id = 'leaflet-grouped-pinch-style';
    style.textContent = `
      .leaflet-slow-pinch-settle .leaflet-zoom-animated {
        transition-duration: ${PINCH_SETTLE_MS}ms !important;
        transition-timing-function: linear !important;
      }
    `;
    document.head.appendChild(style);
  }

  const origZoomTransitionEnd = L.Map.prototype._onZoomTransitionEnd;
  L.Map.prototype._onZoomTransitionEnd = function () {
    const remaining = (this._groupedPinchSettleUntil || 0) - performance.now();
    if (remaining > 1 && this._animatingZoom) {
      clearTimeout(this._groupedPinchSettleTimer);
      this._groupedPinchSettleTimer = setTimeout(
        () => this._onZoomTransitionEnd(),
        remaining + 1,
      );
      return;
    }

    clearTimeout(this._groupedPinchSettleTimer);
    delete this._groupedPinchSettleTimer;
    delete this._groupedPinchSettleUntil;
    this._container?.classList.remove('leaflet-slow-pinch-settle');
    return origZoomTransitionEnd.call(this);
  };
}

// TouchZoom normally defers every updateWhenZooming=false raster request until
// finger-up. Begin one grouped request after a 90ms-stable rounded target while
// the pinch is still held. This hides network/decode time under the gesture
// without restoring Leaflet's expensive per-frame/per-level tile churn.
if (L.Map.TouchZoom && !L.Map.TouchZoom.prototype._groupedTiles) {
  const touchZoom = L.Map.TouchZoom.prototype;
  touchZoom._groupedTiles = true;

  const origTouchStart = touchZoom._onTouchStart;
  touchZoom._onTouchStart = function (event) {
    clearPinchPrepare(this, true);
    this._groupedPinchPreparedAt = 0;
    this._groupedPinchDirection = 0;
    this._groupedPinchDirectionTravel = 0;
    const result = origTouchStart.call(this, event);
    this._groupedPinchLastZoom = this._startZoom;
    return result;
  };

  const origTouchMove = touchZoom._onTouchMove;
  touchZoom._onTouchMove = function (event) {
    const result = origTouchMove.call(this, event);
    if (Number.isFinite(this._zoom)) {
      const delta = this._zoom - this._groupedPinchLastZoom;
      this._groupedPinchDirectionTravel += delta;
      if (Math.abs(this._groupedPinchDirectionTravel) >= PINCH_DIRECTION_THRESHOLD) {
        this._groupedPinchDirection = Math.sign(this._groupedPinchDirectionTravel);
        this._groupedPinchDirectionTravel = 0;
      }
      this._groupedPinchLastZoom = this._zoom;
    }
    schedulePinchPrepare(this);
    return result;
  };

  const origTouchEnd = touchZoom._onTouchEnd;
  touchZoom._onTouchEnd = function (event) {
    const target = pinchTarget(this);
    const shouldPrepare = this._zooming
      && this._moved
      && this._center
      && target != null
      && target !== this._groupedPinchPreparedTarget;

    clearPinchPrepare(this);
    // Quick pinches may end before the stability window. Start their single
    // final request immediately, before Leaflet's snap animation, so loading
    // overlaps that animation instead of beginning after it.
    if (shouldPrepare) {
      prepareGroupedTileLevel(this._map, this._center, target);
      this._groupedPinchPreparedTarget = target;
    }

    // TouchZoom's original end path runs _zoom through nearest rounding.
    // Feed it our already-clamped directional target so the CSS settle can
    // never travel opposite to the user's final pinch direction.
    if (target != null) {
      this._zoom = target;
      const map = this._map;
      if (
        map.options.zoomAnimation
        && Math.abs(target - map.getZoom()) > PINCH_SNAP_EPSILON
      ) {
        map._groupedPinchSettleUntil = performance.now() + PINCH_SETTLE_MS;
        map._container?.classList.add('leaflet-slow-pinch-settle');
      }
    }

    // TouchZoom asks _limitZoom one final time. Temporarily expose the low-
    // zoom quarter step for that synchronous calculation, then restore the
    // app-wide whole-level snap used by all other camera operations.
    const map = this._map;
    const previousZoomSnap = map.options.zoomSnap;
    if (target != null && target < WORLD_PINCH_SNAP_MAX_ZOOM) {
      map.options.zoomSnap = WORLD_PINCH_SNAP_STEP;
    }
    let result;
    try {
      result = origTouchEnd.call(this, event);
    } finally {
      map.options.zoomSnap = previousZoomSnap;
    }
    this._groupedPinchCandidate = null;
    this._groupedPinchPreparedTarget = null;
    this._groupedPinchDirection = 0;
    this._groupedPinchDirectionTravel = 0;
    return result;
  };

  const origRemoveHooks = touchZoom.removeHooks;
  touchZoom.removeHooks = function () {
    clearPinchPrepare(this, true);
    return origRemoveHooks.call(this);
  };
}

export default true;
