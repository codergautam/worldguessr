// FIRST IMPORT, AND IT MUST STAY FIRST. `dotenv/config` loads .env as an import
// SIDE EFFECT, which is the only form that runs early enough to be useful here.
//
// This used to be `import { config } from 'dotenv'` with a `config()` call in
// the module body, and that is a trap with teeth: ESM evaluates every imported
// module BEFORE the first line of the importer's body. So `./classes/Game.js`
// below (and everything it pulls in) ran while .env had not been read yet, and
// any module that reads process.env at import time froze the WRONG value for
// the life of the process.
//
// It cost the entire stamps economy. serverUtils/stamps/config.js used to do
// `export const STAMPS_ENABLED = process.env.STAMPS_ENABLED === 'true'` at
// import time, Game.js imports it, so STAMPS_ENABLED was permanently false in
// this process even with STAMPS_ENABLED=true in .env — grantGameStamps returned
// on its first line for every game ever played. Zero game_base rows existed in
// the database.
//
// That flag now DEFAULTS ON and only an explicit "false" disables it, so the
// same mistiming would fail loud-and-open instead of silent-and-off. Do not
// read that as the trap being fixed: it is one flag that stopped being
// vulnerable. MONGODB, MAINTENANCE_SECRET and every other env read below still
// depend entirely on this line running first.
//
// Anything env-gated imported below inherits this fix for free. Do not convert
// this back to the function form.
import 'dotenv/config';
import uws from 'uWebSockets.js';
import fs from 'fs';
import Player from './classes/Player.js';
import { v4 as uuidv4 } from 'uuid';
import User, { USERNAME_COLLATION } from '../models/User.js';
import mongoose from 'mongoose';
import Game from './classes/Game.js';
import setCorsHeaders from '../serverUtils/setCorsHeaders.js';
import { getActivePlayerCount, getPlatformDistribution } from '../serverUtils/playerCounts.js';

import lookup from "coordinate_to_country"
import { players, games, disconnectedPlayers, playersInQueue } from '../serverUtils/states.js';
import Memsave from '../models/Memsave.js';
import blockedAt from 'blocked-at';
import { getLeagueRange, leagues, getStrictFloor, getActiveLeagues } from '../components/utils/leagues.js';
import calculateOutcomes, {
  ENTRY_RATING, calculateTransfer, pairK
} from '../components/utils/eloSystem.js';
import { RATING_V2 } from '../components/utils/ratingFlags.js';
import {
  windowFor, chooseDuelPairs,
  recordDodge, dodgeRemaining, sweepDodges,
  decayMultiplier, readPairWins, bumpPairWins
} from './matchmakingV2.js';
import {
  createEtaStore, recordSample, sweepSamples, estimateWait, bootstrapEstimate,
  nextShownEta, snapshotStore, restoreStore, QUERY_PLAN
} from './queueEta.js';
// EVERY timer in this file goes through safeInterval. An uncaught throw in a
// timer callback reaches the uncaughtException handler below, which exits the
// process and ends the game for every connected player. See ws/safeTimers.js.
import { safeInterval } from './safeTimers.js';
import { canJoinUnrankedRound, UNRANKED_ROUND_TIME_MS } from './unrankedMatchmaking.js';
import { startLeagueConfigRefresh } from '../serverUtils/loadLeagueConfig.js';
import { checkMigrationAt } from '../serverUtils/checkMigrationAt.js';
import QueueEtaSnapshot from '../models/QueueEtaSnapshot.js';
import PairWins from '../models/PairWins.js';
import { dayKeyUTC } from '../serverUtils/stamps/periods.js';
import { getEmote, byLegacyIndex } from '../shared/emotes/catalog.js';
import { tmpdir } from 'os';

import arbitraryWorld from '../data/world-arbitrary.json' with { type: "json" };
import { SERVER_CAP, locKey, pushSeenLoc, sampleDistinct } from '../shared/locations/repeatGuard.js';
import {
  BOTS_ENABLED, BOTS_INSTANT,
  createBotPlayer, makeBotUsername, refreshBotEligibility, tickBots
} from './botUtils.js';
import { Filter } from 'bad-words';

console.log("[INFO] Starting ws.js")
global.serverStartTime = Date.now();


import { createClient } from 'redis';

let redisClient;
if(!process.env.REDIS_URI) {
  console.log("[MISSING-ENV WARN] REDIS_URI env variable not set");
} else {
redisClient = createClient({
  url: process.env.REDIS_URI,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

const main = async () => {
  await redisClient.connect();
  console.log('Connected to Redis');
};


main();
}

function normalizeArbLoc(r) {
  const loc = { lat: r.lat, long: r.lng, country: r.country || 'unknown' };
  if (r.heading !== undefined && r.heading !== null) loc.heading = r.heading;
  if (r.pitch !== undefined && r.pitch !== null) loc.pitch = r.pitch;
  if (r.panoId) loc.panoId = r.panoId;
  return loc;
}

// Cross-match repeat guard for duels. Every Player carries a ring of the
// location ids they were recently served (Player.recentLocs); a match picks
// around the union of its participants' rings, then stamps back what it picked.
//
// Duels only, 1v1 and 2v2. Public FFA and party rooms seat up to 200 players,
// where a union of everyone's history is both enormous and meaningless, and
// their within-match distinctness is already guaranteed.
function seenUnion(players) {
  const seen = new Set();
  for (const p of players) {
    for (const id of p?.recentLocs || []) seen.add(id);
  }
  return seen;
}

function stampSeen(players, locations) {
  if (!locations || locations.length === 0) return;
  for (const p of players) {
    if (!p) continue;
    if (!p.recentLocs) p.recentLocs = [];
    for (const loc of locations) pushSeenLoc(p.recentLocs, loc, SERVER_CAP);
  }
}

function pick5RandomArb(seenIds) {
  return sampleDistinct(arbitraryWorld, 5, seenIds).map(normalizeArbLoc);
}

// 2v2 team duels: each round draws 50/50 from the standard world pool and the
// arbitrary pool (the harder map high-elo 1v1 duels play on). A coin flip per
// round rather than a pool merge, so the mix holds regardless of pool sizes.
// Dedupe is by location id, not object identity. The old Set-of-objects could
// not see that world-main and world-arbitrary share 510 coordinates as separate
// objects, so one match could serve the same spot from both pools.
function pick5WorldArbMix(worldPool, seenIds) {
  const seen = seenIds instanceof Set ? seenIds : new Set();
  const taken = new Set();
  const locs = [];
  // Pass 0 avoids what these players just had, pass 1 accepts anything.
  for (let pass = 0; pass < 2 && locs.length < 5; pass++) {
    const skipSeen = pass === 0 && seen.size > 0;
    for (let tries = 0; locs.length < 5 && tries < 200; tries++) {
      const fromArb = Math.random() < 0.5;
      const pool = fromArb ? arbitraryWorld : worldPool;
      const r = pool[Math.floor(Math.random() * pool.length)];
      const key = locKey(r);
      if (taken.has(key)) continue;
      if (skipSeen && seen.has(key)) continue;
      taken.add(key);
      locs.push(fromArb ? normalizeArbLoc(r) : r);
    }
  }
  // Unreachable with a 260k arbitrary pool, but never hand back a short round
  // list: the old loop would have spun forever here instead.
  while (locs.length < 5) locs.push(normalizeArbLoc(arbitraryWorld[Math.floor(Math.random() * arbitraryWorld.length)]));
  return locs;
}

// Profanity filter for party/2v2 text chat (restored with chat; wordlist
// shared with the CrazyGames build requirements).
// split(/\r?\n/) + trim, NOT split('\n'): the wordlist file is CRLF, and a
// bare newline split left a trailing \r on all 3388 entries — none could
// ever match, so the whole custom list was silently dead.
const chatFilter = new Filter();
chatFilter.removeWords('damn');
fs.readFileSync('public/Crazygames_profanity_filter.txt', 'utf8').split(/\r?\n/).forEach((word) => {
  const w = word.trim();
  if (w) chatFilter.addWords(w);
});

// init state vars
const dev = process.env.NODE_ENV !== 'production'
const port = process.env.WS_PORT || 3002;

const lastDuelOpponent = new Map(); // accountId -> accountId (prevents same matchup twice in a row)
// ALLOW_REMATCH=true disables rematch avoidance (1v1 + 2v2) so the same two
// players can be paired back-to-back — testing only, never set in prod.
const ALLOW_REMATCH = process.env.ALLOW_REMATCH === 'true';

// ── RATING V2: dodge cooldowns (see ws/matchmakingV2.js) ───────────────────
// accountId (or socket id for a guest) -> { until, lastAt, count }. In-memory
// and restart-tolerant on purpose: a cooldown lost to a deploy costs one
// skipped punishment. Only written under RATING_V2; with the flag off the map
// stays empty and nothing reads it, so queue behaviour is untouched.
const dodgeCooldowns = new Map();

// ── QUEUE WAIT TELEMETRY (see ws/queueEta.js) ─────────────────────────────
// Completed human ranked waits from the last hour, bucketed by 100 ELO.
const etaStore = createEtaStore();
const ETA_MAX_AGE_MS = QUERY_PLAN[QUERY_PLAN.length - 1].ageMs;
const dodgeKeyFor = (player) => player?.accountId || player?.id || null;

/**
 * Is bailing out of THIS game, right now, a queue dodge?
 *
 * The dodge is leaving a match you were already paired into, during the getready
 * window before round 1 has been played. That is the move that costs a real
 * opponent a whole game.
 *
 * Cancelling the QUEUE is deliberately not a dodge: nobody has been matched, so
 * nobody paid anything, and punishing Cancel would make the button hostile.
 *
 * Placement matches are EXEMPT. A placement is a brand-new account's first game
 * against a bot that throws on purpose — locking them out of ranked for backing
 * out of it is the worst possible first impression, and there is no opponent to
 * compensate.
 */
function isDodgeableExit(game) {
  return !!(RATING_V2 && game && game.duel && game.public && !game.isPlacement
    && game.state === 'getready' && game.curRound <= 1);
}

/**
 * Book a dodge for `player` if leaving `game` now qualifies.
 *
 * SHARED BY THE LEAVE BUTTON AND THE DISCONNECT PURGE, and that is the whole
 * point. This only ever fired from the explicit `leaveGame` message, so the
 * penalty landed on the honest player who pressed the button while the one who
 * killed the tab walked away free — punishing the more considerate of two
 * identical actions, and the easier one to perform was the one that cost
 * nothing.
 *
 * Keyed through dodgeKeyFor, which prefers accountId, so a cooldown survives the
 * reconnect that follows a tab close.
 */
function recordDodgeIfApplicable(player, game, reason) {
  if (!isDodgeableExit(game)) return 0;
  return chargeDodge(player, reason);
}

/** Unconditional charge, for callers that already decided this is a dodge. */
function chargeDodge(player, reason) {
  const penalty = recordDodge(dodgeCooldowns, dodgeKeyFor(player));
  console.log('[RATING_V2] dodge:', player?.username || player?.id, `${penalty}ms`, `(${reason})`, currentDate());
  return penalty;
}

/**
 * Rating both players must clear for the ARBITRARY (hard) world map.
 *
 * THIS SHIPPED AT 1800 AND SILENTLY RETIRED THE MAP. The comment it replaces
 * correctly warned that reusing the v1 constant "would put the gate above the
 * top of the live ladder and silently retire the map" — and then set the gate
 * to 1800, which is leaguesV2.legendV2.min. Legend starts EMPTY at migration by
 * design, and the migrated #1 lands at ~1600. So nobody on the ladder could
 * clear it and the hard map stopped appearing for everyone, with no error and
 * no log.
 *
 * The v1 gate was `both players > 2000`, which was exactly the old Explorer
 * league line (leagues.trekker.min, displayed as Explorer). Re-keying to the v2
 * Explorer line keeps the RULE identical across the migration — "Explorer and
 * above get the hard map" — instead of trying to preserve a number from a scale
 * that no longer exists. For reference the frozen conversion table maps old
 * 2000 to 875, so this is within 60 points of exact numeric parity too.
 *
 * Resolved from the ACTIVE tier table so a seasonal re-anchor carries it along.
 */
const ARB_MAP_TIER_NAME = 'Explorer';
function arbMapMinRating() {
  const tier = Object.values(getActiveLeagues()).find((l) => l.name === ARB_MAP_TIER_NAME);
  // Fail CLOSED to the same place the old bug landed rather than to 0: a table
  // with no Explorer tier means we cannot say who qualifies, and handing the
  // hard map to EVERYONE is the worse mistake.
  return typeof tier?.min === 'number' && Number.isFinite(tier.min) ? tier.min : Infinity;
}

/**
 * Book one directional (winner, loser) win for the anti-farm decay counter.
 * v2 only, and RATED HUMAN 1v1s only: an unrated game (bot duel, placement)
 * moves no rating, so counting it would let a player burn their own decay
 * budget on games that never paid out.
 *
 * The winner is taken from the same snapshot-aware scores finishSoloDuel
 * resolves on, so a leaver still counts by their real final score. An exact
 * score tie books nothing — a draw has no farm direction.
 */
function bumpPairWinsForGame(game) {
  try {
    if (!game.duel || game.teamDuel || !game.public) return;
    if (game.isBotGame || game.isPlacement || !game.ratingV2) return;

    const accountP1 = game.accountIds?.p1;
    const accountP2 = game.accountIds?.p2;
    if (!accountP1 || !accountP2) return;

    const p1 = game.getPlayerData(Object.values(game.players).find((p) => p.tag === 'p1'), 'p1');
    const p2 = game.getPlayerData(Object.values(game.players).find((p) => p.tag === 'p2'), 'p2');
    const s1 = Number(p1?.score) || 0;
    const s2 = Number(p2?.score) || 0;
    if (s1 === s2) return;

    const p1Won = s1 > s2;
    const winner = p1Won ? accountP1 : accountP2;
    const loser = p1Won ? accountP2 : accountP1;
    bumpPairWins(PairWins, dayKeyUTC(), winner, loser).catch((e) => {
      console.error('[RATING_V2] bumpPairWins failed:', e?.message || e);
    });
  } catch (e) {
    console.error('[RATING_V2] bumpPairWinsForGame failed:', e?.message || e);
  }
}

// Does this account own the emote? Free entries are owned by everybody. Paid
// entries are checked against the in-memory sku list stamped at verify /
// reconnect and refreshed by /cosmetics-updated, so the emote hot path never
// touches the DB. An entry with no sku can only be reached by a catalogue
// typo — fail closed rather than hand out a free paid emote.
function ownsEmote(player, emoteDef) {
  if (emoteDef.free) return true;
  if (!emoteDef.sku) return false;
  return Array.isArray(player.ownedCosmetics) && player.ownedCosmetics.includes(emoteDef.sku);
}

// The `publicDuelRange` the client renders while queued, derived from the v2
// rating window instead of a league band. Floored at 0 because the client
// treats the pair as a display range; the real pairing test is the symmetric
// window inside chooseDuelPairs.
function rangeForRatingV2(rating, waitedMs, strict = false) {
  const r = Number.isFinite(rating) ? rating : ENTRY_RATING;
  const half = windowFor(waitedMs);
  // A strict player's lower bound is the Voyager floor, not r - half: pairing
  // will not go below it, so showing a band that reaches into Trekker would be
  // advertising opponents this queue can never produce.
  const floor = strict ? getStrictFloor() : 0;
  const lo = Math.max(0, Number.isFinite(floor) ? floor : 0, Math.round(r - half));
  return [lo, Math.round(r + half)];
}

/**
 * Precompute the v2 rating outcomes for one ranked duel and stamp them on the
 * game. Game.js APPLIES these at the end; it recomputes nothing.
 *
 * Three numbers cover every outcome, all off ONE shared K (pairK), which is
 * what makes the result zero-sum:
 *   transfers[p1.id] — magnitude moved to p1 when p1 wins
 *   transfers[p2.id] — magnitude moved to p2 when p2 wins
 *   transfers.draw   — SIGNED from p1's perspective (a draw between mismatched
 *                      ratings still moves the ladder, and which way depends on
 *                      who was favoured, so this one cannot be a magnitude)
 *
 * ANTI-FARM DECAY IS READ ASYNCHRONOUSLY, and that needs explaining. This
 * function must stay synchronous: it runs inside the 500ms matchmaking tick,
 * and an await here would let addPlayer / playersInQueue.delete / game.start()
 * slide into a later tick, where the same two players can be paired a second
 * time. So the game is stamped immediately at decay 1 and the pair-wins rows
 * (both directions — farming is directional) are read in the background; the
 * transfers are then re-stamped in place. The read is one indexed findOne per
 * direction and the shortest possible duel is still tens of seconds, so it
 * always lands long before Game.js reads the transfers. If the read FAILS the
 * decay-1 stamp stands: full rating, no anti-farm. That is the right failure
 * direction — a DB blip must not quietly delete a player's rating.
 */
function stampRatingV2(game, p1, p2) {
  const rgP1 = Number(p1.ratedGames) || 0;
  const rgP2 = Number(p2.ratedGames) || 0;
  // ONE K for both sides. Per-player Ks would hand a rookie 40 points and take
  // 10 from the veteran they beat.
  const k = pairK(rgP1, rgP2);

  const build = (decayP1, decayP2) => {
    const common = {
      ratingA: p1.elo, ratingB: p2.elo,
      ratedGamesA: rgP1, ratedGamesB: rgP2,
      k
    };
    const p1Win = calculateTransfer({ ...common, outcome: 1, decay: decayP1 });
    const p2Win = calculateTransfer({ ...common, outcome: 0, decay: decayP2 });
    // A draw belongs to neither farming direction, so it takes the harsher of
    // the two multipliers: a pair grinding each other must not keep full value
    // by drawing.
    const drawRes = calculateTransfer({ ...common, outcome: 0.5, decay: Math.min(decayP1, decayP2) });
    return {
      version: 2,
      k,
      base: { p1: p1.elo, p2: p2.elo },
      ratedGames: { p1: rgP1, p2: rgP2 },
      decay: { [p1.id]: decayP1, [p2.id]: decayP2 },
      transfers: {
        [p1.id]: p1Win.transfer,
        [p2.id]: p2Win.transfer,
        draw: drawRes.deltaA
      }
    };
  };

  game.ratingV2 = build(1, 1);

  // Bots and guests have no accountId, so there is no pair to decay.
  if (!p1.accountId || !p2.accountId) return;

  const day = dayKeyUTC();

  // The promise is PARKED ON THE GAME so finishSoloDuel can await it.
  //
  // The original reasoning was that "the shortest possible duel is still tens
  // of seconds", so this read always lands first. True of a duel that is
  // PLAYED, false of one that is RESOLVED: an instant forfeit or a pregame
  // disconnect ends the game in well under a second, and the transfers are read
  // at whatever decay is stamped at that moment — which is 1. Those are exactly
  // the games a farming pair would use, so the control was missing precisely
  // where it was needed.
  //
  // Still fire-and-forget for the normal case: the re-stamp below happens on
  // its own and nothing blocks on it. Game.js awaits this handle only at the
  // finish line, and only with a short timeout, so a slow database delays a
  // result by milliseconds rather than holding a game open.
  game.ratingV2Ready = Promise.all([
    readPairWins(PairWins, day, p1.accountId, p2.accountId),
    readPairWins(PairWins, day, p2.accountId, p1.accountId)
  ]).then(([winsP1OverP2, winsP2OverP1]) => {
    // The game can be gone by the time this lands. `state === 'end'` is NOT a
    // reason to bail any more: finishSoloDuel awaits this before reading the
    // transfers, so a game that has just ended is the case that needs the
    // re-stamp most.
    if (games.get(game.id) !== game) return;
    game.ratingV2 = build(decayMultiplier(winsP1OverP2), decayMultiplier(winsP2OverP1));
  }).catch((e) => {
    console.error('[RATING_V2] pair decay read failed, keeping decay 1:', e?.message || e);
  });
}

let maintenanceMode = false;
let dbEnabled = true;

//get current date &time in cst
function currentDate() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
}

// location generator
let allLocations = [{"lat":59.94945834525827,"long":10.74877784715781,"country":"NO"},{"lat":-22.41504758873939,"long":-42.95073348255873,"country":"BR"},{"lat":7.117061549697593,"long":6.737664188991607,"country":"NG"},{"lat":43.11066098012346,"long":141.5910123338441,"country":"JP"},{"lat":49.88659404088488,"long":-99.9475096434099,"country":"CA"},{"lat":46.720999413096,"long":19.86240516067642,"country":"HU"}];

const generateMainLocations = async () => {
  try {
  fetch('http://localhost:3003/allCountries.json').then(async (res) => {
    const data = await res.json();
    if(data.locations && Array.isArray(data.locations) && data.locations.length > 0) {
      allLocations = data.locations;

    } else {
      console.error('Failed to load locations', currentDate);
    }

  }).catch((e) => {
    console.error('Failed to load locations', currentDate());
  });
} catch(e) {
  console.error('Failed to load locations', currentDate());
}


};

setTimeout(generateMainLocations, 2000);
safeInterval('locations', 1000 * 10, generateMainLocations);

// helpers
function joinGameByCode(code, onFull, onInvalid, onSuccess) {
  for (const game of games.values()) {
    if (game.code == code && !game.public) {
      if (Object.keys(game.players).length >= game.maxPlayers) {
        onFull();
        return;
      }

      onSuccess(game);
      return;
    }
  }
  onInvalid();
}

// Mid-signup accounts (Google linked, username not chosen yet) must not enter
// any game surface: rosters/queues assume a username, and the client's
// first-run username modal reloads the page on save — any game they slipped
// into would show a nameless player and then orphan the seat. Derived, not a
// flag: guests always carry a generated "Guest #..." name and named accounts
// their own, so only a mid-signup account matches. Guards every entry point
// (both queues, 2v2 matchmaking, create/join/invite); in-lobby messages need
// no guard since an unnamed player can never get into a lobby past these.
// Sentence-as-key: the current web client parks the join until the name is
// set, so only stale or hand-rolled clients ever see these (rendered verbatim).
function blockUnnamed(player, viaGameJoinError = false) {
  if (!player.accountId || player.username) return false;
  // Self-heal for stale Players: setName is HTTP-only, so a socket that
  // verified BEFORE the name was chosen never learns it. Web reloads after
  // setName (reconnect re-stamps via handleReconnect), but mobile's socket
  // can outlive signup indefinitely. Fire-and-forget refresh: this attempt
  // still bounces, the user's next tap passes. (Handlers are sync — awaiting
  // here would change message-ordering guarantees, so no inline await.)
  User.findById(player.accountId).select('username').then((u) => {
    if (u?.username && !player.username) player.username = u.username;
  }).catch(() => {});
  if (viaGameJoinError) {
    player.send({ type: 'gameJoinError', error: 'Choose a username first' });
  } else {
    player.send({ type: 'toast', key: 'Choose a username first', toastType: 'error' });
  }
  return true;
}

// connect to db
if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set");
  dbEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
    } catch (error) {
      console.error('[ERROR] Database connection failed!', error.message);
      console.log(error);
      dbEnabled = false;
    }
  }
}

