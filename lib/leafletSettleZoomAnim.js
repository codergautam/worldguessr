import L from 'leaflet';

/**
 * Interrupted-zoom-animation settler.
 *
 * Leaflet's discrete zooms (zoom buttons, double-click, animated setView /
 * fitBounds) run as a ~250ms CSS transition. The map's LOGICAL center/zoom
 * jump to the target the moment the animation starts; _onZoomTransitionEnd
 * closes the books later (finishing _move + moveend), including via a 250ms
 * fallback timer. Interrupting that window causes (all verified against
 * leaflet-src 1.9.4):
 *
 *   1. Map._stop() — called by every motion starter: setView, flyTo, panTo,
 *      drag start, our fluid wheel zoom — cancels flyTo/pan animations but
 *      NOT a CSS zoom animation. The orphaned animation then completes later
 *      and _move's the camera BACK to its dead target, teleporting the view
 *      out from under whatever newer motion was running.
 *   2. _tryAnimatedZoom returns true ("handled") WITHOUT DOING ANYTHING while
 *      _animatingZoom is set, so an animated setView/fitBounds issued during
 *      a zoom animation is silently swallowed (camera just doesn't go).
 *   3. Vector renderers (SVG/canvas) re-baseline their transform reference on
 *      every moveend; a moveend inside the animation window bakes the FUTURE
 *      camera into the baseline while the panes are still mid-transition —
 *      polylines render scaled huge/blurry or shifted off their points.
 *   4. TouchZoom._onTouchStart refuses to start at all while _animatingZoom
 *      is set (it returns before even reaching _stop), so pinching during an
 *      animation is dead input on mobile.
 *
 * Fix — the same ruling as the mobile pinch desync fix (FINISH, never abort):
 * settle the animation synchronously via _onZoomTransitionEnd() the moment
 * anything new wants the camera. _onZoomTransitionEnd is idempotent (guards
 * on _animatingZoom) and lands the map exactly on the animation's target with
 * proper zoomend/moveend, so renderers reproject to a consistent state before
 * the new motion begins.
 *
 * Installed in two places:
 *   - Map._stop, which every motion starter already funnels through
 *   - capture-phase touchstart on the container, because of (4); this is the
 *     app-wide successor to the old game-map-only ZoomFix component and
 *     covers every map, notably the results maps used by the round-over
 *     screens and the mobile WebView. Touch-only on purpose: wheel zoom is
 *     our own handler (no CSS anims), and settling is also wired into _stop.
 */

if (!L.Map.prototype._settlesZoomAnim) {
  L.Map.prototype._settlesZoomAnim = true;

  const settle = (map) => {
    if (map && map._animatingZoom && map._onZoomTransitionEnd) {
      // A directional pinch gets a deliberately slower finger-up transition.
      // New input still wins immediately: clear that delay before asking the
      // shared transition-end wrapper to settle synchronously.
      map._groupedPinchSettleUntil = 0;
      clearTimeout(map._groupedPinchSettleTimer);
      delete map._groupedPinchSettleTimer;
      map._container?.classList.remove('leaflet-slow-pinch-settle');
      try { map._onZoomTransitionEnd(); } catch (e) { /* mid-teardown */ }
    }
  };

  const origStop = L.Map.prototype._stop;
  L.Map.prototype._stop = function () {
    settle(this);
    return origStop.call(this);
  };

  L.Map.addInitHook(function () {
    const onTouchStart = () => settle(this);
    this._container.addEventListener('touchstart', onTouchStart, true);
    this.on('unload', () => {
      if (this._container) {
        this._container.removeEventListener('touchstart', onTouchStart, true);
      }
    });
  });
}

export default true;
