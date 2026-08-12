// Duel bots: socket-less Player objects that backfill matches for struggling
// players so they aren't stuck losing (or never matching) forever.
//
//   - Ranked 1v1: a player with 0 ranked wins or a ≤10% winrate whom
//     the pairing pass couldn't serve gets a bot opponent pinned to
//     800-1000 ELO. The human's ELO/W-L update normally against that rating;
//     the bot persists nothing (no accountId → every DB path skips it, and
//     finishSoloDuel's two-account save gate keeps bot games out of match
//     history / stats records by construction).
//   - 2v2: a duo where BOTH members are 2v2 newbies (0 wins or ≤20% winrate)
//     gets a full bot team in the opponent stage.
//     saveTeamDuelToMongoDB already treats account-less players as guests, so
//     the humans' team2v2_* counters update normally.
//   - Placement (v2): a brand-new account's single seeding match is played
//     against "PlacementBot" (fixed name, no flag), which shadows the human's
//     score a bounded margin below for rounds 1-4 and throws round 5 — see
//     placementGuess() below for the damage-window math and its guarantees.
//
// Bots ride the normal pipelines end to end: real roster entries, guesses via
// Game.setGuess, results via the standard finishers. Player.send() no-ops on
// ws=null, and the client only renders profile links for accountId-bearing
// players, so no client change is needed. Real humans always get first
// refusal — backfill runs AFTER the pairing passes each tick, on players the
// matchmaker couldn't serve.

// Load .env BEFORE the module-scope env reads below: ws.js only calls
// dotenv's config() after its import block, and ESM hoisting evaluates this
// module first — without this line, .env-set DUEL_BOTS* flags never apply.
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import lookup from 'coordinate_to_country';
import Player from './classes/Player.js';
import User from '../models/User.js';
import { VALID_COUNTRY_CODES } from '../serverUtils/timezoneToCountry.js';
import { getRandomPointInCountry } from '../components/randomLoc.server.js';
import calcPoints, { findDistance } from '../components/calcPoints.js';
import { players, games, playersInQueue } from '../serverUtils/states.js';
import { RATING_V2, MIGRATION_AT } from '../components/utils/ratingFlags.js';
import { ENTRY_RATING } from '../components/utils/eloSystem.js';
import { isPlacementEligible } from '../components/utils/placementGates.js';
import borders from '../public/genBorders.json' with { type: "json" };

// Toggles (env, read once at boot like every other ws.js switch):
// DUEL_BOTS=off kills all bot backfill; DUEL_BOTS=instant is a TESTING mode —
// no eligibility check, guests included: everyone the pairing pass leaves
// behind gets a bot on the next tick (never set in prod);
// DUEL_BOT_FLAGS=off spawns bots flagless (countryCode null renders exactly
// like a user who never set one).
export const BOTS_ENABLED = process.env.DUEL_BOTS !== 'off';
export const BOTS_INSTANT = process.env.DUEL_BOTS === 'instant';
export const BOT_FLAGS_ENABLED = process.env.DUEL_BOT_FLAGS !== 'off';
if (BOTS_INSTANT) console.log('[BOTS] DUEL_BOTS=instant — TESTING mode: no eligibility gates');

// Random guess timing inside a round: early enough to keep rounds moving,
// spread enough to not look mechanical. This is the FALLBACK schedule — once
// every human in the game has locked a guess, the bot answers within
// BOT_HURRY_MAX_MS instead (a present opponent doesn't sit on a done round).
const BOT_GUESS_MIN_MS = 8000;
const BOT_GUESS_MAX_MS = 40000;
const BOT_HURRY_MIN_MS = 1000;
const BOT_HURRY_MAX_MS = 4500;

