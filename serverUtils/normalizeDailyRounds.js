const MAX_SCORE_PER_ROUND = 5000;
const MAX_XP_PER_ROUND = 100;
const EARTH_RADIUS_KM = 6371;

function clampRoundScore(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SCORE_PER_ROUND, Math.floor(n)));
}

function xpFromRoundScore(score) {
  const xp = Math.round(score / 50);
  return Math.max(0, Math.min(MAX_XP_PER_ROUND, xp));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Server-authoritative normalization of client-submitted daily rounds.
// The client's `score` is clamped (not trusted outright); distance is
// recomputed from the canonical daily `actualLocations` + the client's
// guess coords. Shared between the logged-in and guest submit branches.
export function normalizeDailyRounds(rounds, actualLocations) {
  return rounds.map((r, i) => {
    const score = clampRoundScore(r?.score);
    const guessLat = Number.isFinite(r?.guessLat) ? r.guessLat : null;
    const guessLng = Number.isFinite(r?.guessLng) ? r.guessLng : null;
    const actual = actualLocations[i];
    const distance = actual && guessLat != null && guessLng != null
      ? haversineKm(actual.lat, actual.long, guessLat, guessLng)
      : null;
    return {
      score,
      xp: xpFromRoundScore(score),
      distance,
      timeMs: Number.isFinite(r?.timeMs) ? r.timeMs : null,
      guessLat,
      guessLng,
      country: actual?.country ?? (typeof r?.country === 'string' ? r.country : null),
    };
  });
}

export { MAX_SCORE_PER_ROUND, MAX_XP_PER_ROUND };
