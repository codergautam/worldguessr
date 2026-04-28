import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats, { bucketIndexForScore } from '../../models/DailyChallengeStats.js';
import GuestProfile from '../../models/GuestProfile.js';
import GuestScore from '../../models/GuestScore.js';
import { isValidDailyDate } from '../../serverUtils/dailyChallenge.js';
import { effectiveStreak } from '../../serverUtils/dailyStreak.js';

// Distribution + top-10 (the expensive part) are identical for every caller
// on the same date — cache for a few seconds. User-specific block is fetched
// separately and never cached.
const PUBLIC_TTL_MS = 10 * 1000;
const publicCache = new Map(); // date -> { expiresAt, payload }

async function fetchPublic(date) {
  const cached = publicCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const [statsDoc, top10] = await Promise.all([
    DailyChallengeStats.findOne({ date }).lean(),
    // Filter DQ markers — they're zero-score rows we keep only to lock the
    // date for the user, never to surface on the leaderboard.
    DailyChallengeScore.find({ date, disqualified: { $ne: true } })
      .sort({ score: -1, submittedAt: 1 })
      .limit(10)
      .select('username score')
      .lean(),
  ]);

  const totalPlays = statsDoc?.totalPlays || 0;
  const roundSums = statsDoc?.roundScoreSums || [];
  const roundAverages = totalPlays > 0
    ? roundSums.map(s => Math.round((s || 0) / totalPlays))
    : roundSums.map(() => 0);

  const payload = {
    distribution: {
      totalPlays,
      avgScore: totalPlays > 0 ? Math.round((statsDoc.totalScore || 0) / totalPlays) : 0,
      buckets: statsDoc?.buckets || [],
      roundAverages,
    },
    top10: top10.map((e, i) => ({ rank: i + 1, username: e.username, score: e.score })),
  };

  publicCache.set(date, { expiresAt: Date.now() + PUBLIC_TTL_MS, payload });
  // Prune old entries so the map stays bounded
  if (publicCache.size > 30) {
    const oldestKey = publicCache.keys().next().value;
    publicCache.delete(oldestKey);
  }
  return payload;
}

async function rankForScore(date, score) {
  const statsDoc = await DailyChallengeStats.findOne({ date }).select('buckets totalPlays').lean();
  const totalPlays = statsDoc?.totalPlays || 0;
  if (totalPlays <= 0) return null;
  const bucket = bucketIndexForScore(score);
  const above = (statsDoc.buckets || []).slice(bucket + 1).reduce((a, b) => a + b, 0);
  return Math.min(totalPlays, above + 1);
}

async function fetchGuestBlock(date, guestId) {
  const profile = await GuestProfile.findOne({ guestId }).lean();
  if (!profile) return null;

  const own = await GuestScore.findOne({ guestId, date })
    .select('score rounds totalTime disqualified')
    .lean();

  const isDq = !!own?.disqualified;
  // Rank is meaningless for DQ markers — they're not in the distribution.
  const rank = own && !isDq ? await rankForScore(date, own.score) : null;
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
    // playedToday reflects only valid scored runs; a DQ locks the day but
    // doesn't count as "played" for the menu badge / "view results" CTA.
    playedToday: !!own && !isDq,
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
    .select('score rounds totalTime username disqualified')
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
      }
    } catch (err) {
      console.warn('[dailyChallenge/results] username heal failed:', err?.message);
    }
  }

  // Rank derived from DailyChallengeStats.buckets (includes anon) so it
  // stays consistent with the percentile rendered in the results UI —
  // see computeRankAndPercentile in submit.js for the same derivation.
  // DQ markers carry score=0 but aren't in the distribution, so no rank.
  const rank = own && !isDq ? await rankForScore(date, own.score) : null;

  const history = (user.dailyHistory || []).slice(0, 30);

  // Stale-streak guard: dailyStreak is only recomputed on submit, so a user
  // who missed the grace window still has an N-day count sitting in the DB.
  // Compute the live value here so every read surface (landing, menu badge,
  // results modal) shows 0 the moment the streak is actually lost.
  const liveStreak = effectiveStreak({
    streak: user.dailyStreak || 0,
    lastDate: user.lastDailyDate,
    graceDates: user.dailyGraceUsedDates,
    today: date,
  });

  return {
    username: user.username,
    streak: liveStreak,
    streakBest: user.dailyStreakBest || 0,
    playedToday: !!own && !isDq,
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
      top10: publicData.top10,
      user: userBlock,
    });
  } catch (err) {
    console.error('[dailyChallenge/results]', err);
    return res.status(500).json({ error: 'Failed to load results' });
  }
}

// Lets the submit endpoint force the cache to refresh after a new score lands
// so a player's submission shows up on the leaderboard / distribution
// immediately rather than up to 10s later.
export function invalidateDailyPublicCache(date) {
  if (date) publicCache.delete(date);
}

export default ratelimiter(handler, 60, 60000);
