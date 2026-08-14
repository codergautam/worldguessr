import User, { USERNAME_COLLATION, STARTING_ELO } from '../models/User.js';
import DailyLeaderboard from '../models/DailyLeaderboard.js';
import { registerStat } from '../serverUtils/statRegistry.js';
import { MIGRATION_AT } from '../components/utils/ratingFlags.js';

// Cache for leaderboard data
const CACHE_DURATION = 60000; // 1 minute cache
const cache = new Map();
registerStat('api/leaderboard.cache', () => cache.size);

/**
 * ALL-TIME RANKED BOARD: 14-DAY ACTIVITY WINDOW
 *
 * Rating v2 is a competitive ladder, so a rating is only meaningful while its
 * owner is still putting it at risk. Under the old inflating ladder a player
 * could stop playing at 20,000 and sit on the board forever; under v2 the top
 * would freeze solid within weeks, occupied by accounts that can no longer lose.
 *
 * THIS IS A QUERY-SIDE FILTER AND NOTHING ELSE. It hides rows. It NEVER writes,
 * never decays and never touches a rating — an inactive player's number is
 * exactly where they left it, and the row comes back BY ITSELF on their next
 * ranked game, because api/eloRank.js stamps `lastRankedAt` on every rated
 * result (setFields.lastRankedAt / the placement-seed $set). There is no
 * restore job to run and nothing to un-hide.
 *
 * `lastRankedAt: null` is included in the hidden set on purpose: it means the
 * account has not completed a ranked game since the field shipped, which is the
 * same "not currently competing" state as a stale date.
 *
 * XP IS DELIBERATELY EXEMPT. Total XP is a lifetime accumulation, not a
 * contested position — hiding a dormant player's XP would be deleting a record,
 * not de-listing a competitor. Only the ranked (elo) all-time board filters.
 * The daily boards are already inherently active-only.
 */
const RANKED_ACTIVITY_WINDOW_DAYS = 14;
const RANKED_ACTIVITY_WINDOW_MS = RANKED_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * THE MIGRATION-DAY GRACE. READ THIS BEFORE CHANGING ANY OF IT.
 *
 * `lastRankedAt` is a NEW field with `default: null`, and
 * scripts/migrateRatingV2.js does NOT backfill it — its one $set writes elo,
 * ratedGames, seasonPeakElo and seasonPeakLeague, and nothing else. So the
 * instant v2 ships, every pre-existing account on the site has a null here.
 *
 * Apply the window naively on day one and the all-time ranked leaderboard is
 * EMPTY. Not short. Empty. For everybody, on the most scrutinised day of the
 * release, on a page that is a top-level nav item.
 *
 * A null lastRankedAt before the window has elapsed is not evidence of
 * dormancy — it is evidence that the field never had the chance to be stamped.
 * So the filter does not switch on until the site has been on v2 for a full
 * RANKED_ACTIVITY_WINDOW_DAYS, by which point every player who is still playing
 * has been stamped by api/eloRank.js setElo() and the transition is invisible.
 *
 * TWO WAYS THIS STAYS OFF, both failing towards "show the board":
 *   - MIGRATION_AT null  we cannot know how long we have been live. Note this
 *                        is the OPPOSITE polarity to placementGates.js, where
 *                        null fails closed: there, closed means "grant nothing",
 *                        which is safe. Here, closed would mean "hide everyone",
 *                        which is the outage. Safe direction, not fixed polarity.
 *   - inside the grace   fewer than 14 days since migration.
 *
 * If someone later backfills lastRankedAt in the migration, this grace becomes a
 * no-op rather than a bug — it just stops mattering.
 */
function rankedActivityFilterActive() {
  if (!MIGRATION_AT || Number.isNaN(MIGRATION_AT.getTime())) return false;
  return Date.now() - MIGRATION_AT.getTime() >= RANKED_ACTIVITY_WINDOW_MS;
}

/** Mongo filter for "has finished a ranked match inside the window". */
function activeRankedFilter() {
  return { lastRankedAt: { $gte: new Date(Date.now() - RANKED_ACTIVITY_WINDOW_MS) } };
}

/**
 * The 60s cache below is keyed by mode+period, and the activity cutoff moves
 * every second. That is fine and deliberate: a row can be at most CACHE_DURATION
 * stale on the way out, and a returning player's row reappears within 60s of
 * their first ranked finish. What is NOT fine is the key colliding with a list
 * cached under the OTHER filtering regime — which happens exactly once, at the
 * moment the grace above expires, and would otherwise pin a stale unfiltered
 * list for a minute. So the key carries the filter state.
 */
