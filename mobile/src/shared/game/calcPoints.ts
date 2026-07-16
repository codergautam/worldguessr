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

/** One candidate guess for the team best-guess pick. */
export interface TeamGuessEntry {
  id: string;
  team?: string | null;
  /** Rounded points for the guess (0 = no guess — never wins). */
  pts: number;
  /** Raw distance in km; missing/non-finite ranks last within a points tier. */
  dist?: number;
}

/**
 * Team best-guess reveals: pick ONE winner per team — highest points first,
 * exact point ties (capped 5000s / same rounded score between close teammates)
 * broken by raw distance, so only the physically closest guess gets the
 * enlarged pin + carrier credit. Port of web components/calcPoints.js
 * pickBestTeamGuessIds — keep in lockstep.
 */
export function pickBestTeamGuessIds(entries: TeamGuessEntry[]): Set<string> {
  const best: Record<string, { id: string; pts: number; dist: number }> = {};
  for (const e of entries) {
    if (!e.team || !(e.pts > 0)) continue;
    const dist = Number.isFinite(e.dist) ? (e.dist as number) : Infinity;
    const cur = best[e.team];
    if (!cur || e.pts > cur.pts || (e.pts === cur.pts && dist < cur.dist)) {
      best[e.team] = { id: e.id, pts: e.pts, dist };
    }
  }
  return new Set(Object.values(best).map((e) => e.id));
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
