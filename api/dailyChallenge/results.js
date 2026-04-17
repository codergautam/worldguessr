import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats from '../../models/DailyChallengeStats.js';
import { isValidDailyDate } from '../../serverUtils/dailyChallenge.js';

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
    DailyChallengeScore.find({ date })
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

async function fetchUserBlock(date, secret) {
  const user = await User.findOne({ secret })
    .select('_id username dailyStreak dailyStreakBest dailyHistory lastDailyDate')
    .lean();
  if (!user) return null;

  const own = await DailyChallengeScore.findOne({ date, userId: user._id })
    .select('score rounds totalTime')
    .lean();

  let rank = null;
  if (own) {
    const higher = await DailyChallengeScore.countDocuments({ date, score: { $gt: own.score } });
    rank = higher + 1;
  }

  const history = (user.dailyHistory || []).slice(0, 30);
  return {
    username: user.username,
    streak: user.dailyStreak || 0,
    streakBest: user.dailyStreakBest || 0,
    playedToday: !!own,
    ownScore: own?.score ?? null,
    ownRank: rank,
    ownRounds: own?.rounds || null,
    ownTotalTime: own?.totalTime || null,
    history,
    personalBest: history.reduce((m, h) => Math.max(m, h.score || 0), 0),
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, secret } = req.query;
  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  try {
    const [publicData, userBlock] = await Promise.all([
      fetchPublic(date),
      secret && typeof secret === 'string' ? fetchUserBlock(date, secret) : Promise.resolve(null),
    ]);

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
