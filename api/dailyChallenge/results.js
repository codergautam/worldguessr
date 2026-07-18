import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats from '../../models/DailyChallengeStats.js';
import GuestProfile from '../../models/GuestProfile.js';
import GuestScore from '../../models/GuestScore.js';
import { isValidDailyDate } from '../../serverUtils/dailyChallenge.js';
import { effectiveStreak, isGraceDay } from '../../serverUtils/dailyStreak.js';
import { exactDailyRank } from '../../serverUtils/dailyRank.js';
import { invalidateDailyLeaderboardCache } from './leaderboard.js';

// The distribution is identical for every caller on the same date — cache for
// a few seconds. User-specific block is fetched separately and never cached.
// (The top-100 name board lives in leaderboard.js, fetched only when a player
// opens the leaderboard modal/sheet.)
const PUBLIC_TTL_MS = 10 * 1000;
const publicCache = new Map(); // date -> { expiresAt, payload }

async function fetchPublic(date) {
  const cached = publicCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  // Board row count runs alongside the stats read: the headline totalPlays
  // is floored at the rows actually on the board so it can never read below
  // a row-derived ownRank ("#25 of 24"). Legacy claim-backfilled scores are
  // rows without stats plays (counted forward since the claimGuestProgress
  // fix, but old dates keep the gap). Averages/buckets stay divided by the
  // stats count — those sums only ever included stats-counted plays.
  const [statsDoc, boardRows] = await Promise.all([
    DailyChallengeStats.findOne({ date }).lean(),
    DailyChallengeScore.countDocuments({ date, disqualified: { $ne: true }, hidden: { $ne: true } }),
  ]);

  const statsPlays = statsDoc?.totalPlays || 0;
  const roundSums = statsDoc?.roundScoreSums || [];
  const roundAverages = statsPlays > 0
    ? roundSums.map(s => Math.round((s || 0) / statsPlays))
    : roundSums.map(() => 0);

  const payload = {
    distribution: {
      totalPlays: Math.max(statsPlays, boardRows),
      avgScore: statsPlays > 0 ? Math.round((statsDoc.totalScore || 0) / statsPlays) : 0,
      buckets: statsDoc?.buckets || [],
      roundAverages,
    },
  };

  publicCache.set(date, { expiresAt: Date.now() + PUBLIC_TTL_MS, payload });
  // Prune old entries so the map stays bounded
  if (publicCache.size > 30) {
    const oldestKey = publicCache.keys().next().value;
    publicCache.delete(oldestKey);
  }
  return payload;
}

async function fetchGuestBlock(date, guestId) {
  const profile = await GuestProfile.findOne({ guestId }).lean();
  if (!profile) return null;

  const own = await GuestScore.findOne({ guestId, date })
    .select('score rounds totalTime disqualified submittedAt')
    .lean();

  const isDq = !!own?.disqualified;
  // Rank is meaningless for DQ markers — they're not in the distribution.
  // Guest rows live in GuestScore, never in the counted population, so this
  // is the hypothetical "where would I sit" rank under the board's tiebreak.
  const rank = own && !isDq ? await exactDailyRank(date, own.score, { submittedAt: own.submittedAt }) : null;
  const history = Array.isArray(profile?.daily?.history) ? profile.daily.history.slice(0, 30) : [];

  // Stale-streak guard: zero out a stored streak that's already lapsed so the
  // UI doesn't show "5-day streak" for someone whose last play was 4+ days ago.
  // Guests get no grace.
  const liveStreak = effectiveStreak({
    streak: profile?.daily?.streak || 0,
    lastDate: profile?.daily?.lastDate || null,
    graceDates: [],
    today: date,
  }, { allowGrace: false });

  return {
    username: null,
    streak: liveStreak,
    streakBest: profile?.daily?.streakBest || 0,
    // Guests don't get grace at all (allowGrace: false above), so this field
    // is always false here. Included for shape parity with the logged-in
    // response so the client doesn't need a different render path.
    graceDay: false,
    // A DQ still counts as "played" — the run is handled normally (date
    // locked, streak advanced per the July 9 ruling); only ranking surfaces
    // (score/rank/rounds, nulled below) treat it differently. Clients key the
    // menu badge / landing CTA off this and gate the start path on
    // disqualifiedToday.
    playedToday: !!own,
    disqualifiedToday: isDq,
    ownScore: isDq ? null : (own?.score ?? null),
    ownRank: rank,
    ownRounds: isDq ? null : (own?.rounds || null),
    ownTotalTime: isDq ? null : (own?.totalTime || null),
    history,
    personalBest: history.reduce((m, h) => Math.max(m, h.score || 0), 0),
    guest: true,
  };
}

