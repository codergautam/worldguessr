import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats, { DAILY_ROUNDS_PER_DAY, DAILY_BUCKET_COUNT, DAILY_MAX_SCORE } from '../../models/DailyChallengeStats.js';
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
// One aggregation per date at a time. Every miss used to run its own copy of
// the $median pipeline below, and at peak every submit busts the cache, so
// concurrent readers now share the in-flight promise instead.
const publicInflight = new Map(); // date -> { gen, promise }
// Invalidation generation per date. A reader that arrives AFTER a submit
// invalidated the date must not join an aggregation that started BEFORE it
// (that snapshot predates the new row, and re-caching it would make the
// invalidation a no-op and reopen "#25 of 24"). The generation is bumped on
// invalidate; an in-flight run is only shared, and only cached, while its
// generation is still current.
const publicGen = new Map(); // date -> number
const genOf = (date) => publicGen.get(date) || 0;
// The pipeline fetches every counted row for the date (rounds.score is in no
// index). A slow day must not stall the results screen: cap it, and serve the
// last known distribution when the cap or the database says no.
const PUBLIC_QUERY_MAX_MS = 4000;

// `avgScore` / `roundAverages` are MEDIANS (owner ruling Sep 3 2026: the copy
// keeps saying "avg", the number must not be skewable by a handful of perfect
// or zero runs). One $group over the board rows with MongoDB's $median
// accumulator (7.0+; prod and dev run 8.0) — its t-digest is within a point
// or two of exact on a 15,000-point scale, for four numbers back instead of
// every row. Sums in the stats doc cannot give a median and are gone. The
// wire names stay so no client or cache changes; shared/daily/types.d.ts
// carries the same note.
const roundMedian = (i) => ({ $median: { input: { $arrayElemAt: ['$rounds.score', i] }, method: 'approximate' } });

async function fetchPublic(date) {
  const cached = publicCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const gen = genOf(date);
  const inflight = publicInflight.get(date);
  if (inflight && inflight.gen === gen) return inflight.promise;
  const promise = computePublic(date, cached?.payload, gen).finally(() => {
    if (publicInflight.get(date)?.promise === promise) publicInflight.delete(date);
  });
  publicInflight.set(date, { gen, promise });
  return promise;
}

// Histogram median for the counts-only fallback: the stats doc keeps a
// DAILY_BUCKET_COUNT-wide score histogram (500-point buckets over 0..15000),
// so the median is known to half a bucket without touching the score rows.
// Both clients render avgScore as a number ("Beat today's average of N"), so
// a 0 next to thousands of plays would read as a real average.
function medianFromBuckets(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) return 0;
  const total = buckets.reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  if (total === 0) return 0;
  const width = DAILY_MAX_SCORE / (DAILY_BUCKET_COUNT - 1);
  const target = Math.ceil(total / 2);
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += Number.isFinite(buckets[i]) && buckets[i] > 0 ? buckets[i] : 0;
    if (seen >= target) {
      return Math.round(Math.min(DAILY_MAX_SCORE, i * width + (i === DAILY_BUCKET_COUNT - 1 ? 0 : width / 2)));
    }
  }
  return 0;
}

function storePublic(date, payload, gen = genOf(date)) {
  // A run that started before an invalidation must not re-cache its
  // pre-submit snapshot; its callers still get the payload it computed, and
  // the next miss recomputes under the current generation.
  if (gen !== genOf(date)) return;
  // Delete before set so a refreshed date moves to the newest insertion slot;
  // the size prune below evicts by insertion order.
  publicCache.delete(date);
  publicCache.set(date, { expiresAt: Date.now() + PUBLIC_TTL_MS, payload });
  // Prune old entries so the map stays bounded
  if (publicCache.size > 30) {
    const oldestKey = publicCache.keys().next().value;
    publicCache.delete(oldestKey);
  }
}