function getCacheKey(mode, pastDay, filtered) {
  const suffix = filtered ? `_active${RANKED_ACTIVITY_WINDOW_DAYS}d` : '';
  return `${mode}_${pastDay ? 'daily' : 'alltime'}${suffix}`;
}

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * The equipped name glow is public presentation, same class of fact as the
 * country flag beside it, and every board that prints a username has to be able
 * to print it or a purchase is invisible on the page a player is proudest of.
 *
 * FREE ON THIS PATH: the all-time board already pulls whole User documents, so
 * the sku is sitting in `user` and costs one property read. The daily path is
 * the one that has to work for it — see attachDailyGlows.
 */
function sendableUser(user) {
  if (!user.username) {
    return null;
  }
  return {
    username: user.username,
    countryCode: user.countryCode || null,
    nameGlow: user.cosmetics?.equipped?.nameGlow || null,
    totalXp: user.totalXp ?? user.xpGained ?? 0,
    createdAt: user.created_at,
    gamesLen: user.totalGamesPlayed ?? 0,
    elo: user.elo ?? STARTING_ELO,
    eloToday: user.elo_today ?? 0,
  };
}

/**
 * Stamp equipped glows onto rows that came out of the pre-computed daily board.
 *
 * ONE QUERY FOR THE WHOLE PAGE, and it only runs on a cache miss (the caller
 * caches the finished array for CACHE_DURATION), so this is one lookup a minute
 * per mode, not one per request and never one per row.
 *
 * RESOLVED LIVE, NOT BAKED INTO THE SNAPSHOT. The DailyLeaderboard collection is
 * written once at midnight by the cron; freezing the sku there would mean a glow
 * equipped at 9am does not appear on the daily board until tomorrow, on the
 * board a player checks most often. A cosmetic is current identity, not part of
 * the day's result.
 *
 * Failure is silent and total: a lookup that throws leaves every row un-glowed,
 * which is exactly what the page rendered yesterday. A leaderboard must not 500
 * over a decoration.
 */
async function attachDailyGlows(rows) {
  const ids = rows.map((r) => r.userId).filter(Boolean);
  if (!ids.length) return rows;
  try {
    const users = await User.find({ _id: { $in: ids } })
      .select('_id cosmetics.equipped.nameGlow')
      .lean()
      .maxTimeMS(2000);
    const glowById = new Map(
      users.map((u) => [u._id.toString(), u.cosmetics?.equipped?.nameGlow || null]),
    );
    for (const row of rows) row.nameGlow = glowById.get(row.userId) || null;
  } catch (e) {
    console.warn('[LEADERBOARD] glow lookup failed (non-critical):', e.message);
  }
  return rows;
}

// Load pre-computed daily leaderboard from DailyLeaderboard collection
async function getDailyLeaderboard(isXp = true) {
  const mode = isXp ? 'xp' : 'elo';
  const now = new Date();

  // Get today's midnight UTC for consistent lookups
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch pre-computed leaderboard (fast query with date+mode index)
  const precomputedLeaderboard = await DailyLeaderboard.findOne({
    date: todayMidnight,
    mode: mode
  }).lean().maxTimeMS(2000);

  if (!precomputedLeaderboard) {
    console.warn('[LEADERBOARD] Pre-computed daily leaderboard not found');
    return { leaderboard: [] };
  }

  // Transform pre-computed data to match expected format (only top 100 for display)
  const leaderboard = precomputedLeaderboard.leaderboard.slice(0, 100).map(entry => ({
    username: entry.username,
    countryCode: entry.countryCode || null,
    totalXp: isXp ? entry.delta : entry.currentValue,
    createdAt: null,
    gamesLen: 0,
    elo: isXp ? entry.currentValue : entry.delta,
    eloToday: entry.delta,
    rank: entry.rank,
    // Carried through the map purely so attachDailyGlows has something to join
    // on, then dropped — the client never sees it.
    userId: entry.userId,
  }));

  await attachDailyGlows(leaderboard);
  for (const row of leaderboard) delete row.userId;

  return { leaderboard };
}

// Get user's position from pre-computed daily leaderboard (top 50k)
async function getUserDailyRank(username, isXp = true) {
  const user = await User.findOne({ username: username }).collation(USERNAME_COLLATION).maxTimeMS(2000);
  if (!user) return { rank: null, delta: null };

  const mode = isXp ? 'xp' : 'elo';
  const now = new Date();

  // Get today's midnight UTC
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch pre-computed leaderboard (contains top 50k users)
  const precomputedLeaderboard = await DailyLeaderboard.findOne({
    date: todayMidnight,
    mode: mode
  }).lean().maxTimeMS(2000);

  if (!precomputedLeaderboard) {
    return { rank: null, delta: null };
  }

  // Find user in pre-computed leaderboard (searches through top 50k)
  const userEntry = precomputedLeaderboard.leaderboard.find(
    entry => entry.userId === user._id.toString()
  );

  if (userEntry) {
    return { rank: userEntry.rank, delta: userEntry.delta };
  }

  // User not in top 50k - no activity or very low delta
  return { rank: null, delta: null };
}

