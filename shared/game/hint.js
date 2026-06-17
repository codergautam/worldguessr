// Hint-circle geometry, ported verbatim from the web's components/Map.js so
// web + mobile draw the identical hint radius/offset. Pure — no platform APIs.
// Using a hint halves the round's points (see calcPoints `usedHint`).

const EARTH_RADIUS_M = 6371000;
const OLD_BASE_HINT_RADIUS_M_AT_EQUATOR = 5870363.8;

function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function destinationPoint(lat, lng, distanceMeters, bearingRadians) {
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lng * Math.PI) / 180;
  const angularDistance = distanceMeters / EARTH_RADIUS_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
  const normalizedLon = ((((lon2 * 180) / Math.PI + 540) % 360) - 180);
  return { lat: (lat2 * 180) / Math.PI, lng: normalizedLon };
}

/**
 * Returns the hint circle for a location: an offset center + radius (meters).
 * Deterministic per (location, round) so it never moves within a round.
 */
export function hintCircle(location, maxDist = 20000, round = 1, maxRadiusMeters = Infinity) {
  const maxDistScale = maxDist / 20000;
  const latScale = Math.abs(Math.cos((location.lat * Math.PI) / 180));
  // Cap the radius (caller-supplied): the web/world value (~0.9× Earth radius)
  // is a valid Leaflet geodesic circle but react-native-maps can't render a
  // near-hemisphere circle on its Mercator map — it silently fails to draw.
  // Capping before the offset keeps the answer inside the circle.
  const radiusMeters = Math.min(
    OLD_BASE_HINT_RADIUS_M_AT_EQUATOR * maxDistScale * latScale,
    maxRadiusMeters,
  );
  const seed = (round ?? 1) + Math.abs(location.lat * 1000 + location.long * 1000);
  const offsetAngle = seededRandom(seed * 3) * 2 * Math.PI;
  const offsetAmount = Math.sqrt(seededRandom(seed * 7)) * radiusMeters;
  const center = destinationPoint(location.lat, location.long, offsetAmount, offsetAngle);
  return { center, radiusMeters };
}