async function fetchUserBlock(date, secret) {
  const user = await User.findOne({ secret })
    .select('_id username dailyStreak dailyStreakBest dailyHistory lastDailyDate dailyGraceUsedDates')
    .lean();
  if (!user) return null;

  const own = await DailyChallengeScore.findOne({ date, userId: user._id })
    .select('score rounds totalTime username disqualified submittedAt')
    .lean();

  const isDq = !!own?.disqualified;

  // Self-heal stale usernames on any DailyChallengeScore for this user. A
  // score can end up with username="Player" when it was written before the
  // user picked a username — via claimGuestProgress backfilling a same-day
  // guest score on sign-in, or a logged-in submit on a fresh Google account.
  // Unconditional whenever the user has a username — updateMany on no
  // matches is cheap and catches ALL stale dates (not just today's).
  // Skip DQ-marker rows: they're never on the leaderboard, so a non-canonical
  // username is harmless and we don't want to touch them.
  if (user.username) {
    try {
      const staleNames = [null, '', 'Player'];
      if (own && !isDq && own.username && own.username !== user.username) staleNames.push(own.username);
      const result = await DailyChallengeScore.updateMany(
        { userId: user._id, username: { $in: staleNames }, disqualified: { $ne: true } },
        { $set: { username: user.username } },
      );
      if (result.modifiedCount > 0) {
        // Clear all cached leaderboards — the repair can touch past dates too.
        for (const key of [...publicCache.keys()]) publicCache.delete(key);
        invalidateDailyLeaderboardCache();
      }
    } catch (err) {
      console.warn('[dailyChallenge/results] username heal failed:', err?.message);
    }
  }

  // Exact leaderboard-population rank (serverUtils/dailyRank.js). DQ markers
  // carry score=0 but aren't in the distribution, so no rank.
  const rank = own && !isDq ? await exactDailyRank(date, own.score, { submittedAt: own.submittedAt }) : null;

  const history = (user.dailyHistory || []).slice(0, 30);

  // Stale-streak guard: dailyStreak is only recomputed on submit, so a user
  // who missed the grace window still has an N-day count sitting in the DB.
  // Compute the live value here so every read surface (landing, menu badge,
  // results modal) shows 0 the moment the streak is actually lost.
  const streakInputs = {
    streak: user.dailyStreak || 0,
    lastDate: user.lastDailyDate,
    graceDates: user.dailyGraceUsedDates,
    today: date,
  };
  const liveStreak = effectiveStreak(streakInputs);
  // graceDay means: streak is alive today only because of the unused-grace
  // branch (diff=2 from lastDate, no grace consumed in last 7 days). If the
  // user doesn't play today, tomorrow's diff becomes 3 and the streak dies.
  // Don't surface graceDay once today is locked (played OR DQ'd) — nothing
  // is at risk in either case, the streak already advanced.
  const graceDay = !own && isGraceDay(streakInputs);

  return {
    username: user.username,
    streak: liveStreak,
    streakBest: user.dailyStreakBest || 0,
    graceDay,
    // Same rule as the guest block: a DQ still counts as "played" (streak
    // advanced, date locked); only ranking surfaces are nulled.
    playedToday: !!own,
    disqualifiedToday: isDq,
    ownScore: isDq ? null : (own?.score ?? null),
    ownRank: rank,
    ownRounds: isDq ? null : (own?.rounds || null),
    ownTotalTime: isDq ? null : (own?.totalTime || null),
    history,
    personalBest: history.reduce((m, h) => Math.max(m, h.score || 0), 0),
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, secret, guestId } = req.query;
  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  try {
    // Secret wins over guestId: a logged-in session is always the
    // authoritative identity. guestId is only consulted for unauthenticated
    // callers.
    //
    // We resolve the owner block FIRST (not in parallel with fetchPublic)
    // because the logged-in path's self-heal for stale usernames may
    // invalidate the public cache; running sequentially ensures this
    // response already reflects the repaired leaderboard.
    let userBlock = null;
    if (secret && typeof secret === 'string') {
      userBlock = await fetchUserBlock(date, secret);
    } else if (guestId && typeof guestId === 'string') {
      userBlock = await fetchGuestBlock(date, guestId);
    }

    const publicData = await fetchPublic(date);

    return res.status(200).json({
      date,
      distribution: publicData.distribution,
      user: userBlock,
    });
  } catch (err) {
    console.error('[dailyChallenge/results]', err);
    return res.status(500).json({ error: 'Failed to load results' });
  }
}

// Lets write paths (submit / mod scrub / guest claim) force the caches to
// refresh after a score lands or gets scrubbed, so the change shows up on the
// distribution AND the top-100 leaderboard immediately rather than up to 10s
// later. Single entry point — leaderboard.js's cache is cleared here too so
// call sites don't need to know there are two.
export function invalidateDailyPublicCache(date) {
  if (date) publicCache.delete(date);
  invalidateDailyLeaderboardCache(date);
}

export default ratelimiter(handler, 60, 60000);
