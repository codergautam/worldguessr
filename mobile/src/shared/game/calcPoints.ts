/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in kilometers
 */
export function findDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  try {
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  } catch (e) {
    console.log(e);
    return 0;
  }
}

export interface CalcPointsParams {
  lat: number;
  lon: number;
  guessLat: number;
  guessLon: number;
  usedHint?: boolean;
  maxDist: number;
}

/**
 * Calculate points based on distance from actual location
 * @returns Points earned (0-5000)
 */
export function calcPoints({ lat, lon, guessLat, guessLon, usedHint = false, maxDist }: CalcPointsParams): number {
  const dist = findDistance(lat, lon, guessLat, guessLon);
  let pts = 5000 * Math.E ** (-10 * (dist / maxDist));

  if (usedHint) pts = pts / 2;
  if (pts > 4997) pts = 5000;
  // If distance under 30m, give 5000 points
  if (dist < 0.03) pts = 5000;

  return Math.round(pts);
}

export default calcPoints;
