import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import { isValidDailyDate } from '../../serverUtils/dailyChallenge.js';

// Top-100 board for the opt-in leaderboard modal/sheet (the landing keeps the
// anonymous distribution as its headline — this list is only fetched when a
// player explicitly opens it). Same moderation rules as the old landing
// top-10, just deeper. Identical for every caller on the same date — cache
// for a few seconds.
const LEADERBOARD_SIZE = 100;
const TTL_MS = 10 * 1000;
const cache = new Map(); // date -> { expiresAt, payload }

async function fetchLeaderboard(date) {
  const cached = cache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  // Filter DQ markers (zero-score rows kept only to lock the date for their
  // owner) and hidden rows (moderation shadow). Over-fetch so the post-filter
  // for banned/pendingNameChange users can still yield 100 entries even if a
  // few got moderated mid-day.
  const candidates = await DailyChallengeScore.find({ date, disqualified: { $ne: true }, hidden: { $ne: true } })
    .sort({ score: -1, submittedAt: 1 })
    .limit(LEADERBOARD_SIZE + 30)
    .select('username score userId')
    .lean();

  // Belt-and-braces: same second pass as results.js — takeAction.js's
  // scrubFromDailyLeaderboards flips hidden=true at ban-time, so this only
  // guards the narrow race where a fresh score lands between the scrub and
  // the ban write committing, plus users who entered pendingNameChange after
  // their score was written.
  const candidateUserIds = candidates.map(c => c.userId).filter(Boolean);
  const blockedIds = candidateUserIds.length
    ? new Set(
        (await User.find({
          _id: { $in: candidateUserIds },
          $or: [{ banned: true }, { pendingNameChange: true }],
        }).select('_id').lean()).map(u => u._id.toString())
      )
    : new Set();

  const payload = {
    leaderboard: candidates
      .filter(c => !blockedIds.has(c.userId?.toString()))
      .slice(0, LEADERBOARD_SIZE)
      .map((e, i) => ({ rank: i + 1, username: e.username, score: e.score })),
  };

  cache.set(date, { expiresAt: Date.now() + TTL_MS, payload });
  // Prune old entries so the map stays bounded
  if (cache.size > 30) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  return payload;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;
  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  try {
    const { leaderboard } = await fetchLeaderboard(date);
    return res.status(200).json({ date, leaderboard });
  } catch (err) {
    console.error('[dailyChallenge/leaderboard]', err);
    return res.status(500).json({ error: 'Failed to load leaderboard' });
  }
}

// Called through results.js's invalidateDailyPublicCache — the single entry
// point every write path (submit / mod scrub / guest claim) already uses.
// No date clears everything (the username self-heal can touch past dates).
export function invalidateDailyLeaderboardCache(date) {
  if (date) cache.delete(date);
  else cache.clear();
}

export default ratelimiter(handler, 30, 60000);