// Restore the queue-wait samples a previous process collected. Best-effort by
// design: restoreStore() turns null, garbage or a partial doc into an empty
// store, and an empty store just means the ETA falls back to its modelled prior
// until live samples arrive. This may never be able to stop the server booting.
if (dbEnabled) {
  try {
    const snap = await QueueEtaSnapshot.findOne({ key: 'ranked1v1' }).lean();
    const restored = restoreStore(snap?.data, Date.now(), ETA_MAX_AGE_MS);
    for (const [idx, ring] of restored.buckets) etaStore.buckets.set(idx, ring);
    const n = [...etaStore.buckets.values()].reduce((sum, r) => sum + r.items.length, 0);
    console.log(`[queueEta] restored ${n} wait samples across ${etaStore.buckets.size} rating buckets`);
  } catch (e) {
    console.error('[queueEta] snapshot restore failed, starting cold:', e?.message || e);
  }

  // Seasonal league tiers, then a periodic re-check so a mid-season re-anchor
  // lands without a restart. AWAITED before the port opens: the strict
  // matchmaking floor and the hard-map gate both resolve through the active tier
  // table, so pairing on the built-in table for the first few seconds would
  // quietly apply last season's cutoffs. Never throws — a bad doc keeps the
  // built-in table.
  await startLeagueConfigRefresh(safeInterval, { label: 'ws' });

  // Is MIGRATION_AT actually this database's migration instant? A stale value
  // makes pre-migration accounts placement-eligible, and a placement OVERWRITES
  // a rating. Warns loudly, never blocks boot. This process is the one that
  // routes players into placements, so it is the one that has to shout.
  await checkMigrationAt('ws');
}
function log(...args) {
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }), ...args);

  // if(!dev) {
    // if(process.env.DISCORD_WEBHOOK_WS) {
    //   const hook = new Webhook(process.env.DISCORD_WEBHOOK_WS);
    //   hook.setUsername("Logs"+(dev ? ' - Dev' : ''));
    //   hook.send(args.join(' '));
    // }
  // }
}


// update console log
// if(!dev) {
// console.log = function () {
//   if (dev) {
//     return;
//   }
//   if(process.env.DISCORD_WEBHOOK_WS) {

//   const args = Array.from(arguments);
//   const timeInCST = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
//   args.unshift(timeInCST);
//   const hook = new Webhook(process.env.DISCORD_WEBHOOK_WS);
//   hook.setUsername("Logs");
//   hook.send(args.join(' '));


//   }

// }

// console.error = function () {
//   if (dev) {
//     return;
//   }
//   if(process.env.DISCORD_WEBHOOK_WS) {

//   const args = Array.from(arguments);
//   const timeInCST = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
//   args.unshift(timeInCST);
//   args.unshift('**ERROR!**');
//   const hook = new Webhook(process.env.DISCORD_WEBHOOK_WS);
//   hook.setUsername("Logs");
//   hook.send(args.join(' '));
//   }
// }
// }


blockedAt((time, stack) => {
  if(time > 1000) console.log(`Blocked for ${time}ms, operation started here:`, JSON.stringify(stack, null, 2), currentDate());
})
function stop(reason) {
  console.error('Stopping server', reason, currentDate());

  // store players and games in cache
  let gamesArr = [];
  let playersArr = [];
  for (const game of games.values()) {
    // store json
    gamesArr.push(game.toJSON());
  }
  for (const player of players.values()) {
    // store json
    playersArr.push(player.toJSON());
  }
  try {
  console.log('Saving gamestate before stopping',tmpdir() + `/gamestate.worldguessr`);
  fs.writeFileSync(tmpdir() + `/gamestate.worldguessr`, JSON.stringify({ games: gamesArr, players: playersArr,
    time: Date.now() }));
    console.log("Stored ", gamesArr.length, " games and ", playersArr.length, " players");
  } catch(e) {
    console.error('Failed to save gamestate', e, currentDate());
  }
}

process.on('SIGTERM', () => {
  stop('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  stop('SIGINT');
  process.exit(0);
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err, currentDate());
  stop('uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // LOG ONLY. This deliberately does NOT call stop().
  //
  // stop() serialises EVERY game and EVERY player and does a SYNCHRONOUS
  // fs.writeFileSync. An unhandled rejection is not a shutdown — this file is
  // full of fire-and-forget promises (stamp grants, pair-decay reads, forum
  // sync), so a database blip can fire this handler repeatedly while the server
  // is perfectly healthy. Dumping full state on each one blocks the event loop
  // for every connected player, over and over, and clobbers the restart-recovery
  // file with mid-session state that nothing is going to restore from.
  //
  // The gamestate dump belongs to the real shutdown paths only: SIGTERM, SIGINT
  // and uncaughtException, all above.
  console.error('Unhandled rejection', reason, promise, currentDate());
});
// uWebSockets.js
let app = uws.App({

});
app.listen('0.0.0.0', port, (ws) => {
  if (ws) {
    log('**WS Server started on port** ' + port);
  }
});

app.get('/', (res, req) => {

      // count all the headers
      let headerKb = 0;
      req.forEach((key, value) => {

        headerKb += key.length + value.length;

      });
      headerKb = headerKb / 1024;


  setCorsHeaders(res);
  res.writeHeader('Content-Type', 'text/html');
  res.writeStatus('200 OK');
  res.end("WorldGuessr - Powered by uWebSockets.js<br>Headers: "+headerKb.toFixed(2)+'kb');
});

app.get('/playercnt', (res) => {
  setCorsHeaders(res);
  res.writeHeader('Content-Type', 'text/plain');
  res.writeStatus('200 OK');
  res.end(String(getActivePlayerCount()));
});

app.get('/platformdist', (res) => {
  setCorsHeaders(res);
  res.writeHeader('Content-Type', 'application/json');
  res.writeStatus('200 OK');
  res.end(JSON.stringify(getPlatformDistribution()));
});

// maintenance mode
if (process.env.MAINTENANCE_SECRET) {
  const maintenanceSecret = process.env.MAINTENANCE_SECRET;
  app.get(`/setmaintenance/${maintenanceSecret}/true`, (res) => {
    maintenanceMode = true;
    // notify all players
    for (const player of players.values()) {
      player.send({
        type: 'restartQueued',
        value: true
      });
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/plain');
    res.end('ok');
    console.log('Maintenance mode started');

  });

  app.get(`/setmaintenance/${maintenanceSecret}/false`, (res) => {
    maintenanceMode = false;
    // notify all players
    for (const player of players.values()) {
      player.send({
        type: 'restartQueued',
        value: false
      });
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/plain');
    res.end('ok');
    console.log('Maintenance mode ended');
  });

  // get all players & ips
  app.get(`/getips/${maintenanceSecret}`, (res) => {
    const playerData = [];
    for (const player of players.values()) {
      playerData.push({
        id: player.id,
        username: player.username,
        ip: player.ip
      });
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(playerData));
  });
  app.get(`/banIp/${maintenanceSecret}/:ip`, (res, req) => {
    const ip = req.getParameter(0);
    bannedIps.add(ip);
    let cnt = 0;
    // kick all players with this ip
    for (const player of players.values()) {
    try {

      if (player.ip.includes(ip)) {
        if (player.ws) player.ws.close();
        else {
          console.log('Player with matching IP has no WebSocket connection', player.username, player.ip, currentDate());
        }
        cnt++;
      }
      } catch(e) {
    console.error('Error banning IP', e, currentDate());
  }
    }


    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/htmk');
    res.end('kick count: ' + cnt+'<br>banned ip: '+ip+'<br> all ips: '+[...bannedIps].join('<br>'));
    console.log('Banned ip', ip, 'kicked', cnt, currentDate());
  });
  app.get(`/unbanIp/${maintenanceSecret}/:ip`, (res, req) => {
    const ip = req.getParameter(0);
    bannedIps.delete(ip);

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/plain');
    res.end('ok');
    console.log('Unbanned ip', ip, currentDate());
  });
  app.get(`/getIpCounts/${maintenanceSecret}`, (res) => {
    const ipCounts = [...ipConnectionCount.entries()].map(([ip, cnt]) => ({ ip, cnt }));
    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(ipCounts));
  });

  app.get(`/enforce-ban/${maintenanceSecret}/:accountId`, (res, req) => {
    const accountId = req.getParameter(0);

    if (!accountId) {
      setCorsHeaders(res);
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: 'Account ID required',
        playerFound: false
      }));
      return;
    }

    // Find player by accountId
    const player = Array.from(players.values()).find(p => p.accountId === accountId);

    if (!player) {
      // Player not connected - this is OK, return success
      setCorsHeaders(res);
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        playerFound: false,
        playerDisconnected: false,
        wasInGame: false,
        message: 'Player not currently connected'
      }));
      console.log('Ban enforcement: Player not connected', accountId, currentDate());
      return;
    }

    let gameInfo = {
      wasInGame: false,
      gameId: null,
      gameType: null,
      opponentRefunded: false,
      opponentAccountId: null
    };

    // Handle active game
    if (player.gameId && games.has(player.gameId)) {
      const game = games.get(player.gameId);
      gameInfo.wasInGame = true;
      gameInfo.gameId = game.id;

      // Determine game type
      if (game.duel && game.public) {
        gameInfo.gameType = 'ranked_duel';

        // For ranked duels, identify opponent
        const playerTag = Object.values(game.players).find(p => p.id === player.id)?.tag;
        if (playerTag && game.accountIds) {
          // Find opponent
          const opponentTag = playerTag === 'p1' ? 'p2' : 'p1';
          const opponentAccountId = game.accountIds[opponentTag];

          if (opponentAccountId) {
            gameInfo.opponentAccountId = opponentAccountId;
            gameInfo.opponentRefunded = true; // Opponent will win via forfeit logic
          }
        }
      } else if (game.public) {
        gameInfo.gameType = 'unranked_multiplayer';
      } else {
        gameInfo.gameType = 'private_multiplayer';
      }

      // Remove player from game (will trigger game.end() if duel)
      game.removePlayer(player, true);
    }

    // Close WebSocket connection
    try {
      player.ws.close();
      console.log('Ban enforcement: Disconnected player', player.username, accountId, currentDate());
    } catch (e) {
      console.error('Ban enforcement: Error closing WebSocket', e, currentDate());
    }

    // Return success response
    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      playerFound: true,
      playerDisconnected: true,
      ...gameInfo,
      message: gameInfo.wasInGame
        ? `Player banned and disconnected from ${gameInfo.gameType}${gameInfo.opponentRefunded ? '. Opponent will be awarded win.' : ''}`
        : 'Player banned and disconnected'
    }));
  });

  // Cosmetics push: the HTTP purchase/equip route calls this so a live ws
  // session picks the change up immediately instead of on the next reconnect.
  //
  // SYNCHRONOUS, DELIBERATELY, and it must stay that way. uWS can discard the
  // res object during an await and then crash the process on
  // "Invalid access of discarded" when the handler finally writes. There is
  // therefore NO DB read here: the caller (which just wrote the doc and holds
  // the new values) passes them in the query string. If this ever has to
  // await, add res.onAborted() BEFORE the first await and check the flag
  // before every write — do not simply add `async`.
  //
  //   /cosmetics-updated/<secret>/<accountId>?nameGlow=<sku>&markerSkin=<sku>&owned=<csv>
  //
  // Absent params are left ALONE (a partial update must not wipe the other
  // fields); an explicitly empty value clears that field.
  app.get(`/cosmetics-updated/${maintenanceSecret}/:accountId`, (res, req) => {
    // Read everything off `req` FIRST: a uWS request object is only valid
    // inside the synchronous body of its handler.
    const accountId = req.getParameter(0);
    const query = new URLSearchParams(req.getQuery() || '');

    if (!accountId) {
      // writeStatus BEFORE writeHeader, always — uWS writes them in call order
      // and a status after a header is a protocol error.
      setCorsHeaders(res);
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Account ID required', playerFound: false }));
      return;
    }

    const player = Array.from(players.values()).find(p => p.accountId === accountId);
    if (!player) {
      // Offline is the NORMAL case for a shop purchase (most buying happens
      // outside a live game), so this is a 200 with playerFound:false — not an
      // error the caller has to special-case or retry.
      setCorsHeaders(res);
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, playerFound: false, broadcast: false }));
      return;
    }

    if (query.has('nameGlow')) player.nameGlow = query.get('nameGlow') || null;
    if (query.has('markerSkin')) player.markerSkin = query.get('markerSkin') || null;
    if (query.has('owned')) {
      const raw = query.get('owned') || '';
      player.ownedCosmetics = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
    }

    // The buyer's own UI, whether or not they're in a game.
    player.send({
      type: 'cosmetics',
      nameGlow: player.nameGlow,
      markerSkin: player.markerSkin,
      owned: player.ownedCosmetics
    });

    // Everyone else in their game gets a PARTIAL patch. Never a whole player
    // object: `action:'update'` with a full replace would stomp live roster
    // fields (score, guess, final, disconnected) with whatever this endpoint
    // happened to know, mid-round.
    let broadcast = false;
    const game = player.gameId ? games.get(player.gameId) : null;
    if (game && game.players[player.id]) {
      // Write the SERVER's roster copy too, not just the wire patch. game.players
      // holds a curated object (Game.addPlayer) and it is what every full state
      // send is built from — getInitialSendState on a rejoin, and the roster a
      // late joiner receives. Patching only the wire meant an equip made
      // mid-game reverted for everyone the moment anybody reconnected.
      game.players[player.id].nameGlow = player.nameGlow;
      game.players[player.id].markerSkin = player.markerSkin;

      game.sendAllPlayers({
        type: 'player',
        action: 'update',
        id: player.id,
        patch: { nameGlow: player.nameGlow, markerSkin: player.markerSkin }
      });
      broadcast = true;
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, playerFound: true, broadcast }));
  });

}

const bannedIps = new Set();
const ipConnectionCount = new Map();
const ipDuelRequestsLast10 = new Map();

safeInterval('ipDuelReqReset', 10000, () => {
  ipDuelRequestsLast10.clear();
});

function updateGameOptions(game, rounds=5, timePerRound=30, location="all", nm=false, npz=false, showRoadName=true, displayLocation="World", disableEmotes, disableChat) {
          // maxDist no longer required-> can be pulled from community map
          if (!location) return;
          if (!rounds || !timePerRound) {
            return;
          }
          // make sure displayLocation isa string
          if (typeof displayLocation !== 'string') {
            displayLocation = null;
          }
          if(displayLocation) {
            // trim to 30 characters
            displayLocation = displayLocation.substring(0, 30);

          }
          // if(!locations || !Array.isArray(locations) || locations.length < 1 || locations.length > 20) return;
          if (rounds < 1 || rounds > 20 || timePerRound < 10 || (timePerRound > 300 && timePerRound !== 60*60*24 )) {
            return;
          }

          if(!nm) nm = false;
          if(!npz) npz = false;
          if(!showRoadName) showRoadName = false;

          game.timePerRound = timePerRound * 1000;
          game.nm = !!nm;
          game.npz = !!npz;
          game.showRoadName = !!showRoadName;
          // Absent = the sender predates this option (stale bundle), so keep
          // the current value — a false default here let any old client's
          // settings save silently un-mute the game. Fresh games are covered
          // by the Game constructor (disableEmotes = false).
          if (disableEmotes !== undefined) game.disableEmotes = !!disableEmotes;
          if (disableChat !== undefined) game.disableChat = !!disableChat;
          game.location = location;
          // clear current locations
          game.locations = [];
          game.rounds = Number(rounds);
          game.displayLocation = displayLocation;

          // generate locations
          game.generateLocations(allLocations);

          game.sendStateUpdate(true);

        }
