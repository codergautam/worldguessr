// Daily Challenge percentile shared by web and mobile (results + landing).
//
// "Beat X% of OTHER players" → denominator is totalPlays - 1, so rank #1
// shows 100%, not (N-1)/N. Must stay identical to the server's derivation in
// api/dailyChallenge/submit.js (computeRankAndPercentile) so a fresh submit
// and a later revisit render the same number.
export function derivePercentile(rank, totalPlays) {
  if (typeof rank !== 'number' || !(totalPlays > 1)) return null;
  return Math.round(Math.max(0, Math.min(100, ((totalPlays - rank) / (totalPlays - 1)) * 100)));
}