// Placement bots shadow the human's guess, so they get NO random schedule —
// the hurry branch (fires when the human locks in) is their primary trigger,
// and this guard is the only other one: fire this many ms before the round's
// own timer so an AFK human can never hang the round (rounds only collapse
// early when every roster entry is final).
const PLACEMENT_STALL_GUARD_MS = 8000;
// Per-round damage window for the scripted rounds 1-4: the bot lands
// MARGIN_MIN..MARGIN_MAX points below the human. The MAX is load-bearing:
// 4 rounds x 1000 = 4000 < 5000 HP, so the bot always survives into round 5.
const PLACEMENT_MARGIN_MIN = 300;
const PLACEMENT_MARGIN_MAX = 1000;
const PLACEMENT_BEARING_TRIES = 8;
const PLACEMENT_COUNTRY_TRIES = 5;
const PLACEMENT_TERRIBLE_SAMPLES = 8;

const ADJECTIVES = [
  'Swift', 'Lucky', 'Sneaky', 'Brave', 'Quiet', 'Rapid', 'Cosmic', 'Frosty',
  'Golden', 'Wild', 'Clever', 'Mellow', 'Rusty', 'Shiny', 'Sleepy', 'Zesty',
  'Bold', 'Breezy', 'Chilly', 'Dizzy', 'Eager', 'Fuzzy', 'Grumpy', 'Happy',
  'Jolly', 'Keen', 'Loyal', 'Mighty', 'Noble', 'Odd', 'Plucky', 'Quick',
  'Rowdy', 'Salty', 'Tiny', 'Vivid', 'Witty', 'Zany', 'Calm', 'Daring',
  'Epic', 'Feisty', 'Gentle', 'Humble', 'Icy', 'Jumpy', 'Merry', 'Nimble',
];
const NOUNS = [
  'Panda', 'Falcon', 'Otter', 'Tiger', 'Koala', 'Raven', 'Badger', 'Lynx',
  'Moose', 'Gecko', 'Heron', 'Bison', 'Cobra', 'Dingo', 'Ferret', 'Gopher',
  'Hawk', 'Ibex', 'Jaguar', 'Kiwi', 'Lemur', 'Marmot', 'Newt', 'Ocelot',
  'Puffin', 'Quokka', 'Rhino', 'Sloth', 'Toucan', 'Viper', 'Walrus', 'Yak',
  'Zebra', 'Beaver', 'Crane', 'Donkey', 'Eagle', 'Fox', 'Goose', 'Hyena',
  'Iguana', 'Jackal', 'Krill', 'Llama', 'Mole', 'Narwhal', 'Owl', 'Penguin',
];