export default async function handler(req, res) {
  const myUsername = req.query.username;
  const pastDay = req.query.pastDay === 'true';
  const isXp = req.query.mode === 'xp';
  console.log(`[API] leaderboard: mode=${isXp ? 'xp' : 'elo'}, pastDay=${pastDay}, user=${myUsername || 'none'}`);

  // Prevent NoSQL injection - username must be a string if provided
  if (myUsername && typeof myUsername !== 'string') {
    return res.status(400).json({ message: 'Invalid username' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // One decision, read everywhere below, so the query, the rank count, the
    // cache key and the client note can never disagree about whether the window
    // is in force.
    const windowApplies = !isXp && !pastDay && rankedActivityFilterActive();
    const cacheKey = getCacheKey(isXp ? 'xp' : 'elo', pastDay, windowApplies);
    let leaderboard = getCachedData(cacheKey);
    let myRank = null;
    let myScore = null;

    if (!leaderboard) {
      if (pastDay) {
        // Daily leaderboard from pre-computed DailyLeaderboard collection
        const dailyResult = await getDailyLeaderboard(isXp);
        leaderboard = dailyResult.leaderboard;
        setCachedData(cacheKey, leaderboard);
      } else {
        // All-time leaderboard
        const sortField = isXp ? 'totalXp' : 'elo';
        const topUsers = await User.find({
          banned: false,
          pendingNameChange: { $ne: true },
          // Ranked board only, and only once the grace has elapsed — see
          // RANKED_ACTIVITY_WINDOW_DAYS. Spread so the XP board's query (and
          // every query before the window opens) is byte-for-byte what it was.
          ...(windowApplies ? activeRankedFilter() : {})
        })
          .sort({ [sortField]: -1 })
          .limit(100)
          .lean()
          .maxTimeMS(5000);

        leaderboard = topUsers.map(sendableUser).filter(user => user !== null);
        setCachedData(cacheKey, leaderboard);
      }
    }

    // Get user's rank and score
    let myCountryCode = null;
    // The viewer's own glow, for the "Your Rank" card. It cannot be read off
    // `leaderboard` — the whole point of that card is that the viewer is usually
    // NOT in the top 100.
    let myNameGlow = null;
    // True when the VIEWER is the one being hidden by the activity window. The
    // page needs this: without it they get a "Your Rank #12" card above a list
    // they are not in, which reads as a bug rather than as a consequence.
    let myRankHidden = false;
    if (myUsername) {
      if (pastDay) {
        const userResult = await getUserDailyRank(myUsername, isXp);
        myRank = userResult.rank;
        myScore = userResult.delta;
        // One extra projected field on a query this branch already makes.
        const user = await User.findOne({ username: myUsername }).collation(USERNAME_COLLATION).select('countryCode cosmetics.equipped.nameGlow').maxTimeMS(2000);
        myCountryCode = user?.countryCode || null;
        myNameGlow = user?.cosmetics?.equipped?.nameGlow || null;
      } else {
        // All-time ranking
        const user = await User.findOne({ username: myUsername }).collation(USERNAME_COLLATION).maxTimeMS(2000);
        if (user) {
          myCountryCode = user.countryCode || null;
          myNameGlow = user.cosmetics?.equipped?.nameGlow || null;
          const sortField = isXp ? 'totalXp' : 'elo';
          myScore = user[sortField];
          if (myScore) {
            const betterUsersCount = await User.countDocuments({
              [sortField]: { $gt: myScore },
              banned: false,
              // COUNT THE SAME POPULATION THE LIST SHOWS. Without this the rank
              // card said "#12" while the player sat 8th in the visible rows,
              // because the count still included everyone the window hid.
              ...(windowApplies ? activeRankedFilter() : {})
            }).maxTimeMS(5000);
            myRank = betterUsersCount + 1;
          }
          if (windowApplies) {
            const cutoff = Date.now() - RANKED_ACTIVITY_WINDOW_MS;
            myRankHidden = !user.lastRankedAt || new Date(user.lastRankedAt).getTime() < cutoff;
          }
        }
      }
    }

    const responseKey = isXp ? 'myXp' : 'myElo';
    // `activityWindowDays` is present ONLY when rows are actually being hidden.
    // Both clients render the explanatory note off its presence, so during the
    // migration grace they say nothing rather than promising a rule that is not
    // yet in force — and neither client needs to know the rule to get it right.
    return res.status(200).json({
      leaderboard,
      myRank,
      myCountryCode,
      myNameGlow,
      [responseKey]: myScore,
      ...(windowApplies ? { activityWindowDays: RANKED_ACTIVITY_WINDOW_DAYS, myRankHidden } : {})
    });

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({
      message: 'An error occurred',
      error: error.message
    });
  }
}
