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
import { players, games, playersInQueue } from '../serverUtils/states.js';
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
export function makeBotElo() {
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
export function createBotPlayer() {
  const bot = new Player(null, uuidv4(), 'bot'); // ws=null → Player.send() no-ops
  bot.isBot = true;
  bot.verified = true;
  bot.username = makeBotUsername();
  bot.accountId = null;
  bot.elo = makeBotElo();
  bot.countryCode = BOT_FLAGS_ENABLED ? makeBotCountryCode() : null;
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
export async function refreshBotEligibility(player) {
  if (!BOTS_ENABLED || !player?.accountId) return;
  try {
    const u = await User.findById(player.accountId)
      .select('duels_wins duels_losses duels_tied team2v2_wins team2v2_losses team2v2_tied')
      .lean();
    if (!u) {
      player.botEligibility = { ranked: false, team: false };
      return;
    }
    // .lean() skips schema defaults — dormant docs report undefined, not 0.
    const newbie = (wins, losses, tied, maxWinrate) => {
      const total = wins + losses + tied;
      return wins === 0 || wins / total <= maxWinrate;
    };
    player.botEligibility = {
      ranked: newbie(u.duels_wins || 0, u.duels_losses || 0, u.duels_tied || 0, 0.1),
      team: newbie(u.team2v2_wins || 0, u.team2v2_losses || 0, u.team2v2_tied || 0, 0.2),
    };
  } catch (e) {
    console.error('refreshBotEligibility failed for', player?.accountId, e?.message);
    // Fail toward humans: an unassessable player is treated as a veteran so
    // the pairing-pass hold can't strand them in queue.
    player.botEligibility = { ranked: false, team: false };
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
    if (bot.botGuessRound !== game.curRound || bot.botGuessGameId !== game.id) {
      bot.botGuessRound = game.curRound;
      bot.botGuessGameId = game.id;
      const remaining = Math.max(2000, (game.nextEvtTime ?? Date.now()) - Date.now());
      const min = Math.min(BOT_GUESS_MIN_MS, remaining * 0.25);
      const max = Math.min(BOT_GUESS_MAX_MS, remaining * 0.75);
      bot.botGuessAt = Date.now() + min + Math.random() * Math.max(0, max - min);
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
      game.setGuess(id, botRandomGuess(), true);
    }
  }
}