async function computePublic(date, stale, gen = genOf(date)) {
  // Board rows are the same population the buckets and the percentile use
  // (counted, non-DQ, non-hidden). The headline totalPlays is floored at the
  // row count so it can never read below a row-derived ownRank ("#25 of
  // 24"); legacy claim-backfilled scores are rows without stats plays.
  const [statsResult, aggResult] = await Promise.allSettled([
    DailyChallengeStats.findOne({ date }).select('totalPlays buckets').lean(),
    DailyChallengeScore.aggregate([
      { $match: { date, disqualified: { $ne: true }, hidden: { $ne: true } } },
      {
        $group: {
          _id: null,
          rows: { $sum: 1 },
          score: { $median: { input: '$score', method: 'approximate' } },
          ...Object.fromEntries(Array.from({ length: DAILY_ROUNDS_PER_DAY }, (_, i) => [`r${i}`, roundMedian(i)])),
        },
      },
    ]).option({ maxTimeMS: PUBLIC_QUERY_MAX_MS }),
  ]);

  // The stats doc is one indexed read; if even that fails the database is
  // down and only a previous payload can answer.
  if (statsResult.status === 'rejected') {
    if (!stale) throw statsResult.reason;
    console.warn('[dailyChallenge/results] stats read failed, serving the previous distribution', statsResult.reason?.message);
    storePublic(date, stale, gen);
    return stale;
  }
  const statsDoc = statsResult.value;

  let agg;
  if (aggResult.status === 'fulfilled') {
    [agg] = aggResult.value;
  } else if (stale) {
    // Keep the last known distribution on the screen and retry on the next
    // miss rather than failing every reader while the database is slow.
    console.warn('[dailyChallenge/results] distribution refresh failed, serving the previous one', aggResult.reason?.message);
    storePublic(date, stale, gen);
    return stale;
  } else {
    // Cold cache and the medians timed out: answer with the counts and the
    // histogram from the stats doc and no medians. That is the payload every
    // date starts with, so both clients already render it; the normal TTL
    // means the next miss retries the aggregation instead of every reader
    // paying for one.
    console.warn('[dailyChallenge/results] distribution medians unavailable, serving counts only', aggResult.reason?.message);
    agg = undefined;
  }

  const statsPlays = statsDoc?.totalPlays || 0;
  const rows = agg?.rows || 0;
  const asScore = (v) => (Number.isFinite(v) ? Math.round(v) : 0);

  const payload = {
    distribution: {
      totalPlays: Math.max(statsPlays, rows),
      // Counts-only fallback (medians unavailable): estimate the median from
      // the histogram rather than shipping a 0 beside thousands of plays.
      avgScore: rows > 0 ? asScore(agg?.score) : medianFromBuckets(statsDoc?.buckets),
      buckets: statsDoc?.buckets || [],
      // Empty, not [0, 0, 0], until a counted row exists: both clients read a
      // 0 average as a real number and badge every round "+100% above avg".
      roundAverages: rows > 0
        ? Array.from({ length: DAILY_ROUNDS_PER_DAY }, (_, i) => asScore(agg[`r${i}`]))
        : [],
    },
  };

  storePublic(date, payload, gen);
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
    .select('_id username dailyStreak dailyStreakBest dailyHistory lastDailyDate dailyGraceUsedDates dailyDaysPlayed')
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
    // Lifetime counter, floored by what this doc proves regardless: the
    // 30-capped window length and the streaks (N-day streak ⇒ ≥N days
    // played). The floor carries legacy users until their next submit
    // seeds dailyDaysPlayed server-side.
    daysPlayed: Math.max(
      user.dailyDaysPlayed || 0,
      history.length,
      user.dailyStreakBest || 0,
      liveStreak || 0,
    ),
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, secret, guestId, lite } = req.query;
  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  // The home menu only needs the caller's own block (streak, played today).
  // `lite=1` skips the distribution so a home mount never pays for the
  // per-date aggregation above.
  const wantsDistribution = lite !== '1' && lite !== 'true';

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

    const publicData = wantsDistribution ? await fetchPublic(date) : null;

    return res.status(200).json({
      date,
      distribution: publicData ? publicData.distribution : null,
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
  // Expire, do not delete: the next read recomputes, but the previous payload
  // stays available as the fallback computePublic serves when that refresh
  // times out or fails. At peak every submit lands here, so a delete would
  // leave nothing to fall back to exactly when the database is busiest.
  const cached = date ? publicCache.get(date) : null;
  if (cached) cached.expiresAt = 0;
  // Retire any aggregation already running for this date: it cannot have
  // seen the row that just landed, so its result may be served to the callers
  // that already joined it but must not be cached or joined by later readers.
  if (date) publicGen.set(date, genOf(date) + 1);
  invalidateDailyLeaderboardCache(date);
}

export default ratelimiter(handler, 60, 60000);