export function makeBotUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}${1 + Math.floor(Math.random() * 99)}`;
}

// Bots always sit at 800-1000 (ranked ruling; 2v2 reuses it for HUD display —
// 2v2 itself is unranked so the number is cosmetic there).
//
// Under RATING_V2 the whole scale moves: a brand-new account enters at
// ENTRY_RATING (500), so an 800 bot would be displayed as a favourite the new
// player is about to lose to on the very first screen they ever see. Band it
// tight around the entry rating instead. NEVER return 0 — Game.js's duel save
// gate and the duelEnd payload both test `p1OldElo && p2OldElo`, so a falsy
// bot rating voids the human's placement result.
const BOT_ELO_V2_SPREAD = 30;
export function makeBotElo() {
  if (RATING_V2) {
    return ENTRY_RATING - BOT_ELO_V2_SPREAD + Math.floor(Math.random() * (BOT_ELO_V2_SPREAD * 2 + 1));
  }
  return 800 + Math.floor(Math.random() * 201);
}

// Bot flags weighted toward the game's real audience so bots read like
// typical opponents — a uniform draw over ~250 ISO codes kept parading
// micronation flags. ~15% of draws stay uniform over everything so the
// occasional exotic flag still shows up.
const BOT_FLAG_WEIGHTS = [
  ['US', 26], ['GB', 8], ['DE', 7], ['CA', 6], ['FR', 5], ['AU', 4],
  ['NL', 4], ['PL', 3], ['BR', 3], ['SE', 3], ['IN', 3], ['IT', 3],
  ['ES', 2], ['FI', 2], ['NO', 2], ['DK', 2], ['TR', 2], ['JP', 2],
  ['CZ', 2], ['RU', 2], ['UA', 2], ['RO', 1], ['HU', 1], ['AT', 1],
  ['CH', 1], ['BE', 1], ['PT', 1], ['GR', 1], ['MX', 1], ['AR', 1],
  ['NZ', 1], ['IE', 1], ['KR', 1], ['PH', 1], ['ID', 1], ['MY', 1],
];
const BOT_FLAG_POOL = BOT_FLAG_WEIGHTS.flatMap(([code, w]) => Array(w).fill(code));

function makeBotCountryCode() {
  if (Math.random() < 0.15) {
    return VALID_COUNTRY_CODES[Math.floor(Math.random() * VALID_COUNTRY_CODES.length)];
  }
  return BOT_FLAG_POOL[Math.floor(Math.random() * BOT_FLAG_POOL.length)];
}

// Registers the bot in the global players map: sendAllPlayers/checkRemaining/
// the disconnect-purge teammate scan all resolve roster ids through it, and a
// missing entry reads as "player gone". tickBots() is the matching reaper.
// `placement` bots drop the fake-human disguise: fixed "PlacementBot" name and
// no flag (user ruling) — the match is announced as a placement, so the
// opponent should read as a training bot, not a person. Guess behavior is NOT
// keyed here: tickBots dispatches on game.isPlacement. The elo stays a real
// makeBotElo() value — the duel save gate and duelEnd payload both test
// `p1OldElo && p2OldElo`, so a falsy bot rating would void the placement.
export function createBotPlayer({ placement = false } = {}) {
  const bot = new Player(null, uuidv4(), 'bot'); // ws=null → Player.send() no-ops
  bot.isBot = true;
  bot.verified = true;
  bot.username = placement ? 'PlacementBot' : makeBotUsername();
  bot.accountId = null;
  bot.elo = makeBotElo();
  bot.countryCode = !placement && BOT_FLAGS_ENABLED ? makeBotCountryCode() : null;
  bot.teamSupport = true;
  players.set(bot.id, bot);
  return bot;
}

// Eligibility = 0 wins yet, or a low winrate (≤10% ranked, ≤20% 2v2). Stamped on the
// Player — NOT the queue entry, which the ranked widen loop replaces — by a
// fire-and-forget read at queue join; backfill only trusts an explicit true.
// EVERY outcome stamps a resolved value (missing doc / DB error → all-false),
// so `botEligibility === undefined` means strictly "read in flight": the 2v2
// pairing pass holds a duo out of human pairing while undefined (newbie duos
// must never pair with humans — USER RULING July 22), and that hold must be
// transient by construction.
//
// v2 ADDITION — placementPending, and note its fail direction is the OPPOSITE
// of the bot flag's. botEligibility fails toward "veteran" so an unassessable
// player is never stranded; placementPending fails toward "not pending"
// because a placement OVERWRITES a rating outright, and we never place an
// account we could not verify. undefined on both still means "read in flight".
export async function refreshBotEligibility(player) {
  if (!player?.accountId) return;
  // Under v2 this read is no longer optional even with bots switched off:
  // chooseDuelPairs holds an unstamped (undefined) player out of pairing, so
  // skipping it here would strand every account in the ranked queue forever.
  if (!BOTS_ENABLED && !RATING_V2) return;
  try {
    const u = await User.findById(player.accountId)
      .select('duels_wins duels_losses duels_tied team2v2_wins team2v2_losses team2v2_tied ratedGames created_at lastRankedAt')
      .lean();
    if (!u) {
      player.botEligibility = { ranked: false, team: false };
      player.placementPending = false;
      return;
    }
    // .lean() skips schema defaults — dormant docs report undefined, not 0.
    const newbie = (wins, losses, tied, maxWinrate) => {
      const total = wins + losses + tied;
      return wins === 0 || wins / total <= maxWinrate;
    };

    // A placement is owed to a post-migration account that has never earned a
    // rating. `lastRankedAt` is the "already seeded" marker: applyPlacementSeed
    // stamps it only when the seed write actually lands, and nothing else in a
    // placement or a bot game writes it (both go through applyUnratedCounters,
    // which is rated:false). Without it this gate never closes — a placement
    // leaves ratedGames at 0 by design, so isPlacementEligible alone would
    // re-issue a placement match on every single queue join, forever, and the
    // player would never meet a human. A LOST/abandoned placement leaves
    // lastRankedAt null and correctly re-gates into another one, which is the
    // documented intent in Game.js's placement branch.
    const placement = RATING_V2 && BOTS_ENABLED
      && isPlacementEligible(u, MIGRATION_AT) && !u.lastRankedAt;
    player.placementPending = placement;

    // Ranked bot eligibility re-keys onto ratedGames under v2. The v1 rule
    // reads duels_wins/losses/tied, and under v2 those counters also book
    // UNRATED games (placements and bot duels go through applyUnratedCounters),
    // so they stop describing ladder experience at all. ratedGames is the only
    // honest "has played a real human ranked game" signal.
    //
    // And because bot games are unrated, ratedGames cannot advance inside a bot
    // game — so any "eligible while ratedGames < N" rule for N > 0 would be a
    // closed loop: bot, bot, bot, never a human. Under v2 the newbie carve-out
    // therefore collapses into exactly one thing, the placement match. Once
    // seeded, the player enters normal human matchmaking and the v2 rating
    // window (not a bot) is what protects them from a mismatch.
    player.botEligibility = {
      ranked: RATING_V2
        ? placement
        : newbie(u.duels_wins || 0, u.duels_losses || 0, u.duels_tied || 0, 0.1),
      team: newbie(u.team2v2_wins || 0, u.team2v2_losses || 0, u.team2v2_tied || 0, 0.2),
    };
  } catch (e) {
    console.error('refreshBotEligibility failed for', player?.accountId, e?.message);
    // Fail toward humans: an unassessable player is treated as a veteran so
    // the pairing-pass hold can't strand them in queue.
    player.botEligibility = { ranked: false, team: false };
    // Fail AWAY from placements: an unverifiable account never gets its rating
    // overwritten by a seed.
    player.placementPending = false;
  }
}

// Land guess = uniform random country, then a uniform point inside its
// genBorders polygon. The old whole-world draw weighted polygons by raw
// degree-space shoelace area, which inflates polar rings so badly that
// measured 52% of guesses fell below 55°S (43% on Antarctica alone) and 16%
// passed as open ocean. Antarctica is excluded outright — no human parks a
// pin there round after round. The lookup re-roll stays: genBorders'
// simplified coastlines bulge past land (~19% of raw samples miss even
// coordinate_to_country's maritime borders).
const GUESS_COUNTRY_CODES = [...new Set(borders.features.map(f => f.properties.code))]
  .filter(code => code && code !== 'AQ');

export function botRandomGuess() {
  try {
    for (let i = 0; i < 10; i++) {
      const code = GUESS_COUNTRY_CODES[Math.floor(Math.random() * GUESS_COUNTRY_CODES.length)];
      const pt = getRandomPointInCountry(code); // [lat, long]
      if (Array.isArray(pt) && pt.length === 2 && lookup(pt[0], pt[1], true).length > 0) {
        return pt;
      }
    }
  } catch (e) {
    console.error('botRandomGuess failed', e?.message);
  }
  return [48.8566, 2.3522]; // near-unreachable fallback: dry land beats a crash
}

// ── Placement opponent ──────────────────────────────────────────────────────
// The placement bot scripts a 5-round arc: rounds 1-4 it lands a bounded
// margin BELOW the human's own score (small, capped chip damage — the bot
// provably survives into round 5), then round 5 it throws with a terrible
// far-away guess so the human closes the match with a KO. Every guess is on
// LAND — the old antipode throw parked a pin in open ocean every round.

/**
 * Invert calcPoints' pre-clamp formula (pts = 5000 * e^(-10*dist/maxDist))
 * to the distance (km) that scores `targetScore`. Input clamped to (1, 4996)
 * to stay finite and clear of calcPoints' >4997 ⇒ 5000 auto-clamp band.
 */
export function invertCalcPointsDistance(targetScore, maxDist = 20000) {
  const pts = Math.min(4996, Math.max(1, Number(targetScore) || 1));
  return -Math.log(pts / 5000) * (maxDist / 10);
}

/**
 * Great-circle destination `distKm` from (lat, lon) along `bearingDeg`
 * (0 = north, clockwise). Spherical Earth R=6371 — the same R findDistance
 * uses, so a round-trip through findDistance reproduces distKm.
 */
export function greatCircleDestination(lat, lon, bearingDeg, distKm) {
  const R = 6371;
  const dR = distKm / R;
  const brng = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180, lon1 = lon * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lat2 * 180 / Math.PI, ((lon2 * 180 / Math.PI + 540) % 360) - 180];
}

// Farthest of K land samples from the round's location: a real on-land pin
// that still scores ~0. Round 5's throw, and the fallback whenever the human
// has nothing to shadow (never guessed / scored 0).
export function terribleLandGuess(loc) {
  let best = null, bestDist = -1;
  for (let i = 0; i < PLACEMENT_TERRIBLE_SAMPLES; i++) {
    const pt = botRandomGuess();
    const d = findDistance(loc.lat, loc.long, pt[0], pt[1]);
    if (d > bestDist) { bestDist = d; best = pt; }
  }
  return best || botRandomGuess();
}

// Land AND strictly inside the damage window [humanScore-MARGIN_MAX, humanScore).
// Re-scored through calcPoints itself, so every accepted point provably
// respects the per-round damage cap regardless of which tier produced it.
function inDamageWindow(loc, pt, humanScore, maxDist) {
  if (!Array.isArray(pt) || pt.length !== 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;
  if (lookup(pt[0], pt[1], true).length === 0) return false;
  const pts = calcPoints({ lat: loc.lat, lon: loc.long, guessLat: pt[0], guessLon: pt[1], usedHint: false, maxDist });
  return pts < humanScore && pts >= humanScore - PLACEMENT_MARGIN_MAX;
}

export function placementGuess(game) {
  const loc = game?.locations?.[game.curRound - 1];
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.long)) {
    return botRandomGuess(); // no location to shadow — never block the round
  }
  const maxDist = game.maxDist || 20000;

  // Human is p1 by construction (createRankedDuelGame seats human/bot in
  // argument order and stamps pIds before start).
  const humanGuess = game.pIds?.p1 ? game.players?.[game.pIds.p1]?.guess : null;
  const humanScore = Array.isArray(humanGuess)
    ? calcPoints({ lat: loc.lat, lon: loc.long, guessLat: humanGuess[0], guessLon: humanGuess[1], usedHint: false, maxDist })
    : 0;

  // Round 5, or nothing to shadow: throw. There is no "slightly worse than 0".
  if (game.curRound >= game.rounds || humanScore <= 0) return terribleLandGuess(loc);

  // Tier 1: band search. A jittered margin per try widens the search into a
  // whole annulus of target distances (a single fixed ring is often 100%
  // ocean), and the jitter keeps the bot from tracking the human robotically.
  for (let i = 0; i < PLACEMENT_BEARING_TRIES; i++) {
    const margin = PLACEMENT_MARGIN_MIN + Math.random() * (PLACEMENT_MARGIN_MAX - PLACEMENT_MARGIN_MIN);
    const target = humanScore - margin;
    if (target <= 0) continue;
    const dist = invertCalcPointsDistance(target, maxDist);
    const pt = greatCircleDestination(loc.lat, loc.long, Math.random() * 360, dist);
    if (inDamageWindow(loc, pt, humanScore, maxDist)) return pt;
  }

  // Tier 2: same country as the true location — uncontrolled distance, so
  // re-validated against the same window.
  try {
    const trueCountry = lookup(loc.lat, loc.long, true)?.[0];
    if (trueCountry) {
      for (let i = 0; i < PLACEMENT_COUNTRY_TRIES; i++) {
        const pt = getRandomPointInCountry(trueCountry);
        if (inDamageWindow(loc, pt, humanScore, maxDist)) return pt;
      }
    }
  } catch (e) {
    console.error('placementGuess country fallback failed', e?.message);
  }

  // Tier 3: never stall the round. One random land sample if it happens to
  // fit the window; else throw. The throw can over-damage the bot for THIS
  // round only — worst case the bot dies before round 5, which still resolves
  // as a legitimate human KO, never a human loss.
  const fallback = botRandomGuess();
  if (inDamageWindow(loc, fallback, humanScore, maxDist)) return fallback;
  return terribleLandGuess(loc);
}

// Reveal reactions: bots congratulate humans through the same 'emote'
// broadcast shape the ws.js handler uses (client EMOTES:
// ['👋','👍','😂','😮','🤔','🎯','😡','GG']). At most one bot reaction per
// reveal/game-end — claimed on the GAME so a 2v2 bot pair never doubles up.
const EMOTE_THUMBS_UP = 1, EMOTE_WOW = 3, EMOTE_BULLSEYE = 5, EMOTE_GG = 7;

function scheduleBotEmote(game, pool) {
  const bots = Object.keys(game.players).map(pid => players.get(pid)).filter(p => p?.isBot);
  if (!bots.length) return;
  const actor = bots[Math.floor(Math.random() * bots.length)];
  actor.botEmoteIdx = pool[Math.floor(Math.random() * pool.length)];
  actor.botEmoteAt = Date.now() + 600 + Math.random() * 1600; // beat after the reveal lands
}

function humansWonGame(game) {
  if (game.teamDuel && game.teamScores) {
    const botTeam = Object.entries(game.players)
      .find(([pid]) => players.get(pid)?.isBot)?.[1]?.team;
    if (!botTeam) return false;
    const humanTeam = botTeam === 'a' ? 'b' : 'a';
    return (game.teamScores[humanTeam] ?? 0) > (game.teamScores[botTeam] ?? 0);
  }
  // 1v1 health duel: the survivor holds the higher score.
  let human = 0, bot = 0;
  for (const [pid, roster] of Object.entries(game.players)) {
    if (players.get(pid)?.isBot) bot = Math.max(bot, roster.score ?? 0);
    else human = Math.max(human, roster.score ?? 0);
  }
  return human > bot;
}

function maybeScheduleBotEmote(game) {
  // Round reveal (getready after a scored round): a bullseye human round gets
  // 🎯/😮, merely beating the bots gets 👍. 80% send chance so it doesn't
  // read scripted. Pre-round-1 getready has no roundHistory → skipped.
  const last = game.roundHistory?.[game.roundHistory.length - 1];
  if (game.state === 'getready' && last && game.botEmoteRound !== last.round) {
    game.botEmoteRound = last.round;
    let humanBest = 0, botBest = 0;
    for (const [pid, r] of Object.entries(last.players)) {
      if (players.get(pid)?.isBot) botBest = Math.max(botBest, r.points || 0);
      else humanBest = Math.max(humanBest, r.points || 0);
    }
    if (Math.random() < 0.8) {
      if (humanBest >= 3000) scheduleBotEmote(game, [EMOTE_BULLSEYE, EMOTE_WOW]);
      else if (humanBest > botBest) scheduleBotEmote(game, [EMOTE_THUMBS_UP]);
    }
  }

  // Game over: GG when the humans took it — bots are gracious losers.
  if (game.state === 'end' && !game.botEmoteEnd) {
    game.botEmoteEnd = true;
    if (humansWonGame(game)) scheduleBotEmote(game, [EMOTE_GG]);
  }
}

// One pass per 500ms tick: drive bot guesses, react to reveals, tear down
// games only bots still occupy, and reap bots whose game is gone. Bots never
// disconnect/reconnect, so this sweep is their entire lifecycle management.
export function tickBots() {
  for (const [id, bot] of players) {
    if (!bot.isBot) continue;
    const game = bot.gameId ? games.get(bot.gameId) : null;
    if (!game || !game.players[id]) {
      players.delete(id);
      continue;
    }

    // Invariant backstop: a bot's game is always a public, matchmade, started
    // game (true by construction at both backfill sites). A bot holding a
    // seat in anything else — e.g. a staging lobby minted by a regroup path —
    // is an escaped orphan: evict it (removePlayer self-destructs a lobby on
    // its last member, so a bot-only ghost lobby dies with its bots) and
    // reap. This runs before the autoQueue2v2At scan each tick, so an orphan
    // can never be queued into human matchmaking.
    if (!game.public) {
      game.removePlayer(bot, true);
      playersInQueue.delete(id);
      players.delete(id);
      continue;
    }

    maybeScheduleBotEmote(game);

    // Fire a pending reaction in ANY state — round reactions land during
    // 'getready' reveals, the GG during 'end'.
    if (bot.botEmoteAt && Date.now() >= bot.botEmoteAt) {
      bot.botEmoteAt = null;
      game.sendAllPlayers({
        type: 'emote',
        id: bot.id,
        name: bot.username,
        countryCode: bot.countryCode || null,
        team: game.players[id]?.team ?? null,
        emote: bot.botEmoteIdx
      });
    }

    // All humans left (forfeit, or the end screen emptied out): removePlayer's
    // self-destruct only fires on the LAST leaver, and that leaver would be a
    // bot nobody removes — so an abandoned bot game would idle out the 2h
    // results grace. Tear it down: the final removePlayer games.delete()s,
    // and the next pass reaps the bot Players.
    if (game.state === 'end') {
      if (game.saveInProgress) continue; // let the 2v2 save land first
      const rosterIds = Object.keys(game.players);
      if (rosterIds.length && rosterIds.every(pid => players.get(pid)?.isBot)) {
        for (const pid of rosterIds) {
          const b = players.get(pid);
          if (b) game.removePlayer(b, true);
        }
      }
      continue;
    }

    if (game.state !== 'guess') continue;
    const roster = game.players[id];
    if (roster.final) continue;

    // New round (or first sight of this game): schedule this bot's guess at a
    // random point inside the round, clamped to land before the timer does.
    // Placement bots shadow the human's score, so their only schedule is the
    // stall guard near the end of the timer — the hurry branch below (fires
    // the moment the human locks in) is their real trigger.
    if (bot.botGuessRound !== game.curRound || bot.botGuessGameId !== game.id) {
      bot.botGuessRound = game.curRound;
      bot.botGuessGameId = game.id;
      const remaining = Math.max(2000, (game.nextEvtTime ?? Date.now()) - Date.now());
      if (game.isPlacement) {
        bot.botGuessAt = Date.now() + Math.max(2000, remaining - PLACEMENT_STALL_GUARD_MS);
      } else {
        const min = Math.min(BOT_GUESS_MIN_MS, remaining * 0.25);
        const max = Math.min(BOT_GUESS_MAX_MS, remaining * 0.75);
        bot.botGuessAt = Date.now() + min + Math.random() * Math.max(0, max - min);
      }
      continue;
    }

    // Every human in the game locked in → answer like a present opponent:
    // pull the guess to within ~5s of that moment instead of making them
    // wait out the fallback schedule (never pushes an earlier schedule back).
    if (bot.botHurryRound !== game.curRound) {
      const humansDone = Object.entries(game.players).every(([pid, r]) =>
        players.get(pid)?.isBot || r.final);
      if (humansDone) {
        bot.botHurryRound = game.curRound;
        bot.botGuessAt = Math.min(bot.botGuessAt || Infinity,
          Date.now() + BOT_HURRY_MIN_MS + Math.random() * (BOT_HURRY_MAX_MS - BOT_HURRY_MIN_MS));
      }
    }

    if (bot.botGuessAt && Date.now() >= bot.botGuessAt) {
      game.setGuess(id, game.isPlacement ? placementGuess(game) : botRandomGuess(), true);
    }
  }
}
