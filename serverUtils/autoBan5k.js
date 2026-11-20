import Game from '../models/Game.js';
import User from '../models/User.js';
import Report from '../models/Report.js';
import ModerationLog from '../models/ModerationLog.js';
import haversineDistance from '../components/utils/haversineDistance.js';
import { syncedClearCache } from './cacheBus.js';

// Automatic temp ban for accounts that pin the exact location again and again.
//
// A round is SUSPECT when the guess is within maxDistM of the exact location
// AND was locked in under maxTimeS. An account is banned when it has at least
// minRounds suspect rounds in the window AND they are at least minRate of its
// ranked rounds. All three must hold: a top player gets close, but not this
// close, this fast, this often.
//
// The ban is a holding action, not a verdict: it refunds nothing and hides
// nothing. It files a pending report that sorts first in the mod queue
// (api/mod/getReports.js), and the moderator decides. "Ignore" on that report
// lifts the ban (api/mod/takeAction.js).
//
// THE NUMBERS ARE NOT CALIBRATED against production data yet.
export const AUTO_BAN = {
  windowDays: 30,
  maxDistM: 10,
  maxTimeS: 10,
  minRounds: 10,
  minRate: 0.1,
  banMs: 7 * 24 * 60 * 60 * 1000
};

const PUBLIC_NOTE = 'Automatic ban for suspected cheating. A moderator will review it.';

export function isSuspectGuess(location, guess) {
  if (guess.guessLat == null || guess.guessLong == null) return false;
  if (!(guess.timeTaken < AUTO_BAN.maxTimeS)) return false;
  const meters = haversineDistance(location.lat, location.long, guess.guessLat, guess.guessLong) * 1000;
  return meters <= AUTO_BAN.maxDistM;
}

// Pure: the account's suspect-round stats over a list of saved games.
export function scoreAccount(games, accountId) {
  let rounds = 0;
  let suspect = 0;
  const gameIds = [];
  for (const game of games) {
    let hit = false;
    for (const round of game.rounds || []) {
      const guess = (round.playerGuesses || []).find(g => g.accountId === accountId);
      if (!guess) continue;
      rounds++;
      if (isSuspectGuess(round.location, guess)) {
        suspect++;
        hit = true;
      }
    }
    if (hit) gameIds.push(game.gameId);
  }
  const rate = rounds ? suspect / rounds : 0;
  return {
    rounds,
    suspect,
    rate,
    gameIds,
    flagged: suspect >= AUTO_BAN.minRounds && rate >= AUTO_BAN.minRate
  };
}

// Called after a ranked duel is saved. Returns the stats when it banned, else null.
export async function checkAutoBan(rawAccountId, savedGame) {
  const accountId = String(rawAccountId);

  // Cheap gate: almost every game has no suspect round, so it costs no query.
  if (!scoreAccount([savedGame], accountId).suspect) return null;

  const user = await User.findById(accountId).select('username secret banned staff').lean();
  if (!user || user.banned || user.staff) return null;

  // Rounds a moderator already judged do not count again: after an automatic
  // ban is cleared, the account needs fresh evidence to be banned a second time.
  const lastAuto = await Report.findOne({ auto: true, 'reportedUser.accountId': accountId })
    .sort({ createdAt: -1 }).select('createdAt').lean();
  const since = new Date(Math.max(
    Date.now() - AUTO_BAN.windowDays * 24 * 60 * 60 * 1000,
    lastAuto ? new Date(lastAuto.createdAt).getTime() : 0
  ));

  const games = await Game.find({
    gameType: 'ranked_duel',
    'players.accountId': accountId,
    createdAt: { $gte: since }
  }).select('gameId players.username players.accountId rounds.location.lat rounds.location.long rounds.playerGuesses.accountId rounds.playerGuesses.guessLat rounds.playerGuesses.guessLong rounds.playerGuesses.timeTaken').lean();

  const stats = scoreAccount(games, accountId);
  if (!stats.flagged) return null;

  const expiresAt = new Date(Date.now() + AUTO_BAN.banMs);
  const reason = `Automatic ban: ${stats.suspect} of ${stats.rounds} ranked rounds (${Math.round(stats.rate * 100)}%) since ${since.toISOString().slice(0, 10)} were within ${AUTO_BAN.maxDistM} m of the exact location in under ${AUTO_BAN.maxTimeS} s.`;

  // Atomic claim, so a moderator's ban that landed first is never overwritten.
  const claimed = await User.updateOne(
    { _id: accountId, banned: { $ne: true } },
    { banned: true, banType: 'temporary', banExpiresAt: expiresAt, banReason: reason, banPublicNote: PUBLIC_NOTE }
  );
  if (!claimed.modifiedCount) return null;

  const report = await Report.create({
    auto: true,
    reportedBy: { accountId: null, username: 'AutoMod' },
    reportedUser: { accountId, username: user.username },
    reason: 'cheating',
    description: `${reason} Banned for 7 days until a moderator decides. Ignore = lift the ban.`,
    gameId: savedGame.gameId,
    gameType: 'ranked_duel'
  });

  const suspectIds = new Set(stats.gameIds.slice(-100));
  await ModerationLog.create({
    targetUser: { accountId, username: user.username },
    moderator: { accountId: 'system', username: 'AutoMod' },
    actionType: 'ban_temporary',
    duration: AUTO_BAN.banMs,
    durationString: '7 days',
    expiresAt,
    reason,
    relatedReports: [report._id],
    notes: PUBLIC_NOTE,
    suspiciousGames: games.filter(g => suspectIds.has(g.gameId)).map(g => {
      const opponent = (g.players || []).find(p => p.accountId !== accountId);
      return {
        gameId: g.gameId,
        opponentUsername: opponent?.username || null,
        opponentAccountId: opponent?.accountId || null
      };
    })
  });

  syncedClearCache(`userAuth_${user.secret}`);

  // Disconnect the live session, same route the mod ban uses.
  if (process.env.MAINTENANCE_SECRET) {
    try {
      const wsPort = process.env.WS_PORT || 3002;
      await fetch(`http://localhost:${wsPort}/enforce-ban/${process.env.MAINTENANCE_SECRET}/${accountId}`);
    } catch (error) {
      // Non-critical: the ban is already in the database.
      console.error('[autoBan5k] enforce failed (non-critical):', error.message);
    }
  }

  console.log(`[autoBan5k] banned ${user.username} (${accountId}): ${reason}`);
  return stats;
}
