/**
 * Run a synchronous Leaflet camera calculation with whole-level zoom
 * snapping, then immediately restore the map's normal zoomSnap option.
 *
 * Leaflet computes fitBounds/flyToBounds targets synchronously. Temporarily
 * using zoomSnap=1 therefore makes only the destination integral; flyTo still
 * traverses fractional zooms every animation frame, and zoomSnap=0 remains
 * available afterwards for free-form touch pinch gestures.
 */
function withWholeZoomSnap(map, operation) {
  if (!map?.options) return operation();

  const previousZoomSnap = map.options.zoomSnap;
  map.options.zoomSnap = 1;
  try {
    return operation();
  } finally {
    map.options.zoomSnap = previousZoomSnap;
  }
}

export function getWholeZoomBoundsTarget(map, bounds, options) {
  return withWholeZoomSnap(map, () => map._getBoundsCenterZoom(bounds, options));
}

export function fitBoundsAtWholeZoom(map, bounds, options) {
  return withWholeZoomSnap(map, () => map.fitBounds(bounds, options));
}

export function flyToBoundsAtWholeZoom(map, bounds, options) {
  return withWholeZoomSnap(map, () => map.flyToBounds(bounds, options));
}
