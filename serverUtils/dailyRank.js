import DailyChallengeScore from '../models/DailyChallengeScore.js';

// Exact daily-challenge rank: counts the rows the top-100 board renders
// (non-DQ, non-hidden DailyChallengeScore for the date), replacing the old
// bucket-histogram approximation that collapsed everyone in a 500-point
// bucket to one best-case rank ("#18" on the results screen vs #22 on the
// board). Single implementation shared by results.js and submit.js so the
// two read surfaces can't drift.
//
// Ties mirror the board's { score: -1, submittedAt: 1 } sort: pass the
// caller's committed submittedAt so only earlier ties count as ahead (the
// caller's own row can never match either count — its score isn't greater
// than itself, its submittedAt isn't earlier than itself). Fresh submits
// omit it (every existing tie predates the row being written) and pass
// excludeUserId so the count is right whether or not their own row-create,
// running in parallel, has committed yet. Rows sharing the exact same
// (score, submittedAt) millisecond both get the same rank — standard
// competition ranking.
//
// Known, accepted delta vs the rendered board: leaderboard.js additionally
// post-filters rows whose OWNER is banned/pendingNameChange at render time.
// Mirroring that would mean joining User docs for every row above the
// caller on every rank read; the ban path already flips hidden=true at
// scrub time, so the residue is pendingNameChange owners plus the narrow
// pre-scrub race — both of which the old bucket rank counted too.
export async function exactDailyRank(date, score, { excludeUserId = null, submittedAt = null } = {}) {
  const base = { date, disqualified: { $ne: true }, hidden: { $ne: true } };
  if (excludeUserId) base.userId = { $ne: excludeUserId };
  const [strictlyAbove, tiedAhead] = await Promise.all([
    DailyChallengeScore.countDocuments({ ...base, score: { $gt: score } }),
    submittedAt
      ? DailyChallengeScore.countDocuments({ ...base, score, submittedAt: { $lt: submittedAt } })
      : DailyChallengeScore.countDocuments({ ...base, score }),
  ]);
  return strictlyAbove + tiedAhead + 1;
}