app.ws('/wg', {
  /* Options */
  compression: uws.SHARED_COMPRESSOR,
  maxPayloadLength: 64 * 1024 * 1024,
  idleTimeout: 300,
  /* Handlers */
  upgrade: (res, req, context) => {
    let ip =  req.getHeader('x-forwarded-for') || req.getHeader('cf-connecting-ip') || 'unknown';
    if(ip.includes(',')) {
      ip = ip.split(',')[0];
    }
    if([...bannedIps].some((bannedIp) => ip.includes(bannedIp))
       || ipConnectionCount.get(ip) && ipConnectionCount.get(ip) > 100) {
      console.log('Banned ip tried to connect', ip, currentDate());
      res.writeStatus('403 Forbidden');
      res.end();
      return;
    }
    res.upgrade({ id: uuidv4(), ip },
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'), context,
    );
  },

  open: (ws, req) => {
    const ip = ws.ip;
    const id = ws.id;
    const connectTime = Date.now();

    // Store connection time for disconnect analysis
    ws.connectTime = connectTime;

    const player = new Player(ws, id, ip);
    if(ip !== 'unknown') ipConnectionCount.set(ip, (ipConnectionCount.get(ip) || 0) + 1);


    player.send({
      type: 't',
      t: Date.now()
    })

    players.set(id, player);

    if (maintenanceMode) {
      player.send({
        type: 'restartQueued',
        value: true
      });
    } else {
      player.send({
        type: 'restartQueued',
        value: false
      });
    }

  },
  message: (ws, message, isBinary) => {
    try {
      // convert array buffer to string
      const str = new TextDecoder().decode(message);
      const json = JSON.parse(str);

      if (!json.type) {
        return;
      }

      if (!players.has(ws.id)) {
        return;
      }

      const player = players.get(ws.id);
      if (!player.verified && json.type !== 'verify') {
        return;
      }
      if (json.type === "pong") {
        // Legacy keepalive — old web bundles and the mobile app still send
        // this every 10s. Nothing reads it (liveness uses the timeSync
        // round-trip); swallow it early instead of walking the whole chain.
        return;
      }
      if (json.type === "timeSync") {
        if (typeof json.clientSentAt === "number") {
          player.send({
            type: "timeSync",
            clientSentAt: json.clientSentAt,
            serverNow: Date.now()
          });
        }
        return;
      }
      if (json.type === 'verify') {
        // verify() is async and awaits several DB calls (validateSecret, friend
        // hydration, lastLogin update). A transient DB rejection used to bubble up as an
        // unhandledRejection — which logs + writes gamestate via stop() on every blip —
        // and left the client wedged OPEN-but-unverified with no signal at all. Catch it:
        //  • if the player never got verified, the failure was on the auth-critical path
        //    (before `verify` was sent) — tell the client so it stops waiting and retries
        //    (its verify-ack timer paces the reconnect). NOT failedToLogin: that logs the
        //    user out, but a DB blip is transient and safe to retry.
        //  • if it already verified, the failure was in the non-critical tail (friend
        //    list / lastLogin) and the client is fine — just log, don't disrupt it.
        player.verify(json).catch((e) => {
          console.error('Error verifying player', ws.id, e?.message || e, currentDate());
          if (!players.has(ws.id)) return;
          const p = players.get(ws.id);
          if (!p.verified) {
            p.send({ type: 'error', message: 'verifyError' });
          }
        });
        return;
      }
      if (json.type === 'screen' && json.screen && typeof json.screen === 'string') {
        player.setScreen(json.screen);
      }

      // Repair a dangling gameId before the queue/create gates below. The id
      // can outlive its game — Game.removePlayer early-returns without
      // clearing it when the roster seat was already pruned, and reconnect
      // re-adopts the same Player object across refreshes — and these gates
      // read a truthy gameId as "already playing", silently dropping the
      // message. For an affected player that is ranked, unranked, party
      // create and 2v2 all dead at once (no error, no ack) until the 30s
      // purge mints them a fresh Player. Raw types on purpose: the
      // create2v2Lobby → createPrivateGame rewrite happens further down.
      // Scoped to the entry gates — every mid-game handler already no-ops on
      // a dead id via its own games.has() guard, and joinPrivateGame
      // self-heals (games.get miss + addPlayer restamp). playAgain2v2 /
      // teamDuelBack carry their own tolerant guard.
      if (player.gameId && !games.has(player.gameId)
        && ['unrankedDuel', 'publicDuel', 'createPrivateGame', 'create2v2Lobby'].includes(json.type)) {
        player.gameId = null;
      }

      if((json.type === 'unrankedDuel') && !player.gameId) {
        if (blockUnnamed(player)) return;
        if(player.banned) {
          player.send({
            type: 'toast',
            key: 'unableToJoinDuel',
            toastType: 'error'
          });
          return;
        }

        // Migration day depends on this gate: the queue must be drainable
        // (ELO_MIGRATION_PLAN Phase 0 — "zero live ranked games" before the
        // elo snapshot pass). Private games and 2v2 already refuse under
        // maintenance; the solo queues were the gap.
        if (maintenanceMode) {
          player.send({
            type: 'toast',
            key: 'maintenanceModeStarted',
            toastType: 'error'
          });
          return;
        }

        player.inQueue = true;
        const queueDetails = {
          guest: player.accountId ? false : true,
          queueTime: Date.now(),
          duel: false
        }
        playersInQueue.set(player.id, queueDetails);
        // Explicitly confirm the join so the client has a signal the queue
        // actually registered. Without this the unranked queue sent nothing back
        // and the client would spin on the matchmaking screen forever if the join
        // was dropped (e.g. socket hiccup) or silently rejected.
        //
        // queuedAt is the SERVER's join instant. Both clients render the
        // elapsed timer from it against their existing clock offset, so nobody
        // keeps a client-side queue-start timestamp that a remount or a
        // backgrounded JS timer can silently corrupt.
        player.send({ type: 'queueJoined', ranked: false, queuedAt: queueDetails.queueTime });
        if(player.ip !== 'unknown' && player.ip.includes('.')) {

          const ipOctets = player.ip.split('.').slice(0, 3).join('.');

          if (!ipDuelRequestsLast10.has(ipOctets)) {
            ipDuelRequestsLast10.set(ipOctets, 1);
          } else {
          log('Duel requests from ip', ipOctets, ipDuelRequestsLast10.get(ipOctets));

            ipDuelRequestsLast10.set(ipOctets, ipDuelRequestsLast10.get(ipOctets) + 1);
          }

          if (ipDuelRequestsLast10.get(ipOctets) > 50) {
            log('Banned IP due to spam', ipOctets);
            bannedIps.add(ipOctets);
            ws.close();

            for(const player of players.values()) {
              if(player.ip.includes(ipOctets)) {
                player.ws.close();
              }
            }
          }
        }

      }


      // Instant testing mode admits guests to ranked: no accountId → the
      // finishers persist nothing (two-account save gate + setElo account
      // guards), so the match is pure feel — stamp a display elo for the
      // matchup math.
      if ((json.type === 'publicDuel') && (player.accountId || BOTS_INSTANT) && !player.gameId) {
        if (blockUnnamed(player)) return;
        if(player.banned) {
          player.send({
            type: 'toast',
            key: 'unableToJoinDuel',
            toastType: 'error'
          });
          return;

        }
        // Migration day depends on this gate: the ranked queue must be
        // drainable (ELO_MIGRATION_PLAN Phase 0 — "zero live ranked games"
        // before the elo snapshot pass). Private games and 2v2 already refuse
        // under maintenance; the solo queues were the gap.
        if (maintenanceMode) {
          player.send({
            type: 'toast',
            key: 'maintenanceModeStarted',
            toastType: 'error'
          });
          return;
        }
        // v2 dodge cooldown. Abandoning a match you were matched into costs
        // the opponent a whole game, so the queue is closed for a bit. v1 has
        // no such concept, hence the flag gate.
        if (RATING_V2) {
          const remaining = dodgeRemaining(dodgeCooldowns, dodgeKeyFor(player));
          if (remaining > 0) {
            player.send({
              type: 'toast',
              // Sentence-as-key: reads verbatim on any client whose locale
              // table predates this string (t() falls back to the key).
              key: `Ranked queue locked for ${Math.ceil(remaining / 1000)}s after leaving a match early`,
              toastType: 'error'
            });
            return;
          }
        }
        if (BOTS_INSTANT && !player.elo) player.elo = 1000;
        // get range of league
        player.inQueue = true;
        // Invalidate the previous answer BEFORE re-reading. Without this the
        // stale `true` from the placement they just finished is still sitting
        // on the Player when the next tick runs, and the backfill would hand
        // them a second placement against a throwing bot. undefined is the
        // "read in flight" state: chooseDuelPairs holds them out for a tick
        // and the placement branch requires an explicit true.
        // botEligibility gets the SAME invalidation for the same event: a
        // just-placed player requeuing inside the DB round-trip still carries
        // ranked:true from the pre-placement read, and the legacy backfill
        // branch would hand them a regular bot instead of human matchmaking.
        if (RATING_V2) {
          player.placementPending = undefined;
          player.botEligibility = undefined;
        }
        // Bot backfill: stamp fresh W/L eligibility on the Player (async,
        // fire-and-forget — backfill only trusts an explicit true, so it
        // kicks in on the first tick after this read resolves). The placement
        // announcement rides a follow-up message rather than the queueJoined
        // ack below: placementPending is ALWAYS undefined at ack time (the
        // invalidate above), and delaying the ack by a DB round trip is worse
        // than a second message. Guarded on still-being-in-the-ranked-queue so
        // a player who bailed before the read landed gets no stale banner.
        refreshBotEligibility(player).then(() => {
          if (RATING_V2 && player.placementPending === true && player.inQueue
              && playersInQueue.get(player.id)?.duel) {
            player.send({ type: 'queuePlacement', placement: true });
          }
        });

        if(!player.league) {

          const queueDetails = {
            guest: true,
            queueTime: Date.now(),
            duel: true
          }
          playersInQueue.set(player.id, queueDetails);
          // No league => no publicDuelRange below, so this is the only join ack
          // the client gets for this case. No rating either, so no ETA — but
          // the elapsed timer still works off queuedAt.
          player.send({ type: 'queueJoined', ranked: true, queuedAt: queueDetails.queueTime });

        } else {
          // v2 queues on a RATING WINDOW, not a league band: the entry carries
          // the raw rating plus queueTime, and the window is recomputed from
          // windowFor(waited) on every tick of the matchmaking loop. The
          // league range is still what the client is sent as publicDuelRange
          // so old bundles keep rendering something sensible.
          // Resolved BEFORE the range: a strict player's displayed band is
          // floored at the Voyager line, so the range depends on this.
          const strictQueue = !!(player.strictMatchmaking && player.elo >= getStrictFloor());

          const range = RATING_V2
            ? rangeForRatingV2(player.elo, 0, strictQueue)
            : getLeagueRange(player.league);


        const queueDetails = {
          min: range[0],
          max: range[1],
          elo: player.elo,
          guest: false,
          queueTime: Date.now(),
          duel: true,
          // v2 only: the authoritative value the matchmaker pairs on. Kept
          // separate from `elo` so nothing v1 accidentally reads it.
          ...(RATING_V2 ? { rating: player.elo, window: windowFor(0) } : {}),
          // Voyager+ opt-in: this player is never matched below the Voyager
          // line. Eligibility is re-checked HERE and not just at settings time,
          // so a derank quietly returns them to the normal pool.
          //
          // THE FLOOR MUST COME FROM getStrictFloor(), NOT `leagues.voyager.min`.
          // That constant is 5,000 on the retired Season 0 scale, and a v2
          // rating tops out near 1,600 — so this expression was false for every
          // account on the ladder and the entry was never stamped strict. The
          // setting was dead end to end (hidden in both clients, rejected by the
          // server, ignored by the matchmaker) while its User field and its
          // "5000+ ELO" copy kept shipping.
          //
          // Under v2 the flag is enforced inside chooseDuelPairs from the very
          // first tick, not only at widening: the window is a symmetric +/-150
          // around your rating, so a 945-rated strict player reaches down into
          // Trekker immediately without it.
          strict: strictQueue
        }
        playersInQueue.set(player.id, queueDetails);

        // send the range to the player
        player.send({
          type: 'publicDuelRange',
          range
        });
        // Uniform join ack across all queue branches (publicDuelRange alone is
        // ELO-display info; queueJoined is the canonical "you're queued" signal).
        player.send({ type: 'queueJoined', ranked: true, queuedAt: queueDetails.queueTime });
      }
        if(player.ip !== 'unknown' && player.ip.includes('.')) {

        const ipOctets = player.ip.split('.').slice(0, 3).join('.');

        if (!ipDuelRequestsLast10.has(ipOctets)) {
          ipDuelRequestsLast10.set(ipOctets, 1);
        } else {
        log('Duel requests from ip', ipOctets, ipDuelRequestsLast10.get(ipOctets));

          ipDuelRequestsLast10.set(ipOctets, ipDuelRequestsLast10.get(ipOctets) + 1);
        }

        if (ipDuelRequestsLast10.get(ipOctets) > 50) {
          log('Banned IP due to spam', ipOctets);
          bannedIps.add(ipOctets);
          ws.close();

          for(const player of players.values()) {
            if(player.ip.includes(ipOctets)) {
              player.ws.close();
            }
          }
        }
      } else {
      }
      }


      if (json.type === 'leaveQueue') {
        const entry = playersInQueue.get(player.id);
        player.inQueue = false;
        playersInQueue.delete(player.id);

        // A cancel can race the pairing beat: pair2v2Solos just de-queued
        // this player for the "Queueing in 3…" preview, so there's no queue
        // entry — but the lobby's auto-queue is armed and about to queue them
        // into the pairing they declined. Dropping the message here (the old
        // `player.inQueue` guard) made Cancel a no-op mid-preview.
        const lobby = player.gameId ? games.get(player.gameId) : null;
        const pendingAutoQueue = !entry && lobby && !lobby.public
          && lobby.state === 'waiting' && !!lobby.autoQueue2v2At;

        if (entry?.mode === '2v2' || pendingAutoQueue) {
          // 2v2 lobbies survive matchmaking, so a cancel returns the WHOLE
          // group (host + teammate) to the same lobby and code. Re-sending the
          // lobby state is enough — the client's `game` handler snaps queued
          // players back into the lobby screen.
          if (lobby && !lobby.public && lobby.state === 'waiting' && lobby.autoPaired) {
            // AUTO-FOUND teammate (stage-1 pairing): cancel dissolves the
            // pairing instead of parking two strangers in a shared lobby.
            // The host keeps this lobby (it was theirs before the pairing);
            // the non-host gets their own fresh lobby back. Whoever did NOT
            // cancel resumes the teammate search in the same burst as their
            // lobby snapshot — a deferred 3s auto-queue stamp here painted a
            // disabled "Queueing in 3…" button the partner couldn't cancel.
            lobby.autoQueue2v2At = null; // mid-preview cancel — disarm the pending auto-queue
            const members = Object.values(lobby.players);
            for (const member of members) {
              const sock = players.get(member.id);
              if (!sock) continue;
              sock.inQueue = false;
              playersInQueue.delete(member.id);
            }
            lobby.autoPaired = false;
            const nonHostEntry = members.find((m) => !m.host);
            const nonHost = nonHostEntry ? players.get(nonHostEntry.id) : null;
            if (nonHost) {
              lobby.removePlayer(nonHost, true); // quiet — no gameShutdown
              const fresh = new Game(uuidv4(), { is2v2Lobby: true });
              games.set(fresh.id, fresh);
              fresh.addPlayer(nonHost, true); // sends them the fresh lobby state
              // State BEFORE queue: the client's `game` handler wipes
              // gameQueued, so enter2v2Queue must follow the snapshot.
              if (nonHost.id !== player.id) queue2v2Members(fresh);
            }
            // By the .host field, not insertion order — [0] only worked via the
            // implicit "host added first, roster capped at 2" invariants.
            const roster = Object.values(lobby.players);
            const hostEntry = roster.find(p => p.host) || roster[0];
            const hostSock = hostEntry ? players.get(hostEntry.id) : null;
            if (hostSock) {
              hostSock.send(lobby.getInitialSendState(hostSock));
              if (hostSock.id !== player.id) queue2v2Members(lobby);
            }
          } else if (lobby && !lobby.public && lobby.state === 'waiting') {
            // CHOSEN teammate (invited / joined by code): the duo belongs
            // together — return the whole group to their shared lobby.
            // Disarm any pending auto-queue (pregame-regroup countdown) so
            // the poll can't re-queue the group right after this restore.
            lobby.autoQueue2v2At = null;
            for (const member of Object.values(lobby.players)) {
              const sock = players.get(member.id);
              if (!sock) continue;
              sock.inQueue = false;
              playersInQueue.delete(member.id);
              sock.send(lobby.getInitialSendState(sock));
            }
          } else {
            // No restorable lobby (never had one, or it's gone/stale) — put
            // them in a fresh one so a 2v2 cancel always lands somewhere
            // instead of leaving the client on the pending lobby shell.
            const gameId = uuidv4();
            const fresh = new Game(gameId, { is2v2Lobby: true });
            games.set(gameId, fresh);
            fresh.addPlayer(player, true);
          }
        }
      }

      if (json.type === 'place' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const latLong = json.latLong;
        const final = json.final;
        const round = json.round;

        // make sure latLong is an array of floats with 2 elements
        if (!Array.isArray(latLong) || latLong.length !== 2) {
          return;
        }

        // make sure final is a boolean
        if (typeof final !== 'boolean') {
          return;
        }

        // validate round if provided (new clients send it, old clients may not)
        if (round !== undefined && round !== null) {
          if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) {
            return;
          }
        }

        game.setGuess(player.id, latLong, final, round);
      }

      // Emotes. DUAL WIRE FORMAT: new clients send `emoteId` (a stable string
      // id from shared/emotes/catalog.js), every shipped mobile build and any
      // cached web bundle still sends `emote` (the legacy integer index into
      // components/emoteReactions.js). emoteId wins when both are present.
      if (json.type === 'emote' && player.gameId && games.has(player.gameId)) {
        const lastEmote = player.lastEmote || 0;
        if (Date.now() - lastEmote < 1500) return;
        const game = games.get(player.gameId);
        // Host muted emotes for this game — drop server-side too (clients hide
        // the FAB, but raw messages and stale clients must not bypass it).
        // MUTE AND RATE LIMIT COME FIRST, BEFORE ANY CATALOGUE OR OWNERSHIP
        // WORK: a paid emote must never be able to buy its way past a host
        // mute or spam a room faster than a free one.
        if (game.disableEmotes) return;

        // Catalogue membership replaces the old `0..9` range check, which
        // accepted two indices (8 and 9) that no client has ever defined —
        // those rendered as undefined on every receiver.
        const emoteDef = typeof json.emoteId === 'string'
          ? getEmote(json.emoteId)
          : byLegacyIndex(json.emote);
        if (!emoteDef) return;

        // Ownership. The null-accountId case (bots and guests) SKIPS the
        // lookup entirely — there is no account to own anything — but the line
        // above confines it to free emotes, so skipping grants nothing. Bots
        // send hardcoded legacy indices 0-7, all free, so they are correct by
        // construction.
        if (!emoteDef.free && !player.accountId) return;
        if (player.accountId && !ownsEmote(player, emoteDef)) return;

        player.lastEmote = Date.now();
        game.sendAllPlayers({
          type: 'emote',
          id: player.id,
          name: player.username,
          countryCode: player.countryCode || null,
          // The equipped glow rides ON THE MESSAGE rather than being looked up
          // client-side off the roster, and the reason is the client, not the
          // server. Both receivers latch a message's presentation once at
          // receipt and never recompute it (see the `tint` discipline in
          // components/gameChat.js) — resolving a glow at render would mean
          // threading the roster into two components that home.js memoises on
          // explicit dep lists, and a roster-derived object rebuilt per render
          // defeats both memos in the hottest component in the app. One nullable
          // sku string on a message the user had to type, at 1/sec, is cheaper
          // than that by any measure. It also survives the sender leaving.
          nameGlow: player.nameGlow ?? null,
          // 'a' | 'b' in team modes (2v2 duels + team parties), null otherwise —
          // clients color the reaction bubble by allegiance.
          team: game.players[player.id]?.team ?? null,
          // A paid emote has NO legacy index, so old receivers get -1, fail
          // their `emote >= 0` check and render NOTHING. That is the intended
          // degradation: showing nothing is strictly better than showing the
          // wrong glyph, which is what any index-remapping scheme would do.
          emote: emoteDef.legacyIndex ?? -1,
          emoteId: emoteDef.id
        });
      }

      // Text chat: private games (party lobbies/games incl. teamGame) are
      // party-wide by default; team contexts (matchmade 2v2 + intra-party
      // team games) let the SENDER pick Team vs All via json.teamOnly (2v2
      // defaults to teammate-only for old bundles that send no flag). Public
      // FFA and 1v1 duels have no chat at all. Senders must be named
      // accounts (guests read-only).
      if (json.type === 'chat' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (!game.players[player.id]) return;
        if (game.public && !game.teamDuel) return;
        // Host disabled chat — drop server-side too (clients hide the panel,
        // but raw messages and stale clients must not bypass it).
        if (game.disableChat) return;
        // Guest-hosted parties are emotes-only for the whole room (roster
        // entries carry accountId, no socket lookup needed).
        const roomHost = Object.values(game.players).find((p) => p.host);
        if (roomHost && !roomHost.accountId) return;
        if (!player.accountId || !player.username || player.banned) return;
        let message = json.message;
        if (typeof message !== 'string') return;
        message = message.trim();
        if (message.length < 1 || message.length > 200) return;
        if (Date.now() - (player.lastMessage || 0) < 1000) return;
        player.lastMessage = Date.now();
        // bad-words throws on input with no word characters (emoji-only);
        // those can't contain wordlist entries, so keep the original.
        try { message = chatFilter.clean(message); } catch (e) { }
        // Channel: team contexts (matchmade 2v2 AND intra-party team games)
        // let the SENDER pick team vs everyone via json.teamOnly. Absent =
        // the legacy audience for the game type, so old bundles keep their
        // contract: 2v2 stays teammate-only, team parties stay party-wide.
        const teamCapable = !!(game.teamDuel || game.teamGame);
        const teamOnly = teamCapable
          ? (typeof json.teamOnly === 'boolean' ? json.teamOnly : !!game.teamDuel)
          : false;
        const payload = {
          type: 'chat',
          id: player.id,
          name: player.username,
          countryCode: player.countryCode || null,
          // Same reasoning as the emote payload above: latched at receipt by the
          // client, so it has to arrive with the message.
          nameGlow: player.nameGlow ?? null,
          team: game.players[player.id]?.team ?? null,
          teamChat: teamOnly, // clients badge team-channel messages
          message,
        };
        if (teamOnly) {
          const team = game.players[player.id]?.team;
          if (team !== 'a' && team !== 'b') return;
          game.sendTeam(team, payload);
        } else {
          game.sendAllPlayers(payload);
        }
      }

      // Typing indicator: same audience and gates as chat, throttled harder.
      // No stop-typing message — clients prune on a ~3s TTL.
      if (json.type === 'chatTyping' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (!game.players[player.id]) return;
        if (game.public && !game.teamDuel) return;
        if (game.disableChat) return;
        const roomHost = Object.values(game.players).find((p) => p.host);
        if (roomHost && !roomHost.accountId) return;
        if (!player.accountId || !player.username || player.banned) return;
        if (Date.now() - (player.lastTypingPing || 0) < 1500) return;
        player.lastTypingPing = Date.now();
        const payload = { type: 'chatTyping', id: player.id, name: player.username };
        // Typing follows the same channel rules as chat.
        const teamCapable = !!(game.teamDuel || game.teamGame);
        const teamOnly = teamCapable
          ? (typeof json.teamOnly === 'boolean' ? json.teamOnly : !!game.teamDuel)
          : false;
        if (teamOnly) {
          const team = game.players[player.id]?.team;
          if (team !== 'a' && team !== 'b') return;
          game.sendTeam(team, payload);
        } else {
          game.sendAllPlayers(payload);
        }
      }

      // Host force-ends a stalled round (private games only). The use case is
      // timer-disabled parties where idle players hold the round open forever;
      // the collapse reuses the "everyone placed" path — pull nextEvtTime to
      // ~1s so in-flight guesses still land instead of cutting hard to zero.
      if (json.type === 'forceEndRound' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || !game.players[player.id]?.host) return;
        if (game.state !== 'guess') return;
        if (game.nextEvtTime - Date.now() <= 1000) return; // already collapsing
        // No toast — the collapsing countdown is the announcement (a "host
        // ended the round" toast was deemed too distracting; USER RULING).
        game.nextEvtTime = Date.now() + 1000;
        game.sendStateUpdate();
      }

      if (json.type === 'leaveGame' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // DODGE (v2 only). "Pre-game leave" = walking out of a ranked duel you
        // were already matched into, during the getready window before round 1
        // has been played. That is the move that costs a real opponent a whole
        // game, and it is what the cooldown exists to price.
        //
        // Cancelling the QUEUE is deliberately NOT a dodge: nobody has been
        // matched yet, so nobody paid anything, and punishing Cancel would
        // make the button hostile.
        //
        // Placement matches are EXEMPT. A placement is a brand-new account's
        // very first game against a bot that throws — locking them out of
        // ranked for backing out of it is the worst possible first impression,
        // and there is no opponent to compensate.
        //
        // The rule itself lives in recordDodgeIfApplicable so the socket-close
        // path books the identical dodge: closing the tab used to be free.
        recordDodgeIfApplicable(player, game, 'leaveGame');
        game.removePlayer(player);
      }

      // ── Post-game team-duel results actions ──────────────────────────────
      // playAgain2v2: consensus requeue. Ack; when every LIVING teammate has
      // acked, the team regroups into a fresh staging lobby and goes straight
      // into matchmaking (duo → opponents search, solo → teammate search).
      if (json.type === 'playAgain2v2' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const me = game.players[player.id];
        if (game.teamDuel && game.state === 'end' && me?.team) {
          game.playAgainAcks = game.playAgainAcks || { a: {}, b: {} };
          game.playAgainAcks[me.team][player.id] = true;
          const { needed, ackedIds } = game.livingTeamPlayAgain(me.team);
          if (needed >= 1 && ackedIds.length >= needed) {
            // Queue in the same burst as the lobby's `game` payload — leaving
            // it to the 500ms autoQueue2v2At poll makes the client paint the
            // staging lobby for up to one tick before the queue screen.
            const lobby = game.regroupTeamFromResults(me.team, { queue: true });
            if (lobby) queue2v2Members(lobby);
          } else {
            game.sendPlayAgainState(me.team);
          }
        }
      }

      // teamDuelBack: leave the results for a staging lobby WITHOUT queueing.
      // Auto-paired members act solo (the pairing dissolves); a chosen duo's
      // host takes the whole team back together; chosen guests have no
      // in-screen Back (client hides it — this guard enforces it) unless
      // they're the last one standing.
      if (json.type === 'teamDuelBack' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const me = game.players[player.id];
        if (game.teamDuel && game.state === 'end' && me?.team) {
          const team = me.team;
          const isChosen = !game.autoPairedTeams?.[team];
          const isHost = game.teamHostIds?.[team] === player.id;
          const living = game.teamMembers(team).length;
          if (isChosen && !isHost && living > 1) return;
          game.regroupTeamFromResults(team, {
            onlyPlayerId: (isChosen && isHost) ? null : player.id,
            queue: false
          });
        }
      }

      // Results-screen buttons must never dead-click: if the ended game is
      // already gone from under the client (2h idle sweep, server restart),
      // restage the sender in a fresh solo staging lobby instead of silently
      // dropping the message — Play Again queues it (stage-1 teammate
      // search), Back just parks there. inQueue means they're not on a
      // results screen; a live gameId means the handlers above own it.
      if ((json.type === 'playAgain2v2' || json.type === 'teamDuelBack')
          && (!player.gameId || !games.has(player.gameId)) && !player.inQueue) {
        const lobby = new Game(uuidv4(), { is2v2Lobby: true });
        games.set(lobby.id, lobby);
        if (json.type === 'playAgain2v2') lobby.autoQueue2v2At = Date.now();
        lobby.addPlayer(player, true);
        // Same-burst queue as the consensus path above — no 500ms poll wait.
        if (json.type === 'playAgain2v2') queue2v2Members(lobby);
      }

      if (json.type === 'updateCountryCode' && player.accountId && typeof json.countryCode === 'string') {
        // Update player's countryCode
        player.countryCode = json.countryCode || null;
      }

      if (json.type === "inviteFriend" && player.accountId && json.friendId && player.gameId) {
        // here friendId is the socket id
        const friend = players.get(json.friendId);
        if (!friend) {
          return;
        }

        const game = games.get(player.gameId);
        if (!game || game.public) {
          return;
        }

        // make sure the friend is not already in this game
        if (friend.gameId === player.gameId) {
          player.send({
            type: 'toast',
            key: 'alreadyInYourGame',
            toastType: 'error'
          });
          return;
        }

        // Full party / 2v2 staging lobby: the invite could never be accepted
        // (joinGameByCode bounces with gameIsFull) — refuse at send time so
        // the INVITER learns immediately instead of the friend on accept.
        // After the already-in-game check so that more specific toast wins.
        if (Object.keys(game.players).length >= game.maxPlayers) {
          player.send({
            type: 'toast',
            key: 'gameIsFull',
            toastType: 'error'
          });
          return;
        }

        // make sure the friend is friends with the player
        if (!player.friends.find((f) => f.id === friend.accountId)) {
          return;
        }

        if (Date.now() - friend.lastInvite < 5000) {
          player.send({
            type: 'toast',
            key: "inviteCooldown",
            t: ((5000 - (Date.now() - friend.lastInvite)) / 1000).toFixed(1)
          });
          return;
        }

        friend.lastInvite = Date.now();

        friend.send({
          type: 'invite',
          code: game.code,
          invitedByName: player.username,
          invitedById: player.id // socket id
        });

        player.send({
          type: 'toast',
          key: "inviteSent",
          name: friend.username,
          toastType: 'success'
        });
      }


      if (json.type === 'acceptInvite' && json.code && player.accountId) {
        if (blockUnnamed(player)) return;
        // Block banned users and users with pending name changes from multiplayer
        if (player.banned) {
          player.send({
            type: 'toast',
            key: 'accountSuspended',
            toastType: 'error'
          });
          return;
        }

        joinGameByCode(json.code, () => {
          player.send({
            type: 'toast',
            key: 'gameIsFull',
            toastType: 'error'
          });
        }, () => {
          player.send({
            type: 'toast',
            key: 'invalidGameCode',
            toastType: 'error'
          });
        }, (game) => {
          // Locked parties reject friend invites too — the host locked the
          // door; unlock to admit. (Guest gate is moot here: acceptInvite
          // already requires accountId.) Sentence-as-key for old bundles.
          if (game.locked) {
            player.send({ type: 'toast', key: 'This party is locked', toastType: 'error' });
            return;
          }
          // Rollout gate: a friend on a pre-team client accepted an invite into
          // a team lobby it can't render. Reject BEFORE the leave-queue /
          // leave-game side effects. Sentence-as-key: old clients show unknown
          // toast keys verbatim.
          if ((game.teamGame || game.is2v2Lobby || game.teamDuel) && !player.teamSupport) {
            player.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
            return;
          }

          // leave queue if in
          if (player.inQueue) {
            player.inQueue = false;
            playersInQueue.delete(player.id);
          }

          // leave current game if in
          if (player.gameId) {
            const curGame = games.get(player.gameId);
            curGame.removePlayer(player);
          }

          // add player to game
          game.addPlayer(player);

          // send success
          player.send({
            type: 'toast',
            key: 'inviteAccepted',
            toastType: 'success'
          });

          const friendPlayer = players.get(json.invitedById);
          // make sure you are his friend
          if (friendPlayer && player.friends.find((f) => f.id === friendPlayer.accountId)) {
            friendPlayer.send({
              type: 'toast',
              key: 'inviteAcceptedBy',
              name: player.username,
              toastType: 'success'
            });
          }
        })
      }

      // Account-settings writes (settings UI). Discipline for both handlers:
      // the in-memory player field — which sendFriendData echoes as the
      // authoritative value — changes ONLY after the DB write sticks, and
      // EVERY path (cooldown, success, failure) ends in sendFriendData() so an
      // optimistically-flipped client always reconciles to server truth.
      if (json.type === "setAllowFriendReq" && typeof json.allow === 'boolean' && player.accountId) {

        if (Date.now() - player.lastAllowFriendReqChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastAllowFriendReqChange) / 1000),
            toastType: 'error'
          });
          player.sendFriendData(); // snap the optimistic client back
          return;
        }
        player.lastAllowFriendReqChange = Date.now();
        User.updateOne({ _id: player.accountId }, { allowFriendReq: json.allow }).then(() => {
          player.allowFriendReq = json.allow;
          player.send({
            type: 'toast',
            key: 'preferenceUpdated'
          });
          player.sendFriendData();
        }).catch((e) => {
          console.log(e);
          player.sendFriendData(); // write failed — echo the unchanged truth
        });
      }

      // Privacy toggle: hide own "last seen" from friends.
      if (json.type === "setHideLastSeen" && typeof json.hide === 'boolean' && player.accountId) {

        if (Date.now() - player.lastHideLastSeenChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastHideLastSeenChange) / 1000),
            toastType: 'error'
          });
          player.sendFriendData(); // snap the optimistic client back
          return;
        }
        player.lastHideLastSeenChange = Date.now();
        User.updateOne({ _id: player.accountId }, { hideLastSeen: json.hide }).then(() => {
          player.hideLastSeen = json.hide;
          player.send({
            type: 'toast',
            key: 'preferenceUpdated'
          });
          player.sendFriendData();
        }).catch((e) => {
          console.log(e);
          player.sendFriendData(); // write failed — echo the unchanged truth
        });
      }

      // Voyager+ ranked preference (setHideLastSeen's exact shape, incl. the
      // cooldown + authoritative sendFriendData echo on every outcome). The
      // clients hide the toggle below Voyager, but never trust that: turning
      // it ON requires the elo here too — a low-elo client poking the wire
      // could otherwise park itself in a pool it doesn't belong to. OFF is
      // always allowed (deranked players must be able to clear it).
      if (json.type === "setStrictMatchmaking" && typeof json.strict === 'boolean' && player.accountId) {
        if (json.strict && (!player.elo || player.elo < getStrictFloor())) {
          player.sendFriendData(); // snap the optimistic client back
          return;
        }
        if (Date.now() - player.lastStrictMatchmakingChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastStrictMatchmakingChange) / 1000),
            toastType: 'error'
          });
          player.sendFriendData();
          return;
        }
        player.lastStrictMatchmakingChange = Date.now();
        User.updateOne({ _id: player.accountId }, { strictMatchmaking: json.strict }).then(() => {
          player.strictMatchmaking = json.strict;
          player.send({
            type: 'toast',
            key: 'preferenceUpdated'
          });
          player.sendFriendData();
        }).catch((e) => {
          console.log(e);
          player.sendFriendData();
        });
      }

      // ---- DEPRECATED protocol shims (remove after the next web deploy) ----
      // Pre-unification web tabs still send these; alias them onto the unified
      // messages so live sessions keep working across the server deploy.
      if (json.type === 'create2v2Lobby') { json.type = 'createPrivateGame'; json.mode = '2v2'; }
      if (json.type === 'join2v2Lobby') { json.type = 'joinPrivateGame'; }

      if (json.type === 'createPrivateGame' && !player.gameId) {
        if (blockUnnamed(player)) return;

        // Block banned users and users with pending name changes from multiplayer
        if (player.banned) {
          player.send({
            type: 'toast',
            key: 'accountSuspended',
            toastType: 'error'
          });
          return;
        }

        // send toast if maintenance
        if (maintenanceMode) {
          player.send({
            type: 'toast',
            key: 'maintenanceModeStarted',
            toastType: 'error'
          });
          return;
        }

        // 2v2 staging needs a team-capable client (rollout gate: pre-team
        // bundles and the mobile app don't announce teamSupport in verify).
        // Normal parties stay open to everyone. Sentence-as-key: this toast is
        // only ever seen by old clients, whose t() renders unknown keys verbatim.
        if (json.mode === '2v2' && !player.teamSupport) {
          player.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
          return;
        }

        // Guests can't start NEW 2v2 games — the client shows a link-Google
        // modal instead of ever sending this, so the sentence-as-key toast
        // only covers stale or hand-rolled clients. In-flight 2v2 games are
        // untouched: this guards staging-lobby creation only. Instant testing
        // mode admits guests (nothing persists for them anyway).
        if (json.mode === '2v2' && !player.accountId && !BOTS_INSTANT) {
          player.send({ type: 'toast', key: 'Link your account to play 2v2', toastType: 'error' });
          return;
        }

        // Creating a lobby cancels any matchmaking search. addPlayer below
        // already drops the inQueue flag (which every pairer re-checks), but
        // do it explicitly like acceptInvite so the invariant is local and
        // the stale playersInQueue entry doesn't linger until a pairer sweep.
        if (player.inQueue) {
          player.inQueue = false;
          playersInQueue.delete(player.id);
        }

        const gameId = uuidv4();
        // mode:'2v2' → a 2-max staging lobby for the 2v2 queue. It never plays
        // itself (Find Match dissolves it into the matchmaker), so it skips
        // game options / location generation entirely.
        const is2v2Lobby = json.mode === '2v2';
        const game = new Game(gameId, { is2v2Lobby });
        // Comms are EXCLUSIVE everywhere chat exists (user ruling: never
        // both). Fresh parties default to chat (host can flip to emotes);
        // 2v2 staging has no host options and is chat-only, full stop.
        // GUEST-created parties are emotes-only (user ruling): a guest can
        // neither send chat nor moderate a chat room, so it never opens.
        if (!is2v2Lobby && !player.accountId) {
          game.disableChat = true;
        } else {
          game.disableEmotes = true;
        }
        games.set(gameId, game);
        game.addPlayer(player, true);
        if (!is2v2Lobby) {
          // initialize with default options
          updateGameOptions(game);
        }
      }

      if(json.type === "resetGame" && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // make sure player is host; never reset over an in-flight save (the
        // end-state auto-reset in the game loop waits the same way) — a reset
        // clears roundHistory out from under the running persist.
        if(game.players[player.id].host && !game.saveInProgress) {
          // Host is cutting a live match short — tell the members why they're
          // suddenly back in the lobby. End-state resets stay silent: the game
          // loop auto-resets those on a timer, so a lobby return is expected.
          // Round-1 countdown resets are silent too (preGame, mirrors the
          // teamDuel carve-out): "host ended the match" is wrong copy for a
          // cancelled start, and the lobby reappearing explains itself.
          if (['getready', 'guess'].includes(game.state)
              && !(game.state === 'getready' && game.curRound <= 1)) {
            for (const pid of Object.keys(game.players)) {
              if (pid === player.id) continue;
              players.get(pid)?.send({ type: 'toast', key: 'hostEndedMatch', toastType: 'info' });
            }
          }
          game.resetGame(allLocations);
        }
      }


      if(json.type === "setPrivateGameOptions" && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // make sure player is host
        if(game.players[player.id].host) {
          let { rounds, timePerRound, location, nm, npz, showRoadName, displayLocation, disableEmotes, disableChat } = json;
          updateGameOptions(game, rounds, timePerRound, location, nm, npz, showRoadName, displayLocation, disableEmotes, disableChat);

        }
      }

      // ---- Intra-party team mode ----
      // Deliberately separate from setPrivateGameOptions: that path clears and
      // regenerates locations on every call, which a team toggle must not do.
      // All three reject silently on bad state — the broadcast is the source
      // of truth and the lobby UI renders only server state.
      if (json.type === 'setTeamConfig' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host) return;
        // Rollout gate: the party may have formed as a normal lobby, so members
        // on pre-team clients can be sitting in it. Remove them BEFORE the mode
        // flips (applyTeamConfig assigns teams to whoever remains) — the
        // standard kick teardown is something every client vintage handles.
        // The host (who sent this) always has teamSupport, so is never kicked.
        if (json.enabled === true && !game.teamGame) {
          for (const pid of Object.keys(game.players)) {
            const member = players.get(pid);
            if (member?.teamSupport) continue;
            // Never strand a searching client (mirrors kickPlayer). Unreachable
            // — unsupported members can't be 2v2-queued — but raw messages
            // must not strand players.
            if (member?.inQueue || playersInQueue.has(pid)) continue;
            const memberName = game.players[pid].username;
            if (member) {
              // Sentence-as-key: old clients render unknown toast keys verbatim.
              member.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
              game.removePlayer(member);
            } else {
              // Roster entry whose socket is already gone — just drop it.
              delete game.players[pid];
              game.sendAllPlayers({ type: 'player', id: pid, action: 'remove' });
            }
            player.send({ type: 'toast', key: 'playerKicked', name: memberName, toastType: 'info' });
          }
        }
        game.applyTeamConfig(json);
      }

      // ---- Party security ----
      // Separate from setPrivateGameOptions for the same reason as
      // setTeamConfig: that path clears and regenerates locations on every
      // call, which a lock/guest toggle must never do.
      if (json.type === 'setPartySecurity' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.is2v2Lobby) return;
        if (!game.players[player.id]?.host) return;
        const wasLocked = !!game.locked;
        const wasAllowGuests = game.allowGuests !== false;
        if (typeof json.locked === 'boolean') game.locked = json.locked;
        if (typeof json.allowGuests === 'boolean') game.allowGuests = json.allowGuests;
        // Everyone sees the door state change, not just the host.
        if (!!game.locked !== wasLocked) {
          game.sendAllPlayers({
            type: 'toast',
            key: game.locked ? 'partyLocked' : 'partyUnlocked',
            toastType: 'info'
          });
        }
        // Guests-off clears CURRENT guests too, not just future joins.
        // Lobby state only — a mid-game removePlayer trips forfeit paths.
        // kickPlayer's guards apply: never the host, never a queued member
        // (must not strand a searching client), and socketless roster entries
        // are left for the disconnect purge (their accountId is unknowable).
        if (wasAllowGuests && game.allowGuests === false && game.state === 'waiting') {
          for (const pid of Object.keys(game.players)) {
            // A removePlayer broadcast can self-prune ghost roster entries
            // mid-sweep (sendAllPlayers drops entries whose Player is gone) —
            // re-check the snapshot pid still exists before touching it.
            if (!game.players[pid]) continue;
            if (pid === player.id || game.players[pid].host) continue;
            const member = players.get(pid);
            if (!member || member.accountId) continue;
            if (member.inQueue || playersInQueue.has(pid)) continue;
            // Sentence-as-key: guests can be on any client vintage.
            member.send({ type: 'toast', key: 'Log in to join this party', toastType: 'error' });
            game.removePlayer(member);
          }
        }
        game.sendStateUpdate();
      }

      if (json.type === 'shuffleTeams' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host || !game.teamGame) return;
        game.shuffleTeamsEvenly();
      }

      if (json.type === 'setPlayerTeam' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // The client flips the row optimistically before this arrives, so a
        // rejected move must answer with the real state or that client shows
        // the wrong team until some unrelated broadcast fixes it.
        const rejectAndResync = () => {
          if (game.players[player.id]) player.send(game.getInitialSendState(player));
        };
        if (game.public || game.is2v2Lobby || game.state !== 'waiting' || !game.teamGame) return rejectAndResync();
        const { playerId, team } = json;
        if (team !== 'a' && team !== 'b') return;
        if (typeof playerId !== 'string' || !game.players[playerId]) return rejectAndResync();
        const isHost = !!game.players[player.id]?.host;
        // Hosts move anyone; others move only themselves, and only when the
        // host has allowed self-picking.
        if (!isHost && !(game.allowTeamPick && playerId === player.id)) return rejectAndResync();
        game.players[playerId].team = team;
        game.sendStateUpdate();
      }

      if (json.type === 'joinPrivateGame') {
        // gameJoinError (not a toast) so both join surfaces — the join screen
        // and the ?party= deep link — resolve their pending/spinner state.
        if (blockUnnamed(player, true)) return;
        // Block banned users and users with pending name changes from multiplayer
        if (player.banned) {
          player.send({
            type: 'toast',
            key: 'accountSuspended',
            toastType: 'error'
          });
          return;
        }

        // Joining out of a game requires an explicit leaveGame first — EXCEPT
        // from a 2v2 staging lobby, which may be hopped out of silently (e.g.
        // entering a friend's code while sitting in your own auto-created lobby).
        const current = player.gameId ? games.get(player.gameId) : null;
        if (current && !current.is2v2Lobby) return;

        let code = json.gameCode;

        // find game by code — ONE join path for every private-lobby code
        // (party or 2v2 staging), so codes and ?party= links are interchangeable
        joinGameByCode(code, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Game is full'
          });
        }, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Invalid game code'
          });
        }, (game) => {
          if (game.id === current?.id) {
            // Entering the code of the lobby you're already in.
            player.send({ type: 'gameJoinError', error: 'Invalid game code' });
            return;
          }
          // Party security gates. Plain sentences: gameJoinError strings are
          // displayed verbatim on every client vintage. Rejoins are unaffected
          // (they ride the rejoinCode path, not this one).
          if (game.locked) {
            player.send({ type: 'gameJoinError', error: 'This party is locked' });
            return;
          }
          if (game.allowGuests === false && !player.accountId) {
            player.send({ type: 'gameJoinError', error: 'Log in to join this party' });
            return;
          }
          // Rollout gate: clients that didn't announce teamSupport in verify
          // can't render team lobbies/duels. gameJoinError text is displayed
          // verbatim on every client vintage (join screen / toast).
          if ((game.teamGame || game.is2v2Lobby || game.teamDuel) && !player.teamSupport) {
            player.send({
              type: 'gameJoinError',
              error: 'Play team games on worldguessr.com for now'
            });
            return;
          }
          // Guests can't enter 2v2 staging lobbies (they couldn't queue from
          // one anyway — queue2v2Members re-checks). Party/team lobbies stay
          // open to guests: intra-party team games are deliberately allowed.
          if (game.is2v2Lobby && !player.accountId) {
            player.send({
              type: 'gameJoinError',
              error: 'Link your Google account to play 2v2',
              // Additive + backwards compatible: old bundles ignore unknown
              // fields and keep matching on the error string above (do NOT
              // change it). New clients personalize the conversion prompt
              // with the inviter's name.
              hostName: Object.values(game.players).find((p) => p.host)?.username || undefined
            });
            return;
          }
          // Joining by code cancels any matchmaking search. addPlayer below
          // already drops the inQueue flag (which every pairer re-checks),
          // but do it explicitly like acceptInvite so the invariant is local
          // and the stale queue entry doesn't linger until a pairer sweep.
          if (player.inQueue) {
            player.inQueue = false;
            playersInQueue.delete(player.id);
          }
          if (current) current.removePlayer(player, true);
          game.addPlayer(player);
        });
      }

      if (json.type === 'startGameHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.players[player.id].host) {
          game.start(player);
        }
      }

      // Host kicks a player from a private waiting lobby. The kicked client
      // gets an explanatory toast followed by the standard gameShutdown
      // teardown; the host gets a confirmation toast; everyone else sees the
      // regular roster-remove broadcast.
      if (json.type === 'kickPlayer' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // No kicking in 2v2 staging lobbies: the seat opposite the host is a
        // matched stranger or regrouping teammate, not a guest of the host's
        // party. Real parties (including team-mode) keep host kick.
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host) return;
        const targetId = json.playerId;
        if (typeof targetId !== 'string' || targetId === player.id || !game.players[targetId]) return;

        const targetName = game.players[targetId].username;
        const target = players.get(targetId);
        // No kicking a teammate who is mid-queue: removePlayer would clear
        // their inQueue with nothing their searching screen reacts to,
        // stranding the client. (Unreachable via the UI — the lobby is hidden
        // while queued — but raw messages must not strand players.)
        if (target?.inQueue || playersInQueue.has(targetId)) return;
        if (target) {
          target.send({ type: 'toast', key: 'kickedFromParty', toastType: 'error' });
          game.removePlayer(target);
        } else {
          // Roster entry whose socket is already gone — just drop it.
          delete game.players[targetId];
          game.sendAllPlayers({ type: 'player', id: targetId, action: 'remove' });
        }
        player.send({ type: 'toast', key: 'playerKicked', name: targetName, toastType: 'success' });
      }

      // Host hands the crown to another member of a private waiting lobby.
      // After this, the host-leave disband rule follows the NEW host — that's
      // the point: the creator can hand off and leave without nuking the party.
      if (json.type === 'transferHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // Same surface as kickPlayer: real parties only, lobby state only.
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host) return;
        const targetId = json.playerId;
        if (typeof targetId !== 'string' || targetId === player.id || !game.players[targetId]) return;
        const target = players.get(targetId);
        // Never crown a ghost: a roster entry whose socket is gone (purge
        // pending) could neither run the lobby nor disband it by leaving.
        if (!target || target.disconnected) return;
        // No transfers while the lobby is queue-bound (find2v2Match keeps
        // members in 'waiting' with their gameId while searching): the
        // per-member full payload below is the exact snap-back-to-lobby
        // signal the 2v2 code uses, and sending it to searching clients
        // desyncs them (mirrors kickPlayer's mid-queue guard).
        if (Object.keys(game.players).some((pid) => players.get(pid)?.inQueue || playersInQueue.has(pid))) return;
        game.players[player.id].host = false;
        game.players[targetId].host = true;
        // A guest heir can't send chat or moderate it — the room flips to
        // emotes-only the moment the crown lands (user ruling). One-way: a
        // later transfer back to an account holder keeps emotes until that
        // host re-enables chat in settings.
        if (!target.accountId && !game.disableChat) {
          game.disableChat = true;
          game.disableEmotes = false;
        }
        // Per-recipient full payloads, not a bare broadcast: each client's own
        // `host` flag rides getInitialSendState only, and every host-gated
        // surface (settings, kick, start, security) must flip immediately.
        for (const pid of Object.keys(game.players)) {
          const sock = players.get(pid);
          if (sock && !sock.disconnected) sock.send(game.getInitialSendState(sock));
        }
        // Sentence-as-key: the new host may be on an old bundle.
        target.send({ type: 'toast', key: 'You are now the party host', toastType: 'success' });
        player.send({ type: 'toast', key: 'hostTransferred', name: game.players[targetId].username, toastType: 'success' });
      }

      // ---- 2v2 team mode ----
      // Find Match from any private waiting lobby with 1-2 players (the 2v2
      // staging lobby, or a small party): host-only; queues everyone for 2v2 —
      // solo (random teammate) or as a full duo — and dissolves the lobby.
      if (json.type === 'find2v2Match' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.state !== 'waiting' || !game.players[player.id]?.host) return;
        if (game.teamGame) return; // a team-mode party must never dissolve into the ranked queue
        if (Object.keys(game.players).length > 2) return; // 2v2 queues take at most a duo
        if (blockUnnamed(player)) return;
        if (player.banned) {
          player.send({ type: 'toast', key: 'accountSuspended', toastType: 'error' });
          return;
        }
        if (maintenanceMode) {
          player.send({ type: 'toast', key: 'maintenanceModeStarted', toastType: 'error' });
          return;
        }
        // Rollout gate: every seat headed into a team duel must be a
        // team-capable client. The usual trip here is a host queueing a small
        // party whose partner is on a pre-team client (normal-party joins
        // aren't gated). The host sending this is on a current bundle, so a
        // real locale key is fine.
        if (Object.keys(game.players).some(pid => !players.get(pid)?.teamSupport)) {
          player.send({ type: 'toast', key: 'teammateNeedsUpdate', toastType: 'error' });
          return;
        }
        queue2v2Members(game);
        // The lobby stays alive (members keep their gameId) so leaveQueue can
        // put the whole group back into it — same code, same teammate. The
        // matchmaker tears it down when a match actually forms.
      }

      if (json.type === 'getFriends') {
        player.sendFriendData();
      }

      if (json.type === 'sendFriendRequest') {
        if (!player.accountId) {
          player.send({ type: 'friendReqState', state: 0 })
          return;
        }
        if (!json.name || typeof json.name !== "string" || json.name.length < 3 || json.name.length > 30 || !/^[a-zA-Z0-9_]+$/.test(json.name)) {
          player.send({ type: 'friendReqState', state: 0 })
          return;
        }
        // cannot have more than 100 friends
        if (player.friends.length > 100) {
          player.send({ type: 'friendReqState', state: 7 })
          return;
        }
        // cannot have more than 100 sent reqs
        if (player.sentReq.length > 100) {
          player.send({ type: 'friendReqState', state: 7 })
          return;
        }
        console.log(`[WS] friendRequest lookup: ${json.name}`);
        User.findOne({ username: json.name }).collation(USERNAME_COLLATION).then(async (friend) => {
          if (!friend) {
            player.send({ type: 'friendReqState', state: 3 })
            return;
          }
          if (!friend.allowFriendReq) {
            player.send({ type: 'friendReqState', state: 2 })
            return;
          }
          // cannot have more than 100 received requests
          if (friend.receivedReq.length > 100) {
            player.send({ type: 'friendReqState', state: 7 })
            return;
          }
          if (friend._id.toString() === player.accountId) {
            player.send({ type: 'friendReqState', state: 7 })
            return;
          }
          if (player.friends.findIndex((f) => f.id === friend._id.toString()) > -1) {
            player.send({ type: 'friendReqState', state: 6 })
            return;
          }
          if (player.sentReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
            player.send({ type: 'friendReqState', state: 4 })
            return;
          }
          // cannot have a friedn request received from this user
          if (player.receivedReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
            player.send({ type: 'friendReqState', state: 5 })
            return;
          }

          // update mongodb
          await User.updateOne({ _id: player.accountId }, { $push: { sentReq: friend._id.toString() } });
          await User.updateOne({ _id: friend._id }, { $push: { receivedReq: player.accountId } });

          // update player
          player.sentReq.push({ id: friend._id.toString(), name: friend.username });
          player.sendFriendData();
          player.send({ type: 'friendReqState', state: 1 })

          // is user online
          const friendPlayer = Array.from(players.values()).find((p) => p.accountId === friend._id.toString());
          if (friendPlayer) {
            friendPlayer.send({ type: 'friendReq', id: player.accountId, name: player.username });

            friendPlayer.receivedReq.push({ id: player.accountId, name: player.username });
            friendPlayer.sendFriendData();
          }
        }).catch((e) => {
          console.log(e);
        });


      }

      if (json.type === 'cancelRequest' && player.accountId && json.id) {
        if (typeof json.id !== "string") {
          return;
        }

        // check if the request exists (player side)
        const exists = player.sentReq.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        player.sentReq.splice(exists, 1);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.receivedReq.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.receivedReq.splice(exists, 1);
            friendPlayer.sendFriendData();
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { sentReq: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { receivedReq: player.accountId } }).then(() => {

            player.sendFriendData();
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'acceptFriend' && player.accountId && json.id) {
        // check if the request exists (player side)
        const exists = player.receivedReq.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        const friend = player.receivedReq.splice(exists, 1)[0];
        player.friends.push(friend);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.sentReq.splice(exists, 1);
            friendPlayer.friends.push({ id: player.accountId, name: player.username.toString() });
            friendPlayer.sendFriendData();
            // friendPlayer.send({type:'newFriend', id: player.accountId, name: player.username});
            friendPlayer.send({ type: 'toast', key: 'newFriend', name: player.username, toastType: 'success' });
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { receivedReq: json.id }, $push: { friends: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { sentReq: player.accountId }, $push: { friends: player.accountId } }).then(() => {

            player.sendFriendData();
            // player.send({type:'newFriend', id: json.id, name: friend.name});
            player.send({ type: 'toast', key: 'newFriend', name: friend.name, toastType: 'success' });
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'declineFriend' && player.accountId && json.id) {
        // check if the request exists (player side)
        const exists = player.receivedReq.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        player.receivedReq.splice(exists, 1);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.sentReq.splice(exists, 1);
            friendPlayer.sendFriendData();
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { receivedReq: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { sentReq: player.accountId } }).then(() => {

            player.sendFriendData();
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'removeFriend' && player.accountId && json.id) {
        // check if the request exists (player side)
        const exists = player.friends.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        player.friends.splice(exists, 1);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.friends.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.friends.splice(exists, 1);
            friendPlayer.sendFriendData();
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { friends: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { friends: player.accountId } }).then(() => {

            player.sendFriendData();
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

    } catch (e) {
      console.log(e);
    }
  },
  drain: (ws) => {
    console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
  },
  close: (ws, code, message) => {
    // Guarded for the same reason every timer goes through safeInterval (see
    // ws/safeTimers.js): an uncaught throw here reaches uncaughtException →
    // process.exit(1), ending the game for every connected player because ONE
    // disconnect hit a bad edge. The dodge latch, roster mutation and
    // removePlayer below are exactly the kind of surface that grows edges.
    try {
    const connectionDuration = ws.connectTime ? Date.now() - ws.connectTime : 0;
    const durationSeconds = (connectionDuration / 1000).toFixed(1);

    console.log(`WebSocket disconnect code: ${code} (${durationSeconds}s) - ${message ? message.toString() : 'no message'}`);

    ipConnectionCount.set(ws.ip, ipConnectionCount.get(ws.ip) - 1);
    if(ipConnectionCount.get(ws.ip) < 1) {
      ipConnectionCount.delete(ws.ip);
    }

    if (players.has(ws.id)) {
      const player = players.get(ws.id);

      // A reconnect can move this player id to a new websocket before the old
      // socket's close event fires. Ignore the stale close so it does not mark
      // the newly reconnected player as disconnected or remove them from games.
      if (player.ws !== ws) {
        if (playersInQueue.has(ws.id)) {
          playersInQueue.delete(ws.id);
        }
        return;
      }

      // handle case where user just made an account and name is not set
      if(!player.username) {
        // disconnect the player
        if(player.gameId) {
          const game = games.get(player.gameId);
          game.removePlayer(player);
        }

        players.delete(ws.id);

      } else {
      player.ws = null;
      player.inQueue = false;
      player.disconnectTime = Date.now();
      player.disconnected = true;
      disconnectedPlayers.set(player.accountId??player.rejoinCode, player.id);

      // Post-game results: reflect the drop in teammates' Play Again counter
      // right away instead of after the 30s purge (livingTeamPlayAgain
      // excludes disconnected members for auto-paired teams — the survivor's
      // "(1/2)" downgrades to a 1-click solo requeue instantly; chosen duos
      // recompute to the same numbers until the purge trims the roster).
      if (player.gameId && games.has(player.gameId)) {
        const dcGame = games.get(player.gameId);

        // DODGE ON DISCONNECT — ARMED HERE, CHARGED AT THE PURGE.
        //
        // The penalty only ever fired from the explicit `leaveGame` message, so
        // it punished the player who pressed the button and let the one who
        // force-quit walk. Between two identical actions the ruder one was the
        // one that cost nothing, which is exactly backwards, and killing the tab
        // is the easier of the two.
        //
        // But charging it right here would also punish a WIFI BLIP. The state
        // test (`getready`, round 1) can only be evaluated now — 30 seconds
        // later the game has moved on or ended — while the question it answers
        // ("did they actually abandon?") is not settled until the reconnect
        // grace expires. So latch the verdict now and resolve it later: the
        // purge charges it, and handleReconnect clears it if they come back.
        //
        // Not persisted in Player.toJSON on purpose: a restored process has no
        // pending disconnect to resolve, and a stale latch would charge someone
        // for a deploy.
        if (isDodgeableExit(dcGame)) player.pendingDodge = true;

        const dcTeam = dcGame.players[player.id]?.team;
        if (dcGame.teamDuel && dcGame.state === 'end' && dcTeam) {
          dcGame.sendPlayAgainState(dcTeam);
        }

        // Surface the drop on the wire roster: HUDs dim the player through
        // the reconnect grace instead of teammates waiting on a ghost
        // ("waiting for 1 player…" with no clue who or why). Roster seats
        // serialize wholesale, so a plain flag rides every later snapshot;
        // rejoinGame clears it. Broadcast only mid-game — waiting lobbies
        // resolve departures via eviction/purge, not indicators.
        const dcSeat = dcGame.players[player.id];
        if (dcSeat) {
          dcSeat.disconnected = true;
          if (['getready', 'guess', 'end'].includes(dcGame.state)) {
            dcGame.sendStateUpdate();
          }
        }

        // Auto-paired 2v2 staging lobbies dissolve on ANY disconnect (matchmade
        // strangers get no reconnect grace — same ruling as the counter above):
        // evict the dropout's roster seat NOW. Leaving the zombie seated made
        // pair2v2Solos count this lobby as a full duo (raw roster length, not
        // live sockets), so the survivor — though correctly demoted to a
        // stage-1 solo queue entry — could never be paired again until the 30s
        // purge freed the seat, and got an identical enter2v2Queue re-send
        // every 500ms tick meanwhile. removePlayer handles the rest: crown
        // pass, survivor snap-to-lobby, and the instant autoQueue2v2At re-arm.
        // Chosen (join-code) duos keep the grace: their seat survives for
        // rejoinGame's queue re-sync.
        if (dcGame.is2v2Lobby && dcGame.state === 'waiting' && dcGame.autoPaired) {
          dcGame.removePlayer(player, true);
        }
      }

      // Stamp for friends' "Offline · last seen X ago" — written at the moment
      // of disconnect so it stays accurate long after the 30s grace purge.
      if (player.accountId) {
        User.updateOne({ _id: player.accountId }, { lastSeen: Date.now() }).catch(() => {});
      }
      }
    }
    } catch (e) {
      console.error('[ws:close] handler threw for', ws?.id, e?.stack || e);
    } finally {
      // Never let a queue entry outlive its socket — even when the body above
      // threw or returned early. The matchmaking tick dereferences these
      // entries every 500ms. (The stale-close early return relied on an
      // explicit delete before this moved into a finally; both paths land
      // here.)
      if (ws?.id && playersInQueue.has(ws.id)) {
        playersInQueue.delete(ws.id);
      }
    }
  }
});



// check if gamestate can be recovered from os.tmpdir+gamestate.worldguessr
try {
  const gamestate = JSON.parse(fs.readFileSync(tmpdir() + `/gamestate.worldguessr`));
  if (gamestate && Date.now() - gamestate.time < 1000 * 60) {
    console.log('Recovered gamestate', gamestate.games.length, 'games', gamestate.players.length, 'players', currentDate());
    console.error('Recovered gamestate', gamestate.games.length, 'games', gamestate.players.length, 'players', currentDate()); // so it shows up in the error log after a crash

    for (const player of gamestate.players) {
      const newPlayer = Player.fromJSON(player);
      if (newPlayer.isBot) {
        // Bots have no socket to reconnect: restore them live so tickBots
        // resumes driving their guesses, and keep them out of the rejoin map
        // (the 30s purge would remove them mid-game as unreturned zombies).
        players.set(player.id, newPlayer);
        continue;
      }
      newPlayer.disconnectTime = Date.now(); // important
      newPlayer.disconnected = true;
      if(newPlayer.inQueue) {
        // playersInQueue is never persisted, so the queue entry died with the
        // old process. Clear the flag AND remember why, so rejoinGame can
        // toast the player — otherwise they reconnect into a silently idle
        // lobby with no clue their matchmaking evaporated.
        newPlayer.inQueue = false;
        newPlayer.queueKilledByRestart = true;
      }
      players.set(player.id, newPlayer);
      disconnectedPlayers.set(player.accountId??player.rejoinCode, player.id);
    }
    // Shift every time anchor forward by the downtime so recovered games resume
    // with the SAME remaining time on their current phase instead of waking up
    // with an already-expired nextEvtTime (which makes the 500ms loop race the
    // game to completion before anyone can reconnect → rejoin lands on 'end').
    const downtime = Date.now() - gamestate.time;
    for (const game of gamestate.games) {
      console.log(game.id);
      const newGame = Game.fromJSON(game);
      if (typeof newGame.nextEvtTime === 'number') newGame.nextEvtTime += downtime;
      if (typeof newGame.startTime === 'number') newGame.startTime += downtime;
      if (typeof newGame.endTime === 'number') newGame.endTime += downtime;
      if (newGame.roundStartTimes) {
        for (const k of Object.keys(newGame.roundStartTimes)) {
          newGame.roundStartTimes[k] += downtime;
        }
      }
      // A pending 2v2 auto-queue cannot survive a restart: queue entries are
      // not persisted and every restored member starts disconnected, so the
      // stamp would only fire against ghosts and null itself. Kill it
      // explicitly and flag the seated members (mid-"Queueing in 3…" players
      // aren't inQueue — the beat de-queues them — so the player-loop flag
      // above misses them) for the same rejoin toast.
      if (newGame.autoQueue2v2At) {
        newGame.autoQueue2v2At = null;
        for (const pid of Object.keys(newGame.players)) {
          const seated = players.get(pid);
          if (seated) seated.queueKilledByRestart = true;
        }
      }
      games.set(game.id, newGame);
    }

    console.log('Recovered gamestate successfully');
    // remove the file

    fs.unlinkSync(tmpdir() + `/gamestate.worldguessr`);

  }
} catch(e) {
}


  // update player count
  safeInterval('beat5s', 5000, () => {

    // v2 dodge cooldowns: drop entries older than the 1h memory window. Safe
    // on any cadence — the longest cooldown (2m) is far shorter than the
    // window, so this can never evict someone still serving one. Runs on the
    // 5s beat rather than the 500ms matchmaking tick because it walks the
    // whole map and nothing depends on it being current to the tick.
    if (RATING_V2) sweepDodges(dodgeCooldowns);

    // ── QUEUE ETA PUSH ────────────────────────────────────────────────────
    // Rides the existing 5s beat rather than adding a timer. Iterates
    // playersInQueue (a handful of entries) instead of players (potentially
    // thousands), and Player.send already no-ops on a dead socket.
    //
    // The value is the TOTAL typical wait for this player's rating band — not
    // a countdown — and it is LATCHED for the queue session by nextShownEta.
    {
      const now = Date.now();
      sweepSamples(etaStore, now, ETA_MAX_AGE_MS);
      for (const [id, q] of playersInQueue) {
        // Per-player guard: an estimate is a nicety, a queue is not. One
        // malformed sample ring must never cost the rest of the queue their ETA.
        try {
        if (q.duel !== true) continue;
        if (!Number.isFinite(q.rating)) continue; // guest/unrated: timer only, no ETA
        const player = players.get(id);
        if (!player || player.gameId) continue;

        // Live data first; the modelled prior only fills the gap it leaves.
        // bootstrapEstimate stamps `modelled: true`, which is what makes
        // nextShownEta downgrade the wording to a vague band — a number this
        // server invented must never be phrased like one it measured.
        let est = estimateWait(etaStore, { rating: q.rating, now, strict: !!q.strict });
        if (est.status !== 'ok') est = bootstrapEstimate(q.rating, !!q.strict);

        const shown = nextShownEta(q.etaShown, est, now - q.queueTime);
        const changed = !q.etaShown
          || q.etaShown.state !== shown.state
          || q.etaShown.seconds !== shown.seconds
          || q.etaShown.tier !== shown.tier
          || q.etaShown.longAfterMs !== shown.longAfterMs;
        q.etaShown = shown;
        if (!changed) continue; // same as last beat — don't spam the client

        player.send({
          type: 'queueEta',
          state: shown.state,
          value: shown.value,
          unit: shown.unit,
          seconds: shown.seconds,
          // Lets the 1s client clock replace the quote immediately instead of
          // waiting up to five seconds for this server beat to notice it.
          longAfterSeconds: Number.isFinite(shown.longAfterMs)
            ? shown.longAfterMs / 1000
            : null,
          // Only set when state is 'rough': 'short' | 'mid' | 'long'.
          tier: shown.tier
        });
        } catch (e) {
          console.error('[tick:beat5s] queueEta push threw for', id, e?.stack || e);
        }
      }
    }

    const activePlayerCount = getActivePlayerCount();
    for (const player of players.values()) {
      // Per-player guard: this is a broadcast, so a throw on ONE socket used to
      // cost every player after it in the map their count update AND their time
      // sync. The time sync is what verifyLiveness keys off, so a single bad
      // socket could get healthy players marked dead.
      try {
        if (player.verified && !player.gameId) {
          player.send({
            type: 'cnt',
            c: activePlayerCount
          });
        }
        player.send({
          type: 't',
          t: Date.now()
        });
      } catch (e) {
        console.error('[tick:beat5s] broadcast threw for', player?.id, e?.stack || e);
      }
    }

    if(maintenanceMode) {
      // log count of players in active games
      let playerCnt = 0;
      let unstartedGames = 0;
      for(const game of games.values()) {
        if(game.state === 'waiting') {
          unstartedGames++;
        } else {
          playerCnt += Object.keys(game.players).length;
        }
      }
      console.log('Players in active games', playerCnt);
      console.log('Unstarted games', unstartedGames);

    }
  });

  function findDuelPairs(duelQueue) {
    const pairs = [];
    const matchedPlayers = new Set();

    // Convert Map to an array for efficient iteration.
    // USER RULING (July 22, mirrors the 2v2 carve-out): newbie players ALWAYS
    // get bots — carved out of human pairing entirely; the ranked backfill
    // serves them the same tick. undefined eligibility = read in flight →
    // held out of pairing (~a tick, refreshBotEligibility stamps every
    // outcome). Guests (no accountId) keep pairing guest-vs-guest as before,
    // and instant testing mode keeps the old pair-first flow.
    const entries = Array.from(duelQueue.entries()).filter(([id, q]) => {
      if (!q.duel) return false;
      if (BOTS_ENABLED && !BOTS_INSTANT) {
        const p = players.get(id);
        if (p?.accountId && p.botEligibility?.ranked !== false) return false;
      }
      return true;
    });

    // Helper to check if two players were last opponents (and should skip matching)
    // Allow rematch if either player has been waiting > 60 seconds
    const shouldSkipLastOpponent = (p1, p2, queueTime1, queueTime2) => {
      if (ALLOW_REMATCH) return false;
      const p1Account = players.get(p1)?.accountId;
      const p2Account = players.get(p2)?.accountId;
      if (!p1Account || !p2Account) return false;

      const wereLastOpponents = lastDuelOpponent.get(p1Account) === p2Account || lastDuelOpponent.get(p2Account) === p1Account;
      if (!wereLastOpponents) return false;

      // Allow rematch if either player has been waiting > 60 seconds
      const waitTime1 = Date.now() - queueTime1;
      const waitTime2 = Date.now() - queueTime2;
      if (waitTime1 > 60000 || waitTime2 > 60000) return false;

      return true; // Skip this match - they were last opponents and haven't waited long enough
    };

    // Loop through each player in the queue
    for (let i = 0; i < entries.length; i++) {
      const [id1, { min, max, elo, guest, queueTime }] = entries[i];

      // Skip this player if already matched
      if (matchedPlayers.has(id1)) continue;

      // Check if player1 is a guest
      if (guest) {
        // Look for another guest to pair with
        for (let j = i + 1; j < entries.length; j++) {
          const [id2, { min: min2, max: max2, elo: elo2, guest: guest2 }] = entries[j];

          if (guest2 && !matchedPlayers.has(id2)) {
            pairs.push([id1, id2]);
            matchedPlayers.add(id1);
            matchedPlayers.add(id2);
            break;
          }
        }
      } else {
        // Find a suitable ELO-based pair for non-guest player1
        for (let j = i + 1; j < entries.length; j++) {
          const [id2, { min: min2, max: max2, elo: elo2, guest: guest2, queueTime: queueTime2 }] = entries[j];

          // Skip if already matched or if player2 is a guest
          if (matchedPlayers.has(id2) || guest2) continue;

          // Skip if these players were just matched together (prevent same matchup twice in a row)
          // Unless one of them has been waiting > 60 seconds
          if (shouldSkipLastOpponent(id1, id2, queueTime, queueTime2)) continue;

          // Check if each player falls within the other's acceptable ELO range
          if (elo >= min2 && elo <= max2 && elo2 >= min && elo2 <= max) {
            pairs.push([id1, id2]);
            matchedPlayers.add(id1);
            matchedPlayers.add(id2);
            break;
          }
        }
      }
    }

    return pairs;
  }

  // v2 ONLY. Flatten the ranked 1v1 queue into the plain entry objects
  // ws/matchmakingV2.js takes. That module is deliberately pure — it never
  // imports states.js — so the join between the queue entry (rating,
  // queueTime) and the Player (accountId, placement/bot flags) happens here.
  //
  // The three carve-out fields mirror v1's findDuelPairs filter:
  //   botEligible      newbies are served a bot, never a human.
  //   placementPending undefined = the DB read is still in flight, and
  //                    chooseDuelPairs holds those out for a tick. Guests are
  //                    exempt there (no account, so no read can be pending).
  //   lastOpponentId   lastDuelOpponent holds accountIds and carries NO
  //                    timestamp; wasRecentOpponent reads a missing
  //                    lastOpponentAt as "still blocked", which is exactly
  //                    v1's identity-only rule. The 60s wait waiver is the
  //                    escape hatch in both.
  function buildDuelEntriesV2() {
    const entries = [];
    for (const [id, q] of playersInQueue) {
      if (!q.duel) continue;
      const p = players.get(id);
      if (!p) continue;
      const guest = !!q.guest;
      entries.push({
        id,
        rating: Number.isFinite(q.rating) ? q.rating : (Number(p.elo) || ENTRY_RATING),
        guest,
        queueTime: q.queueTime,
        accountId: p.accountId || null,
        placementPending: guest ? false : p.placementPending,
        // Strict matchmaking opt-in, stamped at queue join. Guests can never be
        // strict: they have no account to hold the setting and no rating to
        // clear the floor with.
        strict: guest ? false : !!q.strict,
        botEligible: BOTS_ENABLED && !BOTS_INSTANT && !!p.accountId
          && p.botEligibility?.ranked === true,
        lastOpponentId: p.accountId ? (lastDuelOpponent.get(p.accountId) || null) : null,
        lastOpponentAt: undefined
      });
    }
    return entries;
  }

  // Queue every connected member of a staging lobby for 2v2 — the single
  // entry point shared by Find Match, the post-pairing auto-queue, and
  // pregame-cancel requeues. A full duo queues under a shared teamId
  // (stage 2: opponent search); a lone member queues teamId-less (stage 1:
  // teammate search). The lobby stays alive so leaveQueue can restore the
  // whole group into it — same code, same teammate.
  function queue2v2Members(lobby) {
    lobby.autoQueue2v2At = null;
    lobby.queueBoundDuo = null; // consumed — must not leak into later snapshots
    // Live sockets only — grace-window zombies still hold roster seats for up
    // to 30s, and counting them would queue a lone survivor under a phantom
    // teamId (stage-2 opponent search for a teammate who is already gone).
    // It would also recreate the queue entry their close handler cleaned and
    // pair dead players into matches.
    const members = Object.values(lobby.players)
      .map((m) => players.get(m.id))
      .filter((sock) => sock && !sock.disconnected);
    if (members.length > 2) return; // 2v2 takes at most a duo (find2v2Match enforces the same)
    // Bots never queue: the backfill seats them directly into started games,
    // and every teardown path drops them for tickBots to reap. One reaching
    // this point is an escaped orphan — refuse the whole queue entry rather
    // than feed build2v2Teams a phantom team (tickBots' non-public-game
    // backstop then clears the lobby within a tick).
    if (members.some((sock) => sock.isBot)) {
      console.error('[BOTS] queue2v2Members refused: bot in staging lobby', lobby.id);
      // Re-arm the poll fallback instead of consuming the queue attempt
      // (autoQueue2v2At was already nulled above): tickBots' backstop evicts
      // the bot within a tick, and the next autoQueue2v2At scan then queues
      // the remaining humans — a Find Match click during the contaminated
      // window is delayed by ~a tick, not silently swallowed.
      lobby.autoQueue2v2At = Date.now() + 1000;
      return;
    }
    // Guest backstop for EVERY path into the 2v2 queue (Find Match, the
    // post-pairing auto-queue, Play Again regroups, cancel requeues): guests
    // can't queue NEW games. The creation/join gates make this near
    // unreachable, but raw messages and pre-gate lobbies restored from a
    // snapshot must not slip a guest into the matchmaker. In-flight games
    // are untouched — this only guards queue entry. Instant testing mode
    // exempts guests.
    if (members.some((sock) => !sock.accountId && !BOTS_INSTANT)) {
      for (const sock of members) {
        sock.send({ type: 'toast', key: 'Link your Google account to play 2v2', toastType: 'error' });
      }
      return;
    }
    const teamId = members.length >= 2 ? uuidv4() : null;
    const now = Date.now();
    for (const sock of members) {
      sock.inQueue = true;
      // Bot backfill: refresh each member's 2v2 W/L eligibility (async,
      // fire-and-forget — resolves long before the backfill window).
      refreshBotEligibility(sock);
      playersInQueue.set(sock.id, { mode: '2v2', teamId, queueTime: now });
      // stage tells the client WHERE to render the search: 'teammate'
      // (stage 1) stays inside the lobby card, 'opponents' (stage 2) shows
      // the queue banner. Additive — old clients ignore it.
      sock.send({ type: 'enter2v2Queue', stage: teamId ? 'opponents' : 'teammate' });
    }
  }

  // Stage 1 of 2v2 matchmaking: pair two solo queuers into a TEAM before any
  // opponent search happens. The second solo moves into the first's lobby
  // (their lobby code changes — that's fine), both get snapped onto the lobby
  // screen to see their new teammate for a moment, then the lobby auto-queues
  // as a duo (stage 2). Once paired, a team stays a team across requeues —
  // intentional: duos that like each other keep playing together.
  function pair2v2Solos(queue) {
    const solos = [];
    for (const [id, q] of queue) {
      if (!q || q.mode !== '2v2' || q.teamId) continue;
      const p = players.get(id);
      if (!p || !p.inQueue) continue; // stale — build2v2Teams reaps it next
      const lobby = p.gameId ? games.get(p.gameId) : null;
      if (lobby && (lobby.public || lobby.state !== 'waiting')) continue; // stale — reaped next
      if (!lobby) {
        // Self-heal a queued solo with no home lobby: mint one (addPlayer
        // un-queues them and shows them the lobby), then auto-requeue.
        queue.delete(id);
        const fresh = new Game(uuidv4(), { is2v2Lobby: true });
        games.set(fresh.id, fresh);
        fresh.autoQueue2v2At = Date.now() + 1000;
        fresh.addPlayer(p, true);
        continue;
      }
      if (Object.keys(lobby.players).length !== 1) {
        // A friend joined the lobby by code while this member searched for a
        // random teammate — the team is complete; requeue the whole lobby as
        // a duo instead of leaving a solo entry that can never match.
        if (Object.keys(lobby.players).length === 2) queue2v2Members(lobby);
        continue;
      }
      solos.push({ id, lobby });
    }
    for (let i = 0; i + 1 < solos.length; i += 2) {
      const a = solos[i];
      const b = solos[i + 1];
      const A = players.get(a.id);
      const B = players.get(b.id);

      // De-queue both for the team-preview beat; the auto-queue re-enters them.
      A.inQueue = false;
      B.inQueue = false;
      queue.delete(a.id);
      queue.delete(b.id);

      // Move B into A's lobby. removePlayer on a lone member quietly
      // self-destructs B's old lobby (socketClosed=true suppresses the
      // gameShutdown). The auto-queue stamp is set BEFORE the state sends so
      // both clients receive autoQueueInMs and render "Queueing in 3…".
      b.lobby.removePlayer(B, true);
      // Mark the pairing as matchmade: a stage-2 cancel DISSOLVES an
      // auto-paired duo (each side back to their own lobby) instead of
      // parking two strangers together like a chosen duo.
      a.lobby.autoPaired = true;
      a.lobby.autoQueue2v2At = Date.now() + 3000;
      a.lobby.addPlayer(B); // sends B the lobby state — snaps them onto the lobby screen
      A.send(a.lobby.getInitialSendState(A)); // snap A back too — they see their new teammate
    }
    // No bot backfill here — USER RULING (July 8): bots are OPPONENTS only,
    // never a human's 2v2 teammate. A leftover solo waits for a human, even
    // in instant testing mode; only the stage-2 opposing team gets bots.
  }

  // Stage 2 of 2v2 matchmaking: only INTACT duos (both members queued under a
  // shared teamId) become teams — solos are stage 1's job. A survivor whose
  // partner is truly gone (queue entry dead AND lobby seat empty) is demoted
  // back to stage 1 to find a new teammate; while the partner is merely in the
  // 30s disconnect grace, the survivor keeps waiting for them.
  function build2v2Teams(queue) {
    const entries = Array.from(queue.entries()).filter(([id, q]) => {
      if (!q || q.mode !== '2v2') return false;
      const p = players.get(id);
      if (!p || !p.inQueue) { queue.delete(id); return false; }
      // A queued player may still sit in their private waiting lobby (kept
      // alive so cancel can restore it) — only a started/real game is stale.
      if (p.gameId) {
        const g = games.get(p.gameId);
        if (!g || g.public || g.state !== 'waiting') { queue.delete(id); return false; }
      }
      return true;
    });

    const byTeam = new Map();
    for (const [id, q] of entries) {
      if (!q.teamId) continue;
      if (!byTeam.has(q.teamId)) byTeam.set(q.teamId, []);
      byTeam.get(q.teamId).push(id);
    }

    const teams = [];
    for (const ids of byTeam.values()) {
      if (ids.length >= 2) {
        teams.push([ids[0], ids[1]]);
      } else {
        const p = players.get(ids[0]);
        const lobby = p?.gameId ? games.get(p.gameId) : null;
        if (!lobby || Object.keys(lobby.players).length < 2) {
          const q = queue.get(ids[0]);
          if (q) {
            q.teamId = null; // partner really gone → stage 1
            // Tell the client — a silent demotion leaves it painting the
            // stage-2 "Finding match" banner while we hunt teammates. Lobby
            // snapshot first (its `game` handler wipes gameQueued), then the
            // stage flip. No lobby → pair2v2Solos self-heals one next tick.
            if (p && lobby) p.send(lobby.getInitialSendState(p));
            if (p) p.send({ type: 'enter2v2Queue', stage: 'teammate' });
          }
        }
      }
    }
    return teams;
  }

  // ── Matchmade game construction ────────────────────────────────────────
  // ONE construction path per mode, shared by the human pairing passes and
  // the bot backfills below: ELO wiring or lobby handling drifting between
  // those callers is exactly the bug class this prevents. Deliberate
  // bot-path differences are explicit parameters; everything else is
  // identical by construction. Kept scope-local (like findDuelPairs /
  // build2v2Teams) so they read the live module-level allLocations, which
  // is reassigned every 10s.

  // A queued player may legitimately still sit in a private waiting lobby
  // (kept alive so cancel can restore it) — only a started/real game
  // disqualifies them from being matched.
  const inStartedRealGame = (s) => {
    if (!s.gameId) return false;
    const g = games.get(s.gameId);
    return !g || g.public || g.state !== 'waiting';
  };

  // Ranked 1v1: seats p1/p2 under their duel tags, wires the ELO deltas for
  // every outcome, and unqueues both ids (a bot id is never queued — no-op).
  //   - isBotGame stamps the finishSoloDuel save-gate carve-out: accountIds.p2
  //     stays null by construction (bots persist nothing — every per-account
  //     write path skips the null id; the saved game's bot side is
  //     synthesized from roster data).
  //   - lastDuelOpponent is never stamped for bot games: a bot is always a
  //     valid next opponent.
  //   - isPlacement (v2 only) marks a brand-new account's seeding match. It is
  //     always ALSO a bot game, the human is always p1, and Game.js tests
  //     isPlacement BEFORE isBotGame so the placement branch wins.
  function createRankedDuelGame(p1, p2, { isBotGame = false, isPlacement = false } = {}) {
    const gameId = uuidv4();
    const game = new Game(gameId, { public: true, allLocations, duel: true, seenIds: seenUnion([p1, p2]) });
    if (isBotGame) game.isBotGame = true;
    // Only ever stamped under v2 — Game.js's placement branch is itself
    // RATING_V2-gated, and leaving the field off entirely with the flag down
    // keeps a v1 game object byte-identical to what it is today.
    if (RATING_V2 && isPlacement) game.isPlacement = true;
    games.set(gameId, game);

    game.addPlayer(p1, undefined, "p1");
    game.addPlayer(p2, undefined, "p2");

    // ── QUEUE WAIT TELEMETRY ────────────────────────────────────────────
    // MUST run before the deletes below: the entries are still live here, so
    // queueTime is the exact join instant. This is the only construction path
    // for ranked 1v1, so hooking it covers the human pairing pass, the newbie
    // bot backfill and the placement match in one place.
    //
    // Bot and placement matches are NOT recorded. They resolve within a tick
    // or two by construction, so feeding them in would drag every low-band
    // estimate toward zero and quote a wait no human pairing can deliver. The
    // watch entry is dropped either way, or the reaper would file a completed
    // match as an abandonment.
    const matchedAt = Date.now();
    const queueWaits = {};
    for (const [tag, p] of [['p1', p1], ['p2', p2]]) {
      const q = playersInQueue.get(p.id);
      if (!q || q.duel !== true) continue;
      queueWaits[tag] = matchedAt - q.queueTime;
      if (isBotGame || isPlacement) continue;
      if (!Number.isFinite(q.rating)) continue; // unrated/guest entry, no band
      recordSample(etaStore, {
        rating: q.rating,
        waitMs: queueWaits[tag],
        at: matchedAt,
        strict: !!q.strict,
        matchId: gameId,
      });
    }
    // Rides onto the saved game doc so the estimate can be checked against
    // what players actually experienced (models/Game.js playerSummarySchema).
    game.queueWaitMs = queueWaits;

    playersInQueue.delete(p1.id);
    playersInQueue.delete(p2.id);

    if (isBotGame) {
      game.accountIds = {
        p1: p1.accountId,
        p2: null
      }
    } else if (p1.accountId && p2.accountId) {
      // Set account IDs for all registered players (needed for saving to MongoDB)
      game.accountIds = {
        p1: p1.accountId,
        p2: p2.accountId
      }

      // Track last opponent to prevent the same matchup twice in a row, unless
      // BOTH sides are Voyager+ — that pool is thin enough that blocking
      // rematches can strand it.
      //
      // THE EXEMPTION WAS DEAD. This read `leagues.voyager.min`, which is 5,000
      // on the retired Season 0 scale, so under v2 the condition was true for
      // every duel ever played and the carve-out never fired. Nomads and future
      // Legends — the 20-60 accounts whose quietest hours see roughly one
      // same-band arrival a week — ate the full rematch block, escaping only via
      // the 60s waiver in matchmakingV2. Exactly backwards from the intent.
      const rematchExemptFloor = getStrictFloor();
      if (p1.elo < rematchExemptFloor || p2.elo < rematchExemptFloor) {
        lastDuelOpponent.set(p1.accountId, p2.accountId);
        lastDuelOpponent.set(p2.accountId, p1.accountId);
      }
    }

    // check if both have elo. For bot games this gate is a DELIBERATE
    // tightening vs the old inline bot path (which wired ELO
    // unconditionally): the backfill only serves elo-bearing players and
    // bots always have one, so it's equivalent today — and if an elo-less
    // player ever reaches a bot game, skipping the wiring (guest-duel
    // semantics) beats computing NaN deltas.
    if (p1.elo && p2.elo && RATING_V2) {
      // ── RATING V2 PRECOMPUTE ─────────────────────────────────────────────
      // Game.js applies these at the end; nothing is recomputed there. Three
      // numbers cover every outcome, all derived from ONE shared K so the
      // result is zero-sum by construction.
      //
      // Bot games are UNRATED under v2, so a plain bot backfill gets NO
      // ratingV2 stamp at all and Game.js's bot branch skips rating entirely.
      // A PLACEMENT is a bot game too, but it still gets the stamp: it is
      // cheap, it keeps the object shape uniform for anything reading game
      // state, and Game.js's placement branch (which seeds instead of
      // transferring) is tested first so the transfers go unused.
      if (!isBotGame || isPlacement) {
        stampRatingV2(game, p1, p2);
      }

      game.oldElos = {
        p1: p1.elo,
        p2: p2.elo
      }

      if (process.env.DEBUG_ELO_CHANGES === 'true') {
        console.log('game.ratingV2', game.ratingV2, game.oldElos);
      }

      // v2 scale: see arbMapMinRating(). Never true for a bot game (bots sit
      // at ENTRY_RATING ± 30, well under the Explorer line).
      const arbMin = arbMapMinRating();
      if (p1.elo > arbMin && p2.elo > arbMin) {
        game.locations = pick5RandomArb(game.seenIds);
      }
    } else if (p1.elo && p2.elo) {
      // calculate elo change if p1 wins,loses,draws
      // calculate elo change if p2 wins,loses,draws
      const eloP1Win = calculateOutcomes(p1.elo, p2.elo, 1);
      const eloDraw = calculateOutcomes(p1.elo, p2.elo, 0.5);
      const eloP2Win = calculateOutcomes(p1.elo, p2.elo, 0);

      const deltaP1Win = {newRating1: eloP1Win.newRating1 - p1.elo, newRating2: eloP1Win.newRating2 - p2.elo};
      const deltaP2Win = {newRating1: eloP2Win.newRating1 - p1.elo, newRating2: eloP2Win.newRating2 - p2.elo};
      const deltaDraw = {newRating1: eloDraw.newRating1 - p1.elo, newRating2: eloDraw.newRating2 - p2.elo};

      game.eloChanges = {
        [p1.id]: deltaP1Win,
        [p2.id]: deltaP2Win,
        draw: deltaDraw
      }

      game.oldElos = {
        p1: p1.elo,
        p2: p2.elo
      }

      // Fires for bot games too (the old inline bot path predated this flag
      // and simply lacked it — unified deliberately).
      if (process.env.DEBUG_ELO_CHANGES === 'true') {
        console.log('game.eloChanges', game.eloChanges, game.oldElos);
      }

      // Both high-elo → the harder arbitrary world map (structurally never
      // true for bot games: bots sit at 800-1000).
      if(p1.elo > 2000 && p2.elo > 2000) {
        game.locations = pick5RandomArb(game.seenIds);
      }
    }

    game.pIds = {
      p1: p1.id,
      p2: p2.id
    }

    // Remember what this match served so the next duel for either player picks
    // around it. Read after any arbitrary-map override above, never before.
    stampSeen([p1, p2], game.locations);

    game.start();
    return game;
  }

  // Matchmade 2v2: rosterA seats as team 'a', rosterB as 'b' (team duels
  // have no p1..p4 tags — nothing reads them; the client keys off
  // players[].team). Tears down the staging lobbies the members came from,
  // so autoPairedTeams / teamHostIds MUST be captured by the caller BEFORE
  // this call — they read lobby state this destroys. Rematch memory
  // (last2v2Opponents) also stays caller-side: it is deliberately never
  // stamped for bot games (bot ids are fresh uuids per match; a stamp could
  // never match a future opponent key).
  function createTeamDuelGame(rosterA, rosterB, { autoPairedTeams, teamHostIds, queueIds, isBotGame = false }) {
    // Tear down the staging lobbies the matched players came from. Queued
    // members ignore the resulting gameShutdown client-side (not inGame),
    // while any non-queued straggler (e.g. a friend who joined the lobby
    // mid-search) gets properly reset home. Bots hold no lobby.
    for (const lobbyId of new Set([...rosterA, ...rosterB].map(s => s.gameId).filter(Boolean))) {
      const lobby = games.get(lobbyId);
      if (lobby && !lobby.public && lobby.state === 'waiting') {
        games.delete(lobbyId);
        lobby.shutdown();
      }
    }

    const gameId = uuidv4();
    const roster = [...rosterA, ...rosterB];
    // public=true (loop manages lifecycle like a public duel), teamDuel=true.
    const game = new Game(gameId, { public: true, allLocations, teamDuel: true, seenIds: seenUnion(roster) });
    // Comms XOR (user ruling): 2v2 has chat, so emotes are off — matchmade
    // games have no host to choose. FFA/1v1 keep emotes (no chat there).
    game.disableEmotes = true;
    // Matchmade 2v2s play a world + arbitrary-map mix (same override
    // pattern as the high-elo 1v1 path — constructor generation of the
    // "all" pool is synchronous, so replacing here is safe).
    game.locations = pick5WorldArbMix(allLocations, game.seenIds);
    stampSeen(roster, game.locations);
    if (isBotGame) game.isBotGame = true;
    game.autoPairedTeams = autoPairedTeams;
    game.teamHostIds = teamHostIds;
    games.set(gameId, game);

    for (const p of rosterA) game.addPlayer(p, undefined, undefined, 'a');
    for (const p of rosterB) game.addPlayer(p, undefined, undefined, 'b');
    for (const id of queueIds) playersInQueue.delete(id);

    game.start();
    return game;
  }

  // queue handler
  //
  // Guarded at the timer AND inside every loop below. The outer guard keeps the
  // process alive; the inner ones keep one bad player from costing everyone
  // else their pass. See safeInterval's header for why both layers exist.
  safeInterval('queue', 500, () => {

    // Duel bots: drive scheduled guesses, tear down bot-only ended games,
    // reap bots whose game is gone.
    tickBots();

    // Dynamically adjust join threshold based on online player count
    // When fewer players online, allow joining later rounds to speed up matchmaking
    const minRoundsRemaining = players.size >= 3000 ? 4 : 3;
    for (const game of games.values()) {

      // 2v2 staging lobby auto-queue: pairing / pregame-cancel parks members
      // in a lobby with this stamp so they see their team before queueing
      // (full duo → stage 2 opponent search, lone member → stage 1).
      if (game.is2v2Lobby && game.autoQueue2v2At && Date.now() >= game.autoQueue2v2At) {
        queue2v2Members(game);
      }

      const playerCnt = Object.keys(game.players).length;
      // start games that have at least 2 players
      if (game.state === 'waiting' && playerCnt > 1 && game.public && game.rounds === game.locations.length) {
        game.start();
      } else if (game.state === 'getready' && Date.now() > game.nextEvtTime) {
        if(game.curRound > game.rounds || game.readyToEnd) {
          game.end();
          // game over

        } else {
        game.state = 'guess';
        game.nextEvtTime = Date.now() + game.timePerRound;
        game.clearGuesses();

        game.sendStateUpdate();
        }

      } else if (game.state === 'guess' && Date.now() > game.nextEvtTime) {
        // 1-second buffer for late-arriving guesses due to network latency.
        // Players who click guess at the last second may have their packet
        // arrive after the timer expires on the server.
        if (!game.roundEndedAt) {
          game.roundEndedAt = Date.now();
        }

        // Skip buffer if all players already submitted final guesses
        let allFinal = true;
        for (const p of Object.values(game.players)) {
          if (!p.final) {
            allFinal = false;
            break;
          }
        }

        if (!allFinal && Date.now() - game.roundEndedAt < 500) {
          continue; // Still in grace period, accept late guesses
        }

        game.roundEndedAt = null;
        game.givePoints();
        game.saveRoundToHistory(); // Save the round data after points are calculated
        if(game.curRound <= game.rounds) {
          game.curRound++;
          game.state = 'getready';
          // Team modes get +1s between rounds: the reveal banner carries more
          // info there (verdict + credit + damage) than a solo/1v1 reveal.
          game.nextEvtTime = Date.now() + game.waitBetweenRounds - (game.curRound > game.rounds && !game.duel ? 5000: 0)
            + ((game.teamDuel || game.teamGame) ? 1000 : 0);
          game.sendStateUpdate();


        } else {
          // game over
          game.end()
        }
      }

      // ── RATING V2 anti-farm bookkeeping ──────────────────────────────────
      // The pair-wins counter is READ at match start (stampRatingV2) and
      // INCREMENTED here at match end. That read-then-write gap is only safe
      // because a player can be in exactly ONE ranked game at a time, so no
      // two increments for the same pair can ever interleave with a read that
      // matters. If concurrent ranked games per player ever become possible,
      // this scheme has to move to a single atomic read-modify-write.
      //
      // Latched on the game object so it fires exactly once, on the first tick
      // after the game reaches 'end' — every route into 'end' (timer, HP race,
      // forfeit via removePlayer) passes through this state, so hooking the
      // state instead of the callers cannot be bypassed.
      if (RATING_V2 && game.state === 'end' && !game.pairWinsBumped) {
        game.pairWinsBumped = true;
        bumpPairWinsForGame(game);
      }

      if(game.state === 'end' && Date.now() > game.nextEvtTime) {
        // remove game if public
        if(game.public) {
          // Wait for any pending save operations before shutdown
          if(game.saveInProgress) {
            continue; // Skip this iteration, try again next time
          }
          game.shutdown()
        } else {
          game.resetGame(allLocations);
        }
      }

      // find games that can be joined
      // unranked (meaning non duel) public games
      // Maintenance drain: existing games play out (state machine above), but
      // nobody new is seated into them and nothing new is created below.
      if (maintenanceMode) {
        continue;
      }
      if (playersInQueue.size < 1) {
        continue;
      }
      if (!game.public || game.duel) {
        continue;
      }
      if (game.rounds - game.curRound < minRoundsRemaining) {
        continue;
      }
      if (!canJoinUnrankedRound(game)) {
        continue;
      }
      if (playerCnt >= game.maxPlayers) {
        continue;
      }


      const multiplayerMax = Math.min(10, game.maxPlayers)
      let playersCanJoin = multiplayerMax - playerCnt;
      for (const playerData of playersInQueue) {
        const playerId = playerData[0];
        const queueData = playerData[1];
        if (queueData.duel || queueData.mode === '2v2') {
          continue;
        }
        const player = players.get(playerId);
        if(!player) {
          playersInQueue.delete(playerId);
          continue;
        }
        if (player.gameId) {
          continue;
        }
        if (playersCanJoin < 1) {
          break;
        }
        game.addPlayer(player);
        playersInQueue.delete(playerId);
        playersCanJoin--;
      }

    }

    if (!maintenanceMode && playersInQueue.size > 1 && [...playersInQueue.values()].filter(r => !r.duel && r.mode !== '2v2').length > 1) {
      // create a new public game (non duel)
      const gameId = uuidv4();
      const game = new Game(gameId, { public: true, allLocations });
      game.timePerRound = UNRANKED_ROUND_TIME_MS;
      games.set(gameId, game);

      let playersCanJoin = game.maxPlayers;
      for (const playerData of playersInQueue) {
        const playerId = playerData[0];
        const player = players.get(playerId);
        // Same stale-entry guard as the join loop above — a missing player
        // here would TypeError inside the interval and take the process down.
        if (!player) {
          playersInQueue.delete(playerId);
          continue;
        }
        if (player.gameId) {
          continue;
        }
        if(playerData[1].duel || playerData[1].mode === '2v2') {
          continue;
        }
        if (playersCanJoin < 1) {
          break;
        }
        game.addPlayer(player);
        playersInQueue.delete(playerId);
        playersCanJoin--;
      }
    }

    // 2v2 matchmaking, two distinct stages:
    //   stage 1 — find a teammate: solo queuers are paired into a shared
    //   lobby and shown their team for a beat before auto-queueing as a duo;
    //   stage 2 — find opponents: two intact duos pair into a 4-player game.
    // Players who queue from a full duo skip stage 1 entirely.
    if (!maintenanceMode && playersInQueue.size >= 1) {
      pair2v2Solos(playersInQueue);
      const teams = build2v2Teams(playersInQueue);

      // USER RULING (July 22): newbie duos ALWAYS get bots — carved out of
      // human pairing entirely (the backfill below serves them this same
      // tick), no longer merely backfilled after humans got first refusal.
      // A duo is carved out when every member is bot-eligible for 2v2, and
      // HELD OUT of pairing while any member's eligibility read is still in
      // flight (undefined) so a newbie can't slip into a human match on the
      // join tick. refreshBotEligibility stamps every outcome (success,
      // missing doc, DB error), so a hold lasts about a tick by construction.
      // Instant testing mode keeps the old flow: pair first, bots for
      // leftovers.
      const pairableTeams = (BOTS_ENABLED && !BOTS_INSTANT)
        ? teams.filter(team => !team.every(id => {
            const s = players.get(id);
            return s?.accountId && s.botEligibility?.team !== false;
          }))
        : teams;

      // Pair teams while avoiding immediate rematches: a duo is never matched
      // against the identical opponent duo it just fought (stamped on each
      // player as last2v2Opponents at match creation) — UNLESS no other
      // pairing exists and both sides have waited out a short cooldown, so a
      // two-duo queue at low population can't deadlock forever.
      const duoKey = (team) => [...team].sort().join('|');
      const isRematch = (t1, t2) => {
        if (ALLOW_REMATCH) return false;
        const k1 = duoKey(t1), k2 = duoKey(t2);
        return t1.some(id => players.get(id)?.last2v2Opponents === k2)
            || t2.some(id => players.get(id)?.last2v2Opponents === k1);
      };
      const cooledDown = (t) => t.every(id => {
        const q = playersInQueue.get(id);
        return q && Date.now() - q.queueTime > 20000;
      });
      const pairs = [];
      const unpaired = [...pairableTeams];
      while (unpaired.length >= 2) {
        const tA = unpaired.shift();
        let idx = unpaired.findIndex(tB => !isRematch(tA, tB));
        if (idx === -1) {
          idx = unpaired.findIndex(tB => cooledDown(tA) && cooledDown(tB));
          if (idx === -1) continue; // only fresh rematches available — tA waits this tick
        }
        pairs.push([tA, unpaired.splice(idx, 1)[0]]);
      }

      for (const [teamA, teamB] of pairs) {
        const ids = [...teamA, ...teamB];
        const socks = ids.map(id => players.get(id));

        // Bail if anyone vanished / left the queue between build and create.
        if (socks.some(s => !s || !s.inQueue || inStartedRealGame(s))) {
          for (const id of ids) {
            const s = players.get(id);
            if (!s || !s.inQueue) playersInQueue.delete(id);
          }
          continue;
        }

        // Remember which teams were matchmade pairings (vs chosen duos)
        // BEFORE their lobbies are torn down — a pregame cancel propagates
        // this onto the regroup lobbies so their cancel semantics carry over.
        const teamAutoPaired = (team) => {
          const s = players.get(team[0]);
          const g = s?.gameId ? games.get(s.gameId) : null;
          return !!g?.autoPaired;
        };
        const autoPairedTeams = { a: teamAutoPaired(teamA), b: teamAutoPaired(teamB) };
        // Chosen-duo host identity (drives post-game Back/Play Again roles on
        // the results screen) — read from the staging lobby BEFORE teardown;
        // null for auto-paired teams, which have no host semantics.
        const teamHostId = (team) => {
          const s = players.get(team[0]);
          const g = s?.gameId ? games.get(s.gameId) : null;
          if (!g || g.autoPaired) return null;
          return Object.values(g.players).find(p => p.host)?.id || null;
        };
        const teamHostIds = { a: teamHostId(teamA), b: teamHostId(teamB) };

        // Rematch-avoidance memory: each player remembers the exact opponent
        // duo, so the pairing loop above skips an immediate re-encounter.
        const keyA = duoKey(teamA), keyB = duoKey(teamB);
        for (const id of teamA) { const s = players.get(id); if (s) s.last2v2Opponents = keyB; }
        for (const id of teamB) { const s = players.get(id); if (s) s.last2v2Opponents = keyA; }

        createTeamDuelGame(socks.slice(0, teamA.length), socks.slice(teamA.length), {
          autoPairedTeams, teamHostIds, queueIds: ids,
        });
      }

      // Bot backfill (2v2): a duo where BOTH members are 2v2 newbies (0 wins
      // or ≤20% winrate) that the pairing pass above couldn't serve gets a
      // full bot opposing team immediately. Humans still get first refusal —
      // this runs after real pairing each tick, on the leftovers.
      if (BOTS_ENABLED) {
        const duosByTeam = new Map();
        for (const [id, q] of playersInQueue) {
          if (q?.mode !== '2v2' || !q.teamId) continue;
          if (!duosByTeam.has(q.teamId)) duosByTeam.set(q.teamId, []);
          duosByTeam.get(q.teamId).push({ id, q });
        }
        for (const duo of duosByTeam.values()) {
          if (duo.length !== 2) continue;
          const socks = duo.map(({ id }) => players.get(id));
          // Instant mode drops the account + newbie gates: any duo, guests included.
          if (socks.some(s => !s || !s.inQueue || (!BOTS_INSTANT && !s.accountId))) continue;
          if (!BOTS_INSTANT && socks.some(s => s.botEligibility?.team !== true)) continue;
          // Same started/real-game staleness rule the pairing pass applies.
          if (socks.some(inStartedRealGame)) continue;

          // Capture staging-lobby semantics BEFORE teardown (mirrors the real
          // path): cancel behavior + results-screen host roles for the humans.
          const lobby = socks[0].gameId ? games.get(socks[0].gameId) : null;
          const autoPairedTeams = { a: !!lobby?.autoPaired, b: false };
          const teamHostIds = {
            a: (!lobby || lobby.autoPaired)
              ? null
              : (Object.values(lobby.players).find(p => p.host)?.id || null),
            b: null
          };

          const bots = [createBotPlayer(), createBotPlayer()];
          while (bots[1].username === bots[0].username) bots[1].username = makeBotUsername();
          console.log('[BOTS] 2v2 backfill:', bots.map(b => b.username).join('+'), 'vs', socks.map(s => s.username || s.id).join('+'));

          createTeamDuelGame(socks, bots, {
            autoPairedTeams, teamHostIds,
            queueIds: duo.map(({ id }) => id),
            isBotGame: true,
          });
        }
      }
    }

    // !maintenanceMode: migration day drains through here — existing games
    // play out via the state machine above, but no pairing and no bot
    // backfill may seat a queued player into a NEW game. Queue entries are
    // kept (old clients have no wire message for a server-side eject; they
    // can cancel, and pairing resumes if maintenance lifts without a restart).
    if (!maintenanceMode && playersInQueue.size >= 1) {
      // ── PAIRING PASS ─────────────────────────────────────────────────────
      // v2 pairs by CLOSEST rating inside a symmetric, time-widening window
      // (ws/matchmakingV2.js). v1's first-fit league-band pass below is kept
      // intact and byte-for-byte, so RATING_V2=false is today's behaviour.
      // Degrade to "no pairs this tick" rather than skipping the rest of the
      // tick: the widen loop and the bot backfill below are what keep a queued
      // player's UI moving and what serves placements, and neither depends on
      // this having succeeded.
      let pairs = [];
      try {
        pairs = RATING_V2
          ? chooseDuelPairs(buildDuelEntriesV2(), {
              now: Date.now(),
              allowRematch: ALLOW_REMATCH,
              // Resolved per tick from the ACTIVE tier table, so a seasonal
              // re-anchor moves the strict floor with the leagues instead of
              // stranding it on a stale number.
              strictFloor: getStrictFloor()
            })
              .map(({ a, b }) => [a.id, b.id])
          : findDuelPairs(playersInQueue);
      } catch (e) {
        console.error('[tick:queue] pair selection threw, no pairs this tick:', e?.stack || e);
      }
      for(const pair of pairs) {
        // Per-pair guard: createRankedDuelGame constructs a Game, seats both
        // rosters, stamps the rating transfers and calls start(). A throw on one
        // pair must not cost every other pair the matchmaker just solved for.
        try {
        const [id1, id2] = pair;
        const p1 = players.get(id1);
        const p2 = players.get(id2);

        // Check if either player has left the queue (race condition prevention)
        // This can happen if they clicked leave queue right as matching occurred
        if (!p1 || !p2 || !p1?.inQueue || !p2?.inQueue) {
          // Clean up stale queue entries - remove if player is missing OR has left the queue
          if (!p1 || !p1.inQueue) playersInQueue.delete(id1);
          if (!p2 || !p2.inQueue) playersInQueue.delete(id2);
          continue; // Skip this pair, don't start a game
        }

        createRankedDuelGame(p1, p2);
        } catch (e) {
          console.error('[tick:queue] pairing threw for', pair, e?.stack || e);
        }
      }

      if (RATING_V2) {
        // ── v2 WINDOW WIDENING ─────────────────────────────────────────────
        // Recomputed from scratch EVERY tick out of windowFor(now - queueTime)
        // — there is no widen-once latch, because the window keeps growing
        // (uncapped past 75s) rather than jumping to a single wide band. The
        // widened bounds are display only: chooseDuelPairs computes the real,
        // symmetric window itself. queueTime is NEVER touched, same rule as
        // v1: it has to keep meaning "when I joined" or the 60s rematch waiver
        // can never be reached.
        //
        // `strict` is not consulted here. Under v2 it is inert — see the queue
        // join handler.
        const now = Date.now();
        for (const [playerId, queueData] of playersInQueue) {
          // The `if (!player) continue` below was the ONE hand-patched instance
          // of this bug class. The try/catch generalises it: any throw in here,
          // not just a vanished player, is now one player's problem.
          try {
          const player = players.get(playerId);
          // Same vanish guard as v1: a .send() on a missing player throws and
          // would kill the widen pass for everyone else still queued.
          if (!player) continue;
          if (queueData.guest || !queueData.duel) continue;
          const half = windowFor(now - queueData.queueTime);
          if (half === queueData.window) continue; // unchanged — don't spam the client
          queueData.window = half;
          const range = rangeForRatingV2(queueData.rating, now - queueData.queueTime, queueData.strict);
          queueData.min = range[0];
          queueData.max = range[1];
          player.send({
            type: 'publicDuelRange',
            range
          });
          } catch (e) {
            console.error('[tick:queue] v2 widen threw for', playerId, e?.stack || e);
          }
        }
      } else {
      // remaining players in queue check if wait was longer than 10 seconds, in that case set their elo range to infinity
      // — unless the player opted into strict matchmaking (Voyager+ setting):
      // their widened floor is the Voyager minimum, so the pool stays
      // Voyagers + Nomads no matter how long they wait.
      // Widen ONCE (flag), never reset queueTime: it must keep meaning "when
      // I joined the queue" so shouldSkipLastOpponent's 60s rematch waiver can
      // actually be reached (resetting it here kept wait times pinned <10s,
      // which made the rematch block permanent and could starve a two-player
      // pool).
      for(const playerId of playersInQueue) {
        try {
        const player = players.get(playerId[0]);
        const queueData = playerId[1];
        // The player can vanish between the pairing pass above and this loop
        // (disconnect / leave queue). players.get() then returns undefined and
        // the .send() below throws, killing the whole widen pass for everyone
        // else still queued. Skip them; the normal queue-cleanup paths remove
        // the stale entry.
        if(!player) continue;
        if(!queueData.guest && queueData.duel && !queueData.widened && Date.now() - queueData.queueTime > 10000) {
          // v1 BRANCH. `leagues.voyager.min` (5,000) and the 20,000 ceiling
          // below are CORRECT here and must not be "fixed" to v2 values: this
          // whole else-branch only runs with RATING_V2 off, on the Season 0
          // scale, where those are the real numbers. The v2 path above resolves
          // its floor through getStrictFloor() instead.
          const widenedMin = queueData.strict ? leagues.voyager.min : 0;
          playersInQueue.set(playerId[0], { ...queueData, min: widenedMin, max: 20000, widened: true });

          player.send({
            type: 'publicDuelRange',
            range: [widenedMin, 20000]
          });
        }
        } catch (e) {
          console.error('[tick:queue] v1 widen threw for', playerId?.[0], e?.stack || e);
        }
      }
      }

      // Bot backfill (ranked 1v1): a player with 0 ranked wins or a
      // ≤10% winrate gets a bot opponent pinned to 800-1000 ELO,
      // immediately. Newbies are carved out of findDuelPairs above (USER
      // RULING July 22: always bots for them), so this serves every
      // eligible player each tick, not just pairing leftovers.
      if (BOTS_ENABLED) {
        for (const [playerId, queueData] of playersInQueue) {
          // HIGHEST-BLAST-RADIUS GUARD IN THE TICK. This branch CONSTRUCTS
          // games: createBotPlayer builds a Player, createRankedDuelGame builds
          // a Game, seats two rosters, stamps rating transfers and calls
          // start(). A throw anywhere in that chain used to abandon the backfill
          // pass for every other queued player, and reach the process-level
          // handler that exits. One player's bad state must cost that player a
          // tick, nothing more.
          try {
          if (!queueData.duel) continue;
          const player = players.get(playerId);

          // PLACEMENT FIRST, AND UNCONDITIONALLY (v2). A brand-new account's
          // seeding match outranks every other gate here:
          //   - `strict` is ignored: it is inert under v2 anyway, and a
          //     placement is not a ladder match to be filtered.
          //   - botEligibility is ignored: placementPending is its own,
          //     stricter signal (verified account, created post-migration,
          //     never seeded) and it is what decides this.
          // The human is seated as p1 because Game.js's placement branch reads
          // pIds.p1 for the seed and only p1 can win a placement.
          if (RATING_V2 && player && player.placementPending === true
              && player.inQueue && !player.gameId && player.elo) {
            const bot = createBotPlayer({ placement: true });
            console.log('[RATING_V2] placement match:', player.username || player.id, 'vs', bot.username);
            // isBotGame stays TRUE: the save gate, the null accountIds.p2 and
            // the synthesized bot side all depend on it. Game.js tests
            // isPlacement before isBotGame, so the placement branch wins.
            createRankedDuelGame(player, bot, { isBotGame: true, isPlacement: true });
            continue;
          }

          // Strict players opted into a 5000+ pool; bots sit at 800-1000.
          // (Structurally near-impossible anyway — Voyagers aren't newbie-
          // eligible — but the guard states the intent.) Inert under v2.
          if (queueData.strict) continue;
          if (!player || !player.inQueue || player.gameId || !player.elo) continue;
          if (!BOTS_INSTANT && !player.accountId) continue;
          if (!BOTS_INSTANT && player.botEligibility?.ranked !== true) continue;

          const bot = createBotPlayer();
          console.log('[BOTS] ranked backfill:', bot.username, 'vs', player.username || player.id);

          createRankedDuelGame(player, bot, { isBotGame: true });
          } catch (e) {
            console.error('[tick:queue] bot backfill threw for', playerId, e?.stack || e);
          }
        }
      }
    }

    // loop through disconnected players and remove them if they have been disconnected for more than 30 seconds
    for(const [accountId, playerId] of disconnectedPlayers) {
      // Per-entry guard: this calls game.removePlayer(), which can end and
      // resolve a whole duel (rating writes, results broadcast, save). One
      // dropout whose teardown throws must not strand every other disconnected
      // player in the map forever.
      try {
      const player = players.get(playerId);
      if(!player) {
        disconnectedPlayers.delete(accountId);
        continue;
      }
      if(Date.now() - player.disconnectTime > 30000) {
        // Team rejoin exception (2v2 duels AND team parties): while the game
        // is still running and a teammate is still connected holding the
        // fort, keep the dropout rejoinable indefinitely — handleReconnect is
        // time-agnostic, it only needs this players entry plus the
        // disconnectedPlayers key. The tick after the game ends, dissolves,
        // or loses its last live teammate, this check fails and the normal
        // purge below runs. Team-party specifics:
        //  - mid-match states only: a 'waiting' lobby member purges normally
        //    (rejoining a lobby is just entering the code again);
        //  - never the host: the host-leave disband rule is deliberate, so a
        //    host dropout must still reach removePlayer after the 30s grace.
        const dcGame = player.gameId ? games.get(player.gameId) : null;
        const teamHold = dcGame?.teamDuel
          ? dcGame.state !== 'end'
          : !!dcGame?.teamGame && ['getready', 'guess'].includes(dcGame.state);
        const rosterEntry = teamHold ? dcGame.players[player.id] : null;
        if (rosterEntry?.team && !rosterEntry.host && dcGame.teamMembers(rosterEntry.team)
              .some(m => {
                if (m.id === player.id) return false;
                // "Still in the game" = an actual LIVE socket. A fellow
                // disconnected teammate must not count (two zombies would
                // keep each other alive forever), and neither may a ghost
                // roster entry whose Player object is already gone.
                const mate = players.get(m.id);
                return mate && !mate.disconnected;
              })) {
          continue;
        }
        disconnectedPlayers.delete(accountId);

        // The reconnect grace expired without them coming back, so the dodge
        // latched at socket close is now confirmed as a real abandonment rather
        // than a connection blip. Charged BEFORE removePlayer, which can end and
        // dissolve the game out from under this. See the note at the latch site.
        if (player.pendingDodge) {
          player.pendingDodge = false;
          chargeDodge(player, 'disconnect');
        }

        if (player.gameId) {
          const game = games.get(player.gameId);
          if (game) {
            game.removePlayer(player, true);
          }
        }

        // Never let a queue entry outlive its player — the matchmaking loops
        // dereference these entries every 500ms.
        playersInQueue.delete(playerId);
        players.delete(playerId);
      }
      } catch (e) {
        console.error('[tick:queue] disconnect purge threw for', accountId, e?.stack || e);
      }
    }

  });




  // Preserve the rolling hour across deploys without changing shutdown.
  if (dbEnabled) {
    safeInterval('etaSnapshot', 5 * 60 * 1000, () => {
      QueueEtaSnapshot.updateOne(
        { key: 'ranked1v1' },
        { $set: { key: 'ranked1v1', data: snapshotStore(etaStore, Date.now()), updatedAt: new Date() } },
        { upsert: true }
      ).catch((e) => console.error('[queueEta] snapshot write failed:', e?.message || e));
    });
  }

  if(!dev && dbEnabled) {
    safeInterval('memsave', 10000, () => {

      const memUsage = process.memoryUsage().heapUsed;
      const gameCnt = games.size;
      const playerCnt = players.size;

      // store in mongodb
      // memsave
      const mem = new Memsave({
        players: playerCnt,
        memusage: memUsage,
        games: gameCnt
      });
      mem.save().then(() => [
      ])
    });
  }


  safeInterval('statsLog', 10000, () => {
    // log player count, game count, memory usage
    let memUsage = process.memoryUsage().heapUsed;
    const gameCnt = games.size;
    const playerCnt = players.size;

     memUsage = (memUsage / 1024 / 1024).toFixed(2) + ' MB';
    console.log('Players:', playerCnt, 'Games:', gameCnt, 'Memory:', memUsage);
  })
