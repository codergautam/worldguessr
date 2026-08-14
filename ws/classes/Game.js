import make6DigitCode from "../../serverUtils/make6DigitCode.js";
import { v4 as uuidv4 } from 'uuid';
import countries from '../../public/countries.json' with {type: "json"};
import officialCountryMaps from '../../public/officialCountryMaps.json' with {type: "json"};
import countryMaxDists from '../../public/countryMaxDists.json' with {type: "json"};

import MapModel from "../../models/Map.js";
import findLatLongRandom from '../../components/findLatLongServer.js';
import {games, players, playersInQueue } from '../../serverUtils/states.js';
import { getRandomPointInCountry } from "../../components/randomLoc.server.js";
import lookup from "coordinate_to_country";
import calcPoints from "../../components/calcPoints.js";
import { boundingExtent } from "ol/extent.js";
import { fromLonLat } from "ol/proj.js";
import { setElo, applyPlacementSeed, duelCounterIncs } from "../../api/eloRank.js";
import { MIN_ELO, RATING_FLOOR, clampRating, placementSeed } from "../../components/utils/eloSystem.js";
import { RATING_V2 } from "../../components/utils/ratingFlags.js";
import { getLeague } from "../../components/utils/leagues.js";

// How long finishSoloDuel will wait for the anti-farm pair-decay read before
// applying the transfers anyway. Two indexed findOnes that were issued when the
// match STARTED, so in practice this has already resolved and the race returns
// immediately; the bound exists so a database stall delays a result screen by a
// blink instead of holding the game open.
const RATING_DECAY_WAIT_MS = 750;
import GameModel from "../../models/Game.js";
import User from "../../models/User.js";
import StampQuests from "../../models/StampQuests.js";
import { STAMPS_ENABLED } from "../../serverUtils/stamps/config.js";
import { dayKeyUTC } from "../../serverUtils/stamps/periods.js";
import { grantStamps } from "../../serverUtils/stamps/grantStamps.js";
import UserStatsService from "../../components/utils/userStatsService.js";
import shuffle from "../../utils/shuffle.js";
import { DEFAULT_POST_GUESS_SECONDS, postGuessSecondsFor } from "../roundTimer.js";
import { sampleDistinct } from "../../shared/locations/repeatGuard.js";
import continentMapping from '../../public/continentMapping.json' with {type: "json"};

// ---- Stamps payout table (game-finish earns) --------------------------------
// The AMOUNTS live here; the CEILINGS live in serverUtils/stamps/reasons.js and
// are enforced on every write by assertReason. Keeping the whole per-game
// payout in one block is what makes "what does a game pay?" answerable without
// reading the grant code.
const STAMP_BOT_DAY_CAP = 30;                                       // bot-game stamps per UTC day, per user
const STAMP_BOT_GAME_REWARD = 2;

// Locations for a match come from sampleDistinct: distinct within the match,
// and outside `this.seenIds` (the participants' recent spots) where the caller
// supplies one. It is O(count), which matters because the public branch below
// calls it up to 50 times per match hunting for continent spread; the helper it
// replaced shuffled a full copy of the 2,000-entry pool on every one of those.

export default class Game {
  constructor(id, {
    public: isPublic = false,
    location = 'all',
    rounds = 5,
    allLocations = null,
    duel = false,
    // Set of location ids the participants have seen in recent matches, so a
    // duel does not re-serve a spot either side just played. Duels only: the
    // caller builds it from the Player rings (ws.js seenUnion).
    seenIds = null,
    teamDuel = false,   // two teams 'a'/'b' with shared HP (implies duel)
    is2v2Lobby = false, // private staging lobby for the 2v2 queue (never plays)
    maxPlayers,         // optional override; defaults: lobby→2, teamDuel→4, else 200
  } = {}) {
    this.id = id;
    this.code = isPublic ? null : make6DigitCode();
    this.players = {};
    this.state = 'waiting'; // [waiting, getready, guess, end]
    this.public = isPublic;
    // A team duel is "a duel between two teams": duel=true reuses the entire
    // duel pipeline (timer, health UI, save-skip, forfeit), teamDuel=true
    // switches scoring/forfeit/persistence to team semantics and disables ELO.
    this.teamDuel = teamDuel;
    this.duel = duel || teamDuel;
    this.is2v2Lobby = is2v2Lobby;
    // Intra-party team mode: two teams competing on CUMULATIVE points inside a
    // private party. Orthogonal to teamDuel/duel — it rides the casual party
    // pipeline (host start, resetGame loop, finishCasual-style save, no ELO).
    this.teamGame = false;
    this.teamScoring = 'closest';     // 'closest' (best guess, default) | 'average'
    this.allowTeamPick = false;       // non-hosts may switch their own team
    this.disableEmotes = false;       // host option: mute emote reactions for this game
    this.disableChat = false;         // host option: disable text chat for this game
    // Comms-XOR ruling: 2v2 staging lobbies are chat-only, full stop.
    // Stamped HERE so every creation path complies — the regroup/invite/
    // matchmaker sites were spawning staging lobbies with both surfaces live
    // because only createPrivateGame remembered the stamp.
    if (is2v2Lobby) this.disableEmotes = true;
    this.locked = false;              // host option: no NEW joins (code/invite); rejoins unaffected
    this.allowGuests = true;          // host option: false = signed-in accounts only
    this.lastRoundTeamScores = null;  // { round, scores: {a,b} } stash between givePoints and saveRoundToHistory
    this.lastTeamEnd = null;          // frozen duelEnd payload for end-state rejoins
    this.gameCount = 1; // Track how many times this game has been played
    this.timePerRound = 30000;
    this.waitBetweenRounds = 10000;
    if(this.duel) {
      // 1v1 keeps the tight 8s reveal; team duels get a 9s base — the ws
      // loop adds +1s to all team modes on top, landing 2v2 at 10s total.
      this.waitBetweenRounds = this.teamDuel ? 9000 : 8000;
      this.timePerRound = 60000;

    }
    // Shared per-team health for team duels (mirrors the 5000-HP duel model, one bar per team)
    if(teamDuel) {
      this.teamScores = { a: 5000, b: 5000 };
    }
    this.maxDist = 20000;
    this.startTime = null;
    this.endTime = null;
    this.nextEvtTime = null;
    this.locations = [];
    this.location = location;
    this.rounds = rounds;
    this.curRound = 0; // 1 = 1st round
    this.maxPlayers = maxPlayers ?? (is2v2Lobby ? 2 : (teamDuel ? 4 : 200));
    this.extent = null;
    this.displayLocation = null;
    this.readyToEnd = false;
    this.roundHistory = []; // Store guess history for each round
    this.roundStartTimes = {}; // Track when each round started for each player
    this.roundEndedAt = null; // Track when guess phase timer expired (for late guess buffer)
    this.disconnectedPlayer = null; // Track disconnected player for ranked 1v1 duels
    this.persistentPlayerData = {}; // Snapshot of each public-duel player so leavers still appear in the saved game
    this.saveInProgress = false; // Track if MongoDB save is in progress
    this.cleanupInProgress = false; // Prevent re-entrant cleanup during shutdown

    if(this.public) {
      this.showRoadName = false;
      this.nm = false;
      this.npz = false;
    }

    this.seenIds = seenIds;

    if(allLocations) this.generateLocations(allLocations);
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      players: this.players,
      state: this.state,
      public: this.public,
      duel: this.duel,
      teamDuel: this.teamDuel,
      is2v2Lobby: this.is2v2Lobby,
      teamScores: this.teamScores,
      teamGame: this.teamGame,
      teamScoring: this.teamScoring,
      allowTeamPick: this.allowTeamPick,
      disableEmotes: this.disableEmotes,
      disableChat: this.disableChat,
      // Party security must survive ws restarts like every other host
      // setting — omitting these silently unlocked parties and re-admitted
      // guests on every deploy while disableChat survived.
      locked: this.locked,
      allowGuests: this.allowGuests,
      lastRoundTeamScores: this.lastRoundTeamScores,
      lastTeamEnd: this.lastTeamEnd,
      roundStartTimes: this.roundStartTimes,
      timePerRound: this.timePerRound,
      waitBetweenRounds: this.waitBetweenRounds,
      maxDist: this.maxDist,
      startTime: this.startTime,
      endTime: this.endTime,
      nextEvtTime: this.nextEvtTime,
      locations: this.locations,
      location: this.location,
      rounds: this.rounds,
      curRound: this.curRound,
      maxPlayers: this.maxPlayers,
      extent: this.extent,
      displayLocation: this.displayLocation,
      readyToEnd: this.readyToEnd,
      roundHistory: this.roundHistory,
      nm: this.nm,
      npz: this.npz,
      showRoadName: this.showRoadName,
      calculationDone: this.calculationDone,
      eloChanges: this.eloChanges,
      pIds: this.pIds,
      accountIds: this.accountIds,
      oldElos: this.oldElos,
      queueWaitMs: this.queueWaitMs,
      // finishSoloDuel's save gate keys on this for bot duels (accountIds.p2
      // is null by construction there) — Player.isBot's game-side twin; a
      // restored bot game without it finishes but never saves to history.
      isBotGame: this.isBotGame,
      // Same bug class as isBotGame: the v2 rating apply is PRECOMPUTED at
      // match creation (ws.js) and never recomputed at finish time. A restart
      // that loses these silently downgrades a live v2 match to the legacy
      // path — or, worse, drops a placement match's placement semantics and
      // lets the normal apply overwrite a brand-new account's rating.
      ratingV2: this.ratingV2,
      isPlacement: this.isPlacement,
      gameCount: this.gameCount,
      saveInProgress: this.saveInProgress,
      // 2v2 staging-lobby matchmaking state: without these, a restart mid
      // "Queueing in 3…" countdown strands the lobby (the tick that polls
      // autoQueue2v2At never fires) and a regrouped matchmade duo silently
      // downgrades to chosen-duo cancel semantics.
      autoQueue2v2At: this.autoQueue2v2At,
      autoPaired: this.autoPaired,
      autoPairedTeams: this.autoPairedTeams,
      teamHostIds: this.teamHostIds,
      playAgainAcks: this.playAgainAcks,
      // Durable roster, including players who have already left. Without this,
      // restoring a short-handed team match drops the leaver from both the end
      // payload and the saved history (including their frozen cosmetics).
      persistentPlayerData: this.persistentPlayerData,
    }
  }
  static fromJSON(json) {
    const gObj = new Game(json.id, {
      public: json.public,
      location: json.location,
      rounds: json.rounds,
      duel: json.duel,
      // Gamestate snapshots written before the teamDuel rename carry `team2v2`.
      teamDuel: json.teamDuel ?? json.team2v2,
      is2v2Lobby: json.is2v2Lobby,
    });
    Object.assign(gObj, json);
    // Re-derive renamed fields in case an old snapshot's `team2v2` was just
    // Object.assign'd over the constructor-set values.
    gObj.teamDuel = json.teamDuel ?? json.team2v2 ?? false;
    delete gObj.team2v2;
    // Snapshots written before persistentPlayerData was serialized still need
    // a durable copy of every player who remains in the restored roster. A
    // player who left before that old snapshot was written is unrecoverable,
    // but nobody present at restore time may disappear from a later result.
    gObj.persistentPlayerData = json.persistentPlayerData
      && typeof json.persistentPlayerData === 'object'
      && !Array.isArray(json.persistentPlayerData)
      ? { ...json.persistentPlayerData }
      : {};
    if (gObj.duel || gObj.teamDuel || gObj.teamGame) {
      for (const [id, player] of Object.entries(gObj.players || {})) {
        if (gObj.persistentPlayerData[id]) continue;
        const score = Number.isFinite(player.score) ? player.score : 0;
        gObj.persistentPlayerData[id] = {
          accountId: player.accountId,
          username: player.username,
          countryCode: player.countryCode,
          nameGlow: player.nameGlow ?? null,
          markerSkin: player.markerSkin ?? null,
          tag: player.tag,
          team: player.team,
          score,
          initialScore: score,
        };
      }
    }
    // A snapshot can be written mid-save; the restored process has no
    // in-flight promise to ever flip this back, and a stuck `true` disables
    // the shutdown save-gate for this game. The interrupted write is lost
    // either way (not retried) — restore unlocked.
    gObj.saveInProgress = false;
    return gObj;

  }


  addPlayer(player, host=false, tag, team) {
    if(Object.keys(this.players).length >= this.maxPlayers) {
      return;
    }
    // Team-mode invariant: nobody on the roster is ever teamless. Assigned
    // BEFORE playerObj so the `player add` broadcast already carries the team
    // (covers lobby joins, mid-game joins, and end-state joins alike).
    if (this.teamGame && team !== 'a' && team !== 'b') team = this.autoAssignTeam();
    const playerObj = {
      username: player.username,
      accountId: player.accountId,
      countryCode: player.countryCode,
      id: player.id,
      score: this.teamDuel ? (this.teamScores?.[team] ?? 5000) : (this.duel ? 5000 : 0),
      host: host && !this.public,
      elo: player.elo,
      // THE TIER NAME, RESOLVED SERVER-SIDE. Clients must not derive this from
      // `elo` themselves: the browser and app bundles only ever hold the
      // hardcoded tier table, so a seasonal re-anchor (RatingConfig, loaded by
      // every server process) would move the badges on every server-rendered
      // surface while the in-duel HUD kept painting last season's cutoffs until
      // a web deploy AND a store release. Sending the name makes the HUD agree
      // with the leaderboard for free. resolveLeague() on both clients prefers
      // this and falls back to the local table for old payloads.
      league: player.elo != null ? getLeague(player.elo).name : null,
      tag,
      team, // 'a' | 'b' for team duels, undefined otherwise
      // COSMETICS TRAVEL WITH THE ROSTER. This object — not the Player
      // instance — is what every other client receives and renders from, and
      // the renderers read these two fields directly off it:
      // components/Map.js resolves the guess pin from `player.markerSkin` and
      // the tooltip glow from `player.nameGlow`, and duelHealthbar/gameUI read
      // `nameGlow` for the HP name plates. Omitting them here is invisible to
      // the buyer (their own client reads their session) and total for
      // everybody else: opponents fell back to the default src/src2 pins and
      // an unglowed name, so a purchased cosmetic was only ever visible to the
      // person who bought it.
      nameGlow: player.nameGlow ?? null,
      markerSkin: player.markerSkin ?? null,
    };
    this.sendAllPlayers({
      type: 'player',
      action: 'add',
      player: playerObj
    });

    this.players[player.id] = playerObj;
    player.gameId = this.id;
    player.inQueue = false;

    // Snapshot duel players so a mid-game leaver still appears in the saved
    // game (ranked forfeit resolution + team-duel loss recording). ALL duels,
    // not just public matchmade ones: private party team games (2v2 / future
    // NvM) persist via saveTeamDuelToMongoDB too, and its leaver-inclusion
    // reads this snapshot.
    if(this.duel) {
      this.persistentPlayerData[player.id] = {
        accountId: player.accountId,
        username: player.username,
        countryCode: player.countryCode,
        nameGlow: playerObj.nameGlow,
        markerSkin: playerObj.markerSkin,
        tag: tag,
        team: team,
        initialScore: playerObj.score
      };
    }

    player.send(this.getInitialSendState(player));
  }

  getInitialSendState(player) {
    return {
      type: 'game',
      // Room identity — see getSendableState's note. Both `game` payloads must
      // carry it or the client sees the key appear and vanish and clears on
      // every alternation.
      gameId: this.id,
      state: this.state,
      timePerRound: this.timePerRound,
      waitBetweenRounds: this.waitBetweenRounds,
      startTime: this.startTime,
      nextEvtTime: this.nextEvtTime,
      locations: this.locations,
      rounds: this.rounds,
      curRound: this.curRound,
      maxPlayers: this.maxPlayers,
      myId: player.id,
      public: this.public,
      duel: this.duel,
      // Placement seeding game — clients label the queue/VS/HUD off this.
      // Distinct from duelEnd's end-of-game `placement` field (seed reveal).
      isPlacement: !!this.isPlacement,
      team2v2: this.teamDuel, // wire name kept for shipped clients
      is2v2Lobby: this.is2v2Lobby,
      teamScores: this.teamScores ?? null,
      teamGame: !!this.teamGame,
      teamScoring: this.teamScoring,
      allowTeamPick: !!this.allowTeamPick,
      disableEmotes: !!this.disableEmotes,
      disableChat: !!this.disableChat,
      locked: !!this.locked,
      allowGuests: this.allowGuests !== false,
      hostGuest: (() => { const h = Object.values(this.players).find((p) => p.host); return !!h && !h.accountId; })(),
      teamRoundScores: this.lastRoundTeamScores ?? null,
      players: Object.values(this.players),
      host: this.players[player.id].host,
      maxDist: this.maxDist,
      code: this.code,
      extent: this.extent,
      generated: this.locations.length,
      displayLocation: this.displayLocation,
      roundHistory: this.roundHistory,
      // Remaining ms until this 2v2 staging lobby auto-queues (the client's
      // "Queueing in 3…" countdown); explicit null clears any stale value on
      // state refreshes since the client merges game payloads.
      autoQueueInMs: this.autoQueue2v2At ? Math.max(0, this.autoQueue2v2At - Date.now()) : null,
      // Play Again duo regroup: enter2v2Queue follows in the same burst, so
      // the client skips painting this lobby (additive — old clients ignore).
      queueBoundDuo: !!this.queueBoundDuo,

      nm: this.nm,
      npz: this.npz,
      showRoadName: this.showRoadName,
    }
  }

  resetGame(allLocations) {
    this.state = 'waiting';
    // clear locations
    this.locations = [];
    // clear round history
    this.roundHistory = [];
    // Team parties: fresh totals, but assignments + config survive play-again.
    if (this.teamGame) this.teamScores = { a: 0, b: 0 };
    this.lastRoundTeamScores = null;
    this.lastTeamEnd = null;
    // finishTeamParty's re-entrancy guard must re-arm for the next game in
    // this lobby (duel finishers never replay — parties do).
    this.calculationDone = false;
    // increment game count for party games
    this.gameCount++;
    // start generating new locations
    this.generateLocations(allLocations);
    this.sendStateUpdate();
  }


  rejoinGame(player) {
    // Back among the living: clear the close handler's roster flag. The
    // roster-undim broadcast happens below and skips the rejoiner — the
    // hollow mid-game shape (no public/duel/myId/locations) must never reach
    // a freshly-refreshed page: as the FIRST game payload it latched inGame
    // around half-empty gameData (July 23: black end-screen veil + "leave
    // party" confirm on a ranked duel), and trailing the snapshot it would
    // resurrect lobby state that a full-payload-only early return just
    // cleared (queueBoundDuo's skip-to-queue).
    const seat = this.players[player.id];
    const wasDisconnected = !!seat?.disconnected;
    if (wasDisconnected) delete seat.disconnected;
    // Team duels replay their frozen end payload below instead of kicking —
    // a blip in the final seconds used to cost the player the whole results
    // screen ("Reconnected!" toast straight into a silent gameShutdown).
    if(this.public && this.state === 'end' && !this.teamDuel) {
      // Kick-only burst: no undim for a seat that's being removed anyway
      // (removePlayer broadcasts its own roster update), and no game payload
      // for the client's gameShutdown closure guard to trip over.
      this.removePlayer(player);
    } else {
      try {
    player.ws.send(JSON.stringify(this.getInitialSendState(player)));
      } catch(e) {
        console.error('Error sending game state to rejoining player', e);
      }
      // Undim for the OTHERS only — the rejoiner's snapshot above was
      // serialized after the flag cleared, so it already shows them live.
      if (wasDisconnected) {
        const undim = this.getSendableState();
        for (const playerId of Object.keys(this.players)) {
          if (playerId === player.id) continue;
          const p = players.get(playerId);
          if (!p) continue;
          try {
            p.send(undim);
          } catch (e) {
            console.error('rejoinGame undim: send failed for', playerId, e?.message);
          }
        }
      }
      // Team game (party OR matchmade duel) ended while this player was
      // disconnected: replay the frozen end payload, otherwise they reconnect
      // to state==='end' with no duelEnd and the results screen never renders.
      if (this.state === 'end' && this.lastTeamEnd && (this.teamGame || this.teamDuel)) {
        const mine = this.lastTeamEnd.players?.find((p) => p.id === player.id);
        player.send({
          type: 'duelEnd',
          ...(this.teamDuel
            ? {
                autoPaired: !!this.autoPairedTeams?.[mine?.team],
                teamHostId: this.teamHostIds?.[mine?.team] || null
              }
            : { teamGame: true, teamScoring: this.teamScoring }),
          ...this.lastTeamEnd,
          winner: !this.lastTeamEnd.draw && mine?.team === this.lastTeamEnd.winningTeam
        });
        if (this.teamDuel && mine?.team) this.sendPlayAgainState(mine.team);
      }
      // Re-sync a 2v2 duo after a blip: the close handler unqueued us on
      // disconnect, but if our teammate kept searching through it, rejoin
      // the queue at their side instead of idling in the lobby while they
      // wait for a duo that can never complete.
      if (!this.public && this.state === 'waiting' && !player.inQueue) {
        for (const m of Object.values(this.players)) {
          if (m.id === player.id) continue;
          const entry = playersInQueue.get(m.id);
          if (entry?.mode === '2v2' && entry.teamId) {
            player.inQueue = true;
            playersInQueue.set(player.id, { mode: '2v2', teamId: entry.teamId, queueTime: Date.now() });
            player.send({ type: 'enter2v2Queue', stage: 'opponents' });
            break;
          }
        }
      }
      // A server restart ate this player's 2v2 matchmaking (queue entries are
      // not persisted; the recovery loop flags the casualties). Tell them why
      // they're back on an idle lobby — unless the re-sync above just put
      // them straight back in the queue. One-shot per player.
      if (player.queueKilledByRestart) {
        player.queueKilledByRestart = false;
        if (!player.inQueue) {
          player.send({ type: 'toast', key: 'matchmakingCancelled', toastType: 'info' });
        }
      }
  }
  }

  static otherTeam(team) {
    return team === 'a' ? 'b' : 'a';
  }

  // Members of a team still on the roster. Leavers are deleted from
  // this.players; long-disconnected members may linger past the 30s grace
  // (rejoinable while a teammate holds the fort — purge's team-duel exception).
  teamMembers(team) {
    return Object.values(this.players).filter((p) => p.team === team);
  }

  // A team's round score is the CLOSEST (best) guess among its members;
  // 0 if nobody on the team guessed. Size-agnostic: works for 2v2 today and
  // uneven private team duels later.
  teamRoundScore(team, loc) {
    let best = 0;
    for (const p of this.teamMembers(team)) {
      if (!p.guess) continue;
      best = Math.max(best, calcPoints({
        lat: loc.lat,
        lon: loc.long,
        guessLat: p.guess[0],
        guessLon: p.guess[1],
        usedHint: false,
        maxDist: this.maxDist
      }));
    }
    return best;
  }

  // Team-party 'average' scoring: mean over the team's roster AT SCORING TIME.
  // Members who didn't guess contribute 0 to the numerator but count in the
  // denominator; an emptied team scores 0 (never NaN).
  teamAverageScore(team, loc) {
    const members = this.teamMembers(team);
    if (members.length === 0) return 0;
    let sum = 0;
    for (const p of members) {
      if (!p.guess) continue;
      sum += calcPoints({
        lat: loc.lat,
        lon: loc.long,
        guessLat: p.guess[0],
        guessLon: p.guess[1],
        usedHint: false,
        maxDist: this.maxDist
      });
    }
    return Math.round(sum / members.length);
  }

  // Smaller team, random on tie — keeps auto-assigned joins roughly even.
  autoAssignTeam() {
    const a = this.teamMembers('a').length;
    const b = this.teamMembers('b').length;
    if (a === b) return Math.random() < 0.5 ? 'a' : 'b';
    return a < b ? 'a' : 'b';
  }

  // Random AND even (sizes differ by ≤1): Fisher-Yates then alternate a/b.
  // Serves both the mode-enable auto-split and the host's Shuffle button.
  // Random even split (no broadcast — callers decide when to send).
  assignTeamsEvenly() {
    const ids = shuffle(Object.keys(this.players));
    ids.forEach((id, i) => { this.players[id].team = i % 2 === 0 ? 'a' : 'b'; });
  }

  shuffleTeamsEvenly() {
    this.assignTeamsEvenly();
    this.sendStateUpdate();
  }

  // Host toggles/config for intra-party team mode. Field-validated; anything
  // malformed is ignored so a raw message can never wedge the lobby. One
  // broadcast at the end regardless of which fields changed.
  applyTeamConfig(json) {
    if (typeof json.enabled === 'boolean' && json.enabled !== this.teamGame) {
      this.teamGame = json.enabled;
      if (json.enabled) {
        this.teamScores = { a: 0, b: 0 };
        this.assignTeamsEvenly(); // no nested broadcast — the single update below carries it
      } else {
        // Explicit nulls: the client merges game payloads by spread and
        // JSON.stringify drops undefined — omitted keys would never clear.
        for (const p of Object.values(this.players)) p.team = null;
        this.teamScores = null;
        this.lastRoundTeamScores = null;
        this.lastTeamEnd = null;
      }
    }
    if (json.scoring === 'average' || json.scoring === 'closest') {
      this.teamScoring = json.scoring;
    }
    if (typeof json.allowTeamPick === 'boolean') {
      this.allowTeamPick = json.allowTeamPick;
    }
    this.sendStateUpdate();
  }

  // 2v2 damage multiplier for a given round — THE single source of truth for
  // the formula. Every surface (live banner, round-over hearts, DB replays)
  // displays the stamped damage/multiplier, so tweaking this value or making
  // it ramp per round later needs no client change. Unstamped rounds fall
  // back to the raw gap (×1) client-side, matching the pre-stamp servers
  // that applied no multiplier.
  teamDamageMultiplier(round) {
    return 1.3;
  }

  givePoints() {
    if(this.teamDuel) {
      // Team duel: the losing team's shared health drops by the round-score
      // differential between the two teams' best guesses.
      const loc = this.locations[this.curRound - 1];
      if(!loc) {
        console.error('No location found for round', this.curRound, this.locations);
        return;
      }

      const scoreA = this.teamRoundScore('a', loc);
      const scoreB = this.teamRoundScore('b', loc);
      // Multiplied damage (matchmade 2v2 only — party team games have no HP)
      // so matches close out faster. damage + multiplier are stamped on the
      // wire (reveal banner) AND into roundHistory (saveRoundToHistory) so
      // clients show the HP actually applied instead of re-deriving |a−b|,
      // which would drift from the bars.
      const multiplier = this.teamDamageMultiplier(this.curRound);
      const damage = Math.round(Math.abs(scoreA - scoreB) * multiplier);
      this.lastRoundTeamScores = { round: this.curRound, scores: { a: scoreA, b: scoreB }, damage, multiplier };
      if (scoreA !== scoreB) {
        const loser = scoreA > scoreB ? 'b' : 'a';
        this.teamScores[loser] = Math.max(0, this.teamScores[loser] - damage);
        if (this.teamScores[loser] <= 0) {
          this.teamScores[loser] = 0;
          this.readyToEnd = true;
        }
      }

      // Sync each player's score to their team's shared health so the existing
      // serialization + health-bar UI keep working without special-casing.
      for (const player of Object.values(this.players)) {
        if (player.team) player.score = this.teamScores[player.team];
      }
      return;
    }
    if(!this.duel) {
    for (const playerId of Object.keys(this.players)) {
      const player = this.players[playerId];
      if(!player.guess) {
        continue;
      }

      const loc = this.locations[this.curRound - 1];
      if(loc) {
      player.score += calcPoints({
        lat: loc.lat,
        lon: loc.long,
        guessLat: player.guess[0],
        guessLon: player.guess[1],
        usedHint: false,
        maxDist: this.maxDist
      })
    } else {
      console.error('No location found for round', this.curRound, this.locations);
    }

    }

    // Intra-party team mode: on top of the personal totals above, each team
    // banks this round's score (host-chosen method) into its cumulative total.
    if (this.teamGame && this.teamScores) {
      const loc = this.locations[this.curRound - 1];
      if (loc) {
        const scores = { a: 0, b: 0 };
        for (const team of ['a', 'b']) {
          scores[team] = this.teamScoring === 'closest'
            ? this.teamRoundScore(team, loc)
            : this.teamAverageScore(team, loc);
          this.teamScores[team] += scores[team];
        }
        this.lastRoundTeamScores = { round: this.curRound, scores };
      }
    }
  } else {
    // subtract the difference of the score from the lower scored player

    const loc = this.locations[this.curRound - 1];
    if(loc) {

    const p1= this.players[Object.keys(this.players)[0]];
    const p2 = this.players[Object.keys(this.players)[1]];
    if(!p1 || !p2) {
      return;
    }
    let p1score = 0;
    let p2score = 0;

    const mult = 1;
    if(p1.guess ) {
    p1score = calcPoints({
      lat: loc.lat,
      lon: loc.long,
      guessLat: p1.guess[0],
      guessLon: p1.guess[1],
      usedHint: false,
      maxDist: this.maxDist
    })*mult;
  }

  if(p2.guess) {
    p2score = calcPoints({
      lat: loc.lat,
      lon: loc.long,
      guessLat: p2.guess[0],
      guessLon: p2.guess[1],
      usedHint: false,
      maxDist: this.maxDist
    })*mult;

  }

    const diff = Math.abs(p1score - p2score);

    if(p1score > p2score) {
      this.players[Object.keys(this.players)[1]].score -= diff;
      if(this.players[Object.keys(this.players)[1]].score <= 0) {
        this.players[Object.keys(this.players)[1]].score = 0;
        // end game
        this.readyToEnd = true;

      }

    } else {
      this.players[Object.keys(this.players)[0]].score -= diff;
      if(this.players[Object.keys(this.players)[0]].score <= 0) {
        this.players[Object.keys(this.players)[0]].score = 0;
        // end game
        this.readyToEnd = true;
      }

    }
  } else {
    console.error('No location found for round', this.curRound, this.locations);
  }
  }
  }

  saveRoundToHistory() {
    if (this.curRound > 0 && this.curRound <= this.locations.length) {
      const roundData = {
        round: this.curRound,
        location: this.locations[this.curRound - 1],
        players: {}
      };

      // Both team modes carry the server-computed per-team round score (each
      // team's counting points THIS round). givePoints() already computes these
      // for 2v2 too (it needs them for the damage calc) but 2v2 historically
      // dropped them here — leaving the round-breakdown columns to a fragile
      // client-side recompute that rendered 0/0 when ids failed to line up.
      // Stamp them for both modes so every client reads one server truth.
      // ('average' especially is not reconstructable client-side: its
      // denominator is the roster at scoring time, which leavers/joiners change.)
      if ((this.teamGame || this.teamDuel) && this.lastRoundTeamScores?.round === this.curRound) {
        roundData.teamRoundScores = this.lastRoundTeamScores.scores;
      }

      // Team-party cumulative running totals (points). A 2v2's "totals" are
      // shared HP, surfaced via teamDamage below instead — never as points.
      if (this.teamGame && this.lastRoundTeamScores?.round === this.curRound) {
        roundData.teamTotals = { ...this.teamScores };
      }

      // 2v2 rounds also stamp the HP actually applied plus the multiplier it was
      // computed with (see teamDamageMultiplier) — round-over hearts and DB
      // replays read these instead of re-deriving the formula.
      if (this.teamDuel && this.lastRoundTeamScores?.round === this.curRound) {
        roundData.teamDamage = this.lastRoundTeamScores.damage;
        roundData.teamDamageMultiplier = this.lastRoundTeamScores.multiplier;
      }

      // Save each player's guess and calculated points for this round
      for (const playerId of Object.keys(this.players)) {
        const player = this.players[playerId];

        if (player.guess) {
          // Player made a guess
          const loc = this.locations[this.curRound - 1];
          let points = 0;

          if (this.duel) {
            // For duels, calculate raw points without the health system
            points = calcPoints({
              lat: loc.lat,
              lon: loc.long,
              guessLat: player.guess[0],
              guessLon: player.guess[1],
              usedHint: false,
              maxDist: this.maxDist
            });
          } else {
            // For regular games, use standard points calculation
            points = calcPoints({
              lat: loc.lat,
              lon: loc.long,
              guessLat: player.guess[0],
              guessLon: player.guess[1],
              usedHint: false,
              maxDist: this.maxDist
            });
          }

          roundData.players[playerId] = {
            username: player.username,
            countryCode: player.countryCode,
            lat: player.guess[0],
            long: player.guess[1],
            points: points,
            final: player.final,
            timeTaken: player.roundTimeTaken || this.timePerRound / 1000 // Use actual time or default
          };
        } else {
          // Player didn't make a guess - still record them with null values
          roundData.players[playerId] = {
            username: player.username,
            countryCode: player.countryCode,
            lat: null,
            long: null,
            points: 0,
            final: false,
            timeTaken: this.timePerRound / 1000 // Full time since they didn't guess
          };
        }
      }

      this.roundHistory.push(roundData);
    }
  }

  clearGuesses() {
    for (const playerId of Object.keys(this.players)) {
      const player = this.players[playerId];
      player.guess = null;
      player.final = false;
      player.roundTimeTaken = null; // Reset time for new round
    }
    this.roundEndedAt = null; // Reset late guess buffer
    // Track when this round's guessing phase starts for time calculation
    this.roundStartTimes[this.curRound] = Date.now();
  }


  getSendableState(includeLocations=false) {
    const state = {
      type: 'game',
      // THE ROOM IDENTITY, ON EVERY GAME PAYLOAD. Clients clear per-room state
      // (the chat log) when this changes, so it has to be present in BOTH game
      // messages and be stable for a room's whole life. `code` and `startTime`
      // were tried and both fail here: this payload carries neither, and
      // startTime is stamped in start() which runs AFTER addPlayer, so the
      // initial state ships null and no later message ever corrects it — the
      // client's key collapsed to a constant and last match's chat survived
      // into the rematch. game.id is a uuid per Game object: stable across a
      // party's resetGame replays (so party chat still spans play-agains) and
      // fresh for every matchmade match (so those clear).
      gameId: this.id,
      state: this.state,
      curRound: this.curRound,
      maxPlayers: this.maxPlayers,
      nextEvtTime: this.nextEvtTime,
      team2v2: this.teamDuel, // wire name kept for shipped clients
      is2v2Lobby: this.is2v2Lobby,
      teamScores: this.teamScores ?? null,
      teamGame: !!this.teamGame,
      teamScoring: this.teamScoring,
      allowTeamPick: !!this.allowTeamPick,
      disableEmotes: !!this.disableEmotes,
      disableChat: !!this.disableChat,
      locked: !!this.locked,
      allowGuests: this.allowGuests !== false,
      // Guest-hosted parties are emotes-only — clients hide the whole chat
      // surface off this flag (roster entries carry accountId).
      hostGuest: (() => { const h = Object.values(this.players).find((p) => p.host); return !!h && !h.accountId; })(),
      teamRoundScores: this.lastRoundTeamScores ?? null,
      players: Object.values(this.players),
      generated: this.locations?.length || 0,
      map: this.location,
      extent: this.extent,
      // Include maxDist in every game payload. It's also broadcast as a standalone
      // `maxDist` message, but a cold reconnect only replays this `game` state —
      // without it the client falls back to the 20000 default and mis-scores the
      // between-rounds banner on community/country maps. Additive; clients already
      // read maxDist from the separate message too.
      maxDist: this.maxDist,
      showRoadName: !!this.showRoadName,
      nm: !!this.nm,
      npz: !!this.npz,
      // Same cold-reconnect reasoning as maxDist above: a reconnect only
      // replays this state, and the placement HUD tag must survive it.
      isPlacement: !!this.isPlacement
    };
    if (includeLocations) {
      state.locations = this.locations;
      state.rounds = this.rounds;
      state.timePerRound = this.timePerRound;
      state.nm = this.nm;
      state.npz = this.npz;
      state.showRoadName = this.showRoadName;
      state.rounds = this.rounds;
      state.displayLocation = this.displayLocation;
      state.roundHistory = this.roundHistory;
      // timePerround, nm,npz,showRoadName,rounds
    }
    return state;
  }

  sendStateUpdate(includeLocations=false) {
    const state = this.getSendableState(includeLocations);
    this.sendAllPlayers(state);
  }

  removePlayer(player, socketClosed=false) {
    if (!this.players[player.id]) {
      // Seat already pruned (direct roster deletes never touch the Player):
      // still clear the back-pointer, or the id dangles after this game dies
      // and gates every queue/create entry. Own-game check so a player who
      // has since joined ANOTHER game never gets that id wiped.
      if (player.gameId === this.id) player.gameId = null;
      return;
    }
    if(!socketClosed) {
    player.send({
      type: 'gameShutdown'
    });
  }
    const isPlayerHost = this.players[player.id].host;
    const tag = this.players[player.id].tag;
    const leaverTeam = this.players[player.id].team;

    // For ranked duels: if someone leaves during "getready" (countdown before first round),
    // cancel the game without ELO penalties - no actual gameplay has happened yet.
    // curRound is set to 1 at start() and incremented after each round, so curRound <= 1
    // ensures we only treat it as pregame during the initial countdown, not between rounds.
    // (Known gap, out of scope: a 1v1 leave during pre-round 'waiting' — while
    // locations generate — falls through to the mid-game forfeit path.)
    const isPreGameLeave = this.public && this.duel && this.state === 'getready' && this.curRound <= 1;
    // Match already decided — a side hit 0 HP (readyToEnd) or every round has
    // been played (post-final getready) — and the game is only waiting out the
    // end countdown. A leave here skips the results screen, it is NOT a
    // forfeit: the result must come from the scores, or the winning side
    // quitting early gets its earned win flipped into a forfeit loss.
    const matchDecided = this.readyToEnd || this.curRound > this.rounds;
    // Track disconnection for ranked 1v1 forfeit resolution only; team duels
    // resolve forfeits via forfeitedTeam passed to end() below.
    if(this.public && this.duel && !this.teamDuel && !isPreGameLeave && !matchDecided) {
      this.disconnectedPlayer = tag;
    }

    // Keep the leaver's snapshot score current so score-based resolution
    // (decided-match leaves) and the saved game see their real final health,
    // not their join-time score.
    if (this.persistentPlayerData[player.id]) {
      this.persistentPlayerData[player.id].score = this.players[player.id].score;
      this.persistentPlayerData[player.id].nameGlow = this.players[player.id].nameGlow ?? null;
      this.persistentPlayerData[player.id].markerSkin = this.players[player.id].markerSkin ?? null;
    }

    delete this.players[player.id];
    player.gameId = null;
    player.inQueue = false;

    // Post-game teammate departure: the survivor's Play Again must not fire
    // on a stale consent — reset the team's acks to a fresh decision and
    // re-broadcast (needed drops to the living count, e.g. 2/2 → 0/1).
    if (this.teamDuel && this.state === 'end' && leaverTeam && this.playAgainAcks?.[leaverTeam]) {
      this.playAgainAcks[leaverTeam] = {};
      this.sendPlayAgainState(leaverTeam);
    }

    // Any roster change breaks an auto-paired duo: whoever remains (or later
    // joins by code) must get CHOSEN-duo cancel semantics, not have a stale
    // matchmade flag dissolve their team on cancel.
    if (this.is2v2Lobby) this.autoPaired = false;

    this.sendAllPlayers({
      type: 'player',
      id: player.id,
      action: 'remove'
    });

    this.checkRemaining();

    // self destruct if no players or it is a Party and host left.
    // 2v2 staging lobbies are exempt from the host rule: they must survive
    // host loss (disconnect purge, code-hop) while members sit in the 2v2
    // queue — shutdown() would clear the queued teammate's inQueue and strand
    // their client on the searching screen (gameShutdown is ignored when not
    // inGame). The crown passes to the teammate instead.
    if (Object.keys(this.players).length < 1 || (!this.duel && !this.is2v2Lobby && isPlayerHost)) {
      // A disband is not a forfeit: flag before shutdown() so its recursive
      // removePlayer calls skip the team forfeit resolution below, and return
      // so this call does too.
      this.cleanupInProgress = true;
      // Host-leave disband: tell the survivors why they're being thrown out
      // before shutdown()'s gameShutdown teardown lands.
      if (isPlayerHost && Object.keys(this.players).length > 0) {
        this.sendAllPlayers({ type: 'toast', key: 'partyDisbanded', toastType: 'info' });
      }
      this.shutdown();
      games.delete(this.id);
      return;
    } else if (this.is2v2Lobby) {
      if (isPlayerHost) {
        const heir = Object.values(this.players)[0];
        heir.host = true;
      }
      // A departure invalidates any matchmaking in flight: the pre-queue
      // countdown deadline and a stage-2 teamId were computed for the OLD
      // roster. Snap every live survivor back onto the lobby card (yes, even
      // a queued one — their team just broke, the searching screen is lying),
      // then re-arm the stamp so the next 500ms tick re-queues them against
      // the real roster (lone member → stage-1 teammate search). Without this
      // a survivor ticks "Queueing in 1…" against a dead deadline, or hunts
      // opponents under a phantom teamId until build2v2Teams' backstop.
      const survivors = Object.values(this.players)
        .map((m) => players.get(m.id))
        .filter((sock) => sock && !sock.disconnected);
      const matchmaking = !!this.autoQueue2v2At || survivors.some((s) => s.inQueue);
      // Re-arm BEFORE the snapshot sends so autoQueueInMs=0 rides them: the
      // survivor paints a disabled "Queueing…" for the sub-tick gap instead
      // of an enabled Find Match that lies (and invites a double-queue click).
      if (matchmaking) this.autoQueue2v2At = Date.now();
      for (const sock of survivors) sock.send(this.getInitialSendState(sock));
    }

    // Don't re-resolve forfeits on a game that already finished or is being
    // torn down — the 30s disconnect purge can remove several players in one
    // tick, and only the first removal may end the game.
    if (this.state === 'end' || this.calculationDone || this.cleanupInProgress) {
      return;
    }

    if (this.teamDuel) {
      // Team-based forfeit semantics: a game only ends when an ENTIRE team is
      // gone; a lone remaining teammate plays on short-handed (scoring and the
      // round timer already handle any team size).
      const preGame = this.state === 'waiting' || (this.state === 'getready' && this.curRound <= 1);
      if (preGame) {
        this.cancelTeamDuelPregame();
      } else if (leaverTeam && this.teamMembers(leaverTeam).length === 0) {
        // Decided match: no forfeit — finishTeamDuel resolves by team health.
        this.end(null, matchDecided ? {} : { forfeitedTeam: leaverTeam });
      }
    } else if (this.teamGame && this.state !== 'waiting') {
      // Team parties inherit the team-duel forfeit rule: the match ends only
      // when an ENTIRE team is gone (a lone survivor plays on short-handed),
      // and the emptied team loses regardless of points. 'waiting' leaves are
      // plain lobby churn. matchDecided (post-final getready) still resolves
      // by scores — quitting during the end countdown is not a forfeit.
      if (leaverTeam && this.teamMembers(leaverTeam).length === 0) {
        this.end(null, matchDecided ? {} : { forfeitedTeam: leaverTeam });
      }
    } else if (this.duel && Object.keys(this.players).length < 2) {
      if (isPreGameLeave) {
        // Cancel game without ELO penalties - notify remaining player
        // Set flag to prevent re-entrant cleanup when shutdown() calls removePlayer()
        this.cleanupInProgress = true;
        this.sendAllPlayers({
          type: 'gameCancelled',
          reason: 'opponent_left_before_start'
        });
        this.shutdown();
        games.delete(this.id);
      } else {
        // Normal forfeit — player left during actual gameplay. If the match
        // was already decided, scores resolve it instead of the forfeit.
        this.end(tag, { decided: matchDecided });
      }
    }
  }

  // A team duel that hasn't truly begun (still generating locations, or in the
  // first getready countdown) shouldn't strand or punish anyone when a player
  // leaves: regroup each surviving team into a fresh staging lobby TOGETHER —
  // once paired, a team stays a team across requeues (intentional) — give
  // them a beat to see their lobby, then the 500ms loop's autoQueue2v2At scan
  // re-queues them (full duo → opponent search, lone survivor → teammate
  // search). NOTE: gameCancelled must never be sent for team duels — shipped
  // clients respond to it by auto-queueing RANKED.
  cancelTeamDuelPregame() {
    this.cleanupInProgress = true;
    for (const team of ['a', 'b']) {
      const live = [];
      for (const member of this.teamMembers(team)) {
        const sock = players.get(member.id);
        if (!sock) continue;
        sock.gameId = null;
        // Bots are game-scoped: this game dying is the end of their life.
        // Regrouping one would hand build2v2Teams a phantom auto-queued "duo"
        // that real human teams then silently match against. gameId is nulled
        // above, so the next tickBots pass reaps them from the players map.
        if (sock.isBot) continue;
        // Grace-window zombies (disconnected, awaiting the 30s purge) are not
        // regrouped: their close handler already cleaned their queue state,
        // and a fresh queue entry would outlive players.delete as a stale
        // playersInQueue key.
        if (!sock.disconnected) live.push(sock);
      }
      if (live.length === 0) continue;
      const lobby = new Game(uuidv4(), { is2v2Lobby: true });
      games.set(lobby.id, lobby);
      // Stamp before addPlayer so the members' lobby state carries
      // autoQueueInMs and their clients render the requeue countdown.
      // Duo: a 3s beat to see their regrouped team. Lone survivor: nothing
      // to look at — requeue on the next poll tick (same ruling as the
      // instant solo requeue on teammate DC in removePlayer).
      lobby.autoQueue2v2At = live.length >= 2 ? Date.now() + 3000 : Date.now();
      // A regrouped matchmade pairing keeps matchmade cancel semantics
      // (stage-2 cancel dissolves it); a chosen duo stays a chosen duo.
      lobby.autoPaired = live.length >= 2 && !!this.autoPairedTeams?.[team];
      lobby.addPlayer(live[0], true);
      if (live[1]) lobby.addPlayer(live[1]);
    }
    games.delete(this.id);
  }

  start(hostPlayer = null) {
    // Check each condition and provide specific error messages
    if (this.state !== 'waiting') {
      console.log('Cannot start game: not in waiting state', this.state);
      return;
    }

    if (Object.keys(this.players).length < 2) {
      console.log('Cannot start game: not enough players', Object.keys(this.players).length);
      if (hostPlayer) {
        hostPlayer.send({
          type: 'toast',
          key: 'needMorePlayers',
          toastType: 'error'
        });
      }
      return;
    }

    if (this.rounds !== this.locations.length) {
      console.log('Cannot start game: locations not loaded', this.rounds, this.locations.length);
      if (hostPlayer) {
        hostPlayer.send({
          type: 'toast',
          key: 'mapLocationsLoading',
          toastType: 'error'
        });
      }
      return;
    }

    if (this.teamGame) {
      // Sweep: any teamless player (a path that forgot assignment) is fixed
      // here, making it structurally impossible to start inconsistent.
      for (const p of Object.values(this.players)) {
        if (p.team !== 'a' && p.team !== 'b') p.team = this.autoAssignTeam();
      }
      if (!this.teamMembers('a').length || !this.teamMembers('b').length) {
        if (hostPlayer) {
          hostPlayer.send({
            type: 'toast',
            key: 'teamNeedsPlayers', // must match the locale key (was 'teamsNeedPlayers' — raw-key toast)
            toastType: 'error'
          });
        }
        return;
      }
      this.teamScores = { a: 0, b: 0 };
      this.lastRoundTeamScores = null;
      this.lastTeamEnd = null;
      // Freeze the roster for leaver-inclusive results + persistence (teams
      // are locked once started — setPlayerTeam guards state==='waiting').
      // RESET first: replayed parties (gameCount++) must not resurrect
      // leavers from the previous game in this lobby.
      this.persistentPlayerData = {};
      for (const p of Object.values(this.players)) {
        this.persistentPlayerData[p.id] = {
          accountId: p.accountId,
          username: p.username,
          countryCode: p.countryCode,
          nameGlow: p.nameGlow ?? null,
          markerSkin: p.markerSkin ?? null,
          team: p.team,
          score: 0,
          initialScore: 0
        };
      }
    }
    this.state = 'getready';
    this.startTime = Date.now();
    this.nextEvtTime = this.startTime + 5000;
    this.curRound = 1;


    // reset everyones score to 0
    if(!this.public) {
    for (const playerId of Object.keys(this.players)) {
      this.players[playerId].score = 0;
    }
  }


    this.sendStateUpdate(true);
  }
  setGuess(playerId, latLong, final, round) {
    if(this.state !== 'guess') {
      return;
    }

    // Reject if client-specified round doesn't match current round.
    // Old clients that don't send round (undefined) are still accepted.
    if (round !== undefined && round !== null && round !== this.curRound) {
      return;
    }

    if (!this.players[playerId]) {
      return;
    }

    const player = this.players[playerId];
    if (player.final) {
      return;
    }

    if (final) {
      player.final = true;
      // When marking as final, prefer the coordinates already set by the most
      // recent interim placement (final:false) — those come directly from the
      // Leaflet click event and are always accurate.  The final:true message's
      // coordinates can be stale due to React closure timing, so only use them
      // as a fallback when no interim guess exists.
      if (!player.guess) {
        player.guess = latLong;
      }
    } else {
      player.guess = latLong;
    }

    // Team duels: stream interim (non-final) guesses to teammates ONLY, so
    // partners can coordinate before locking in without leaking to opponents.
    if ((this.teamDuel || this.teamGame) && !final && player.team) {
      this.sendTeam(player.team, {
        type: 'place',
        id: playerId,
        final: false,
        latLong: player.guess,
        teammate: true
      }, playerId);
    }

    // Track time taken for this round when player makes final guess
    if(final && this.roundStartTimes[this.curRound]) {
      const timeTaken = Date.now() - this.roundStartTimes[this.curRound];
      player.roundTimeTaken = Math.floor(timeTaken / 1000); // Convert to seconds
    }

    if(final) {
      this.sendAllPlayers({
        type: 'place',
        id: playerId,
        final: true,
        latLong: player.guess
      });

      this.checkRemaining();

    }

  }
  checkRemaining() {
          // Round-timer logic only. removePlayer calls this in EVERY state,
          // and .final flags are never cleared after the last round — without
          // this guard, any departure from an ended game collapsed the 2-hour
          // results grace to ~1s and the main loop shutdown()/resetGame()'d
          // the game under the survivors' Play Again consensus (post-game
          // buttons dead-clicked for everyone left). Same stale-final issue
          // would collapse the getready breather.
          if (this.state !== 'guess') return;
          // Team modes (2v2 duels AND team parties): exclude LONG-disconnected
          // members from the timer rules below. Within the 30s reconnect grace
          // a dropout still holds the round open (they may be back any
          // second); past it they are only kept for late rejoin (the purge's
          // team rejoin exception) and must not force full-length rounds on
          // the live players.
          const holdsRounds = (p) => {
            if (!this.teamDuel && !this.teamGame) return true;
            const sock = players.get(p.id);
            return !(sock?.disconnected && Date.now() - sock.disconnectTime > 30000);
          };
          const counted = Object.values(this.players).filter(holdsRounds);

          // If everyone has placed, collapse the round to ~1s regardless of mode.
          let allFinal = true;
          for (const p of counted) {
            if (!p.final) { allFinal = false; break; }
          }
          if (allFinal && (this.nextEvtTime - Date.now()) > 1000) {
            this.nextEvtTime = Date.now() + 1000;
            this.sendStateUpdate();
            return;
          }

          if (this.teamDuel || this.teamGame) {
            // Team modes (2v2 duels AND cumulative team parties): only drop to
            // 20s once a FULL team (all its connected members) has locked in.
            // Size-agnostic by construction. Without the teamGame arm, a fully
            // locked-in party team still waited out the whole round.
            const teamHasMembers = { a: false, b: false };
            const teamLocked = { a: true, b: true };
            for (const p of counted) {
              if (!p.team) continue;
              teamHasMembers[p.team] = true;
              if (!p.final) teamLocked[p.team] = false;
            }
            const aDone = teamHasMembers.a && teamLocked.a;
            const bDone = teamHasMembers.b && teamLocked.b;
            const lockMs = DEFAULT_POST_GUESS_SECONDS * 1000;
            if ((aDone || bDone) && (this.nextEvtTime - Date.now()) > lockMs) {
              this.nextEvtTime = Date.now() + lockMs;
              this.sendStateUpdate();
              // Nudge the players who haven't locked in yet. Team-specific
              // copy: recipients are the entire OTHER team (a recipient is
              // !final, so the locked team is always the opposing one from
              // their perspective), often several players — never "the last
              // guesser". The solo branch below keeps that wording.
              for (const p of Object.values(this.players)) {
                if (p.final) continue;
                const pObj = players.get(p.id);
                if (pObj) pObj.send({
                  type: 'toast',
                  key: 'otherTeamLocked',
                  s: DEFAULT_POST_GUESS_SECONDS,
                  closeOnClick: true,
                  autoClose: 3000,
                  toastType: 'info'
                });
              }
            }
            return;
          }

          // Ranked 1v1 drops to 15s, matching GeoGuessr's pace. Casual and
          // other non-team multiplayer modes keep the existing 20s window.
          let remainingCount = 0;
          let finalPlayer = null;
          for (const p of Object.values(this.players)) {
            if (!p.final) {
              remainingCount++;
              finalPlayer = p;
              if(remainingCount > 1) {
                break;
              }
            }
          }

          // Roster must hold someone BESIDES the last unlocked player — the
          // count only tallies non-final seats, so after a leaver's seat is
          // deleted (removePlayer runs checkRemaining before the forfeit
          // resolution) a lone survivor passes vacuously and got rushed to
          // shortened timer + an "opponent guessed" toast about a player who
          // LEFT. The roster guard prevents that false signal.
          const postGuessSeconds = postGuessSecondsFor(this);
          const postGuessMs = postGuessSeconds * 1000;
          if(remainingCount === 1 && Object.keys(this.players).length > 1 && (this.nextEvtTime - Date.now()) > postGuessMs) {
            this.nextEvtTime = Date.now() + postGuessMs;
            this.sendStateUpdate();

            // send last player a toast. Ranked 1v1 gets its own copy: there
            // is exactly one other player, so name the moment for what it is
            // — the opponent locked in ("last guesser" reads like a crowd).
            // Unranked matches are public NON-duel FFA games (duel:false), so
            // they keep lastGuesser along with parties — the crowd wording is
            // literally correct there. Team duels never reach this branch
            // (the team arm above returns).
            const pObj = players.get(finalPlayer.id);
            pObj.send({
              type: 'toast',
              key: this.public && this.duel ? 'opponentLocked' : 'lastGuesser',
              s: postGuessSeconds,
              closeOnClick: true,
              autoClose: 3000,
              toastType: 'info'
            });
          }
  }
  async generateLocations(allLocations) {
    this.sendAllPlayers({
      type: 'generating',
      generated: this.locations.length,
    })

    if(this.location !== "all" && !countries.includes(this.location)) {
      // community map
      const slug = this.location;
      const map = await MapModel.findOne({ slug });
      if (!map) {
        return;
      }

      // find the exten
      const mappedLatLongs = map.data.map((l) => fromLonLat([l.lng, l.lat], 'EPSG:4326'));
      let extent = boundingExtent(mappedLatLongs);

      this.extent = extent;
      this.maxDist = map.maxDist;

      this.sendAllPlayers({
        type: 'maxDist',
        maxDist: this.maxDist
      });

      // get n random from the list
      let locs = map.data;
      if(locs.length < this.rounds) {
        // send error to all players
        this.sendAllPlayers({
          type: 'toast',
          key: 'notEnoughLocationsInMap'
        });
      }
      locs = shuffle(locs).slice(0, this.rounds).map((loc) => ({
        // lng -> long
        ...loc,
        long: loc.lng,
        lng: undefined
      }));
      while(locs.length < this.rounds) {
        locs.push(locs[Math.floor(Math.random() * locs.length)]);
      }

      this.locations = locs;

      this.sendAllPlayers({
        type: 'generating',
        generated: this.locations.length,
      })

      // todo: increase play count
      // recentPlays[map.slug] = (recentPlays[map.slug] || 0) + 1;

    } else {

      if(this.location === "all") {

    this.maxDist = 20000;
    this.extent = null;

    if (!this.duel) {
      // Public games: ensure at least 3 distinct continents
      const MIN_CONTINENTS = 3;
      const MAX_ATTEMPTS = 50;
      let bestPick = [];
      let bestContinentCount = 0;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = sampleDistinct(allLocations, this.rounds, this.seenIds);
        const continents = new Set(candidate.map(l => continentMapping[l.country]).filter(Boolean));
        if (continents.size >= MIN_CONTINENTS) {
          bestPick = candidate;
          break;
        }
        if (continents.size > bestContinentCount) {
          bestContinentCount = continents.size;
          bestPick = candidate;
        }
      }

      for (const loc of bestPick) {
        this.locations.push(loc);
        this.sendAllPlayers({
          type: 'generating',
          generated: this.locations.length,
        })
      }
    } else {
      // Duels: random sample, no repeats within a game and none from either
      // player's recent matches
      for (const loc of sampleDistinct(allLocations, this.rounds, this.seenIds)) {
        this.locations.push(loc);
        this.sendAllPlayers({
          type: 'generating',
          generated: this.locations.length,
        })
      }
    }
  } else {

    try {
    let loc;
      this.maxDist = countryMaxDists[this.location] || 20000;
      this.extent = officialCountryMaps.find((c) => c.countryCode === this.location)?.extent || null;
      let data = await fetch('http://localhost:3001/countryLocations/'+this.location, {
        headers: {
          'Content-Type': 'application/json'
        },
      });
     data = await data.json();
     for(let i = 0; i < this.rounds; i++) {
      if(data.ready && data.locations) {
        loc = data.locations[Math.floor(Math.random() * data.locations.length)];
        data.locations = data.locations.filter((l) => l !== loc);
      } else {
  loc = await findLatLongRandom({ location: this.location }, getRandomPointInCountry, lookup);

      }

      this.locations.push(loc);
      this.sendAllPlayers({
        type: 'generating',
        generated: this.locations.length,
      })
    }
    } catch (e) {
      console.error('Error getting country locations', e);
    }

  }

    this.sendAllPlayers({
      type: 'maxDist',
      maxDist: this.maxDist
    });
  }
  }
  // Send a message to every player on a given team, optionally excluding one id.
  sendTeam(team, json, excludeId) {
    for (const [playerId, p] of Object.entries(this.players)) {
      if (p.team !== team) continue;
      if (excludeId && playerId === excludeId) continue;
      const sock = players.get(playerId);
      if (!sock) continue;
      try {
        sock.send(json);
      } catch (e) {
        console.error('sendTeam: send failed for', playerId, e?.message);
      }
    }
  }

  sendAllPlayers(json) {
    for (const playerId of Object.keys(this.players)) {
      const p = players.get(playerId);
      if (!p) {
        // Player was cleaned out of the global map (e.g. 30s disconnect purge
        // in ws.js) but never removed from this.players. Drop the stale entry
        // so we stop iterating it on every tick.
        delete this.players[playerId];
        continue;
      }
      try {
        p.send(json);
      } catch (e) {
        console.error('sendAllPlayers: send failed for', playerId, e?.message);
      }
    }
  }
  // Premature ends (mid-round forfeits) deliberately DROP the in-flight
  // round instead of flushing it into roundHistory. givePoints only ever
  // runs on the main loop's natural round resolution (ws.js pairs it with
  // saveRoundToHistory before any transition), so a flushed partial round
  // recorded points that never reached teamScores/player.score — totals
  // short one round on every forfeited game, 1v1 duels included — and a
  // forfeit during a mid-match getready flushed a PHANTOM round N+1 scored
  // from round N's stale guesses (clearGuesses only runs at guess-start)
  // against round N+1's location. Natural ends never needed the flush.
  async end(leftUser, { forfeitedTeam = null, decided = false } = {}) {
    console.log(`Ending game ${this.id} - duel: ${this.duel}, public: ${this.public}, players: ${Object.keys(this.players).length}`);

    this.state = 'end';
    this.endTime = Date.now();
    this.nextEvtTime = this.endTime + 7200000; // 2 hours (2 * 60 * 60 * 1000)

    if (this.teamDuel) {
      this.finishTeamDuel(forfeitedTeam);
    } else if (this.duel) {
      await this.finishSoloDuel(leftUser, decided);
    } else if (this.teamGame) {
      this.finishTeamParty(forfeitedTeam);
    } else {
      this.finishCasual();
    }

    this.sendStateUpdate(true); // Send complete state including roundHistory
  }

  // Intra-party team-mode finisher: winner by cumulative team totals (tie =
  // draw), no ELO, no XP. Reuses the duelEnd wire shape with teamGame:true —
  // never team2v2, which would trigger the HP/hearts UI on clients.
  finishTeamParty(forfeitedTeam = null) {
    if (this.calculationDone) return;
    this.calculationDone = true;

    const a = this.teamScores?.a ?? 0;
    const b = this.teamScores?.b ?? 0;
    let winningTeam = null;
    let draw = false;
    if (forfeitedTeam) {
      // Forfeit is never a draw: the fully-quit team loses regardless of
      // points (same rule as finishTeamDuel).
      winningTeam = forfeitedTeam === 'a' ? 'b' : 'a';
    } else if (a > b) winningTeam = 'a';
    else if (b > a) winningTeam = 'b';
    else draw = true;

    // Roster snapshot frozen at end time: post-end leavers shrink the live
    // players array on clients, which would corrupt team groupings on the
    // results screen. Also replayed verbatim to end-state rejoiners.
    // getFinalRoster (NOT the live players map): a mid-game leaver's rounds
    // are already inside the cumulative team totals, so they must appear on
    // the results roster too — same rule the 2v2 duel finisher follows.
    const rosterSnapshot = this.getFinalRoster().map((p) => ({
      id: p.id,
      username: p.username,
      countryCode: p.countryCode || null,
      nameGlow: p.nameGlow ?? null,
      markerSkin: p.markerSkin ?? null,
      team: p.team || null,
      score: p.score || 0
    }));
    this.lastTeamEnd = { winningTeam, draw, teamScores: { a, b }, players: rosterSnapshot };

    for (const player of Object.values(this.players)) {
      const sock = players.get(player.id);
      if (!sock) continue;
      try {
        sock.send({
          type: 'duelEnd',
          teamGame: true,
          teamScoring: this.teamScoring,
          winningTeam,
          draw,
          teamScores: { a, b },
          players: rosterSnapshot,
          winner: !draw && player.team === winningTeam,
          timeElapsed: this.endTime - this.startTime
        });
      } catch (e) {}
    }

    if (!Object.keys(this.players).length) return;
    this.saveInProgress = true;
    this.saveUnrankedMultiplayerToMongoDB().then(() => {
      this.saveInProgress = false;
    }).catch(error => {
      console.error('Error saving team party game to MongoDB:', error);
      this.saveInProgress = false;
    });
  }

  // Casual (public unranked lobby + private party) finisher: fire-and-forget save.
  finishCasual() {
    if (!Object.keys(this.players).length) return;
    this.saveInProgress = true; // Mark save as in progress
    this.saveUnrankedMultiplayerToMongoDB().then(() => {
      this.saveInProgress = false; // Mark save as complete
    }).catch(error => {
      console.error('❌ Error saving multiplayer game to MongoDB:', error);
      this.saveInProgress = false; // Mark save as complete even on error
    });
  }

  // Union of the persistent snapshot and current players, keyed by id,
  // preferring live data. The stable end-of-game roster: mid-game leavers are
  // included, and post-game leavers can't shrink it (unlike the live
  // this.players the client mirrors, which empties as players hit Play Again).
  getFinalRoster() {
    const byId = {};
    for (const [id, data] of Object.entries(this.persistentPlayerData)) {
      // score: removePlayer keeps the snapshot's score current at leave-time,
      // so cumulative-team results/persistence see a leaver's real total.
      byId[id] = {
        id,
        username: data.username,
        countryCode: data.countryCode,
        accountId: data.accountId,
        nameGlow: data.nameGlow ?? null,
        markerSkin: data.markerSkin ?? null,
        team: data.team,
        score: data.score ?? 0,
      };
    }
    for (const player of Object.values(this.players)) {
      byId[player.id] = player;
    }
    return Object.values(byId);
  }

  // Team-duel finisher: no ELO. A fully-quit team always loses (forfeit is
  // never a draw); otherwise the winner is decided by shared team health.
  finishTeamDuel(forfeitedTeam) {
    if (this.calculationDone) return;
    this.calculationDone = true;

    const a = this.teamScores?.a ?? 0;
    const b = this.teamScores?.b ?? 0;
    let winningTeam = null;
    let draw = false;
    if (forfeitedTeam) winningTeam = Game.otherTeam(forfeitedTeam);
    else if (a > b) winningTeam = 'a';
    else if (b > a) winningTeam = 'b';
    else draw = true;

    // Stable roster snapshot for the end screen: the client's live players
    // array shrinks as others leave the finished game, which flipped teammate
    // pins/groupings to "enemy" on the round-over screen. accountId rides
    // along (null for bots/guests): the end-screen report picker needs it to
    // tell reportable players from fake-success targets.
    const rosterSnapshot = this.getFinalRoster().map(p => ({
      id: p.id, username: p.username, countryCode: p.countryCode || null, team: p.team || null,
      accountId: p.accountId ?? null,
      nameGlow: p.nameGlow ?? null,
      markerSkin: p.markerSkin ?? null
    }));

    // Frozen end payload (mirrors finishTeamParty's lastTeamEnd): replayed to
    // end-state rejoiners by rejoinGame so a connection blip in the final
    // seconds can't eat the results screen. historyGameId = the saved doc's
    // id, for report submission (matchmade games have code=null).
    this.lastTeamEnd = {
      team2v2: true,
      winningTeam,
      teamScores: this.teamScores,
      players: rosterSnapshot,
      draw,
      timeElapsed: this.endTime - this.startTime,
      historyGameId: `2v2_${this.id}`
    };
    // Post-game Play Again consensus (see livingTeamPlayAgain).
    this.playAgainAcks = { a: {}, b: {} };

    // Notify each player using the duelEnd shape (no elo fields → the
    // round-over ELO animation stays hidden by its typeof-number guards).
    // autoPaired/teamHostId drive the results screen's Back/Play Again roles:
    // auto-paired members are symmetric; chosen duos gate Back to the host.
    for (const player of Object.values(this.players)) {
      const sock = players.get(player.id);
      if (!sock) continue;
      try {
        sock.send({
          type: 'duelEnd',
          ...this.lastTeamEnd,
          autoPaired: !!this.autoPairedTeams?.[player.team],
          teamHostId: this.teamHostIds?.[player.team] || null,
          ...(this.stampsExpected ? { stampsPending: true } : {}),
          winner: !draw && player.team === winningTeam
        });
      } catch (e) {}
    }
    // Seed each team's Play Again counter (0/N) so the buttons render with
    // live numbers immediately.
    this.sendPlayAgainState('a');
    this.sendPlayAgainState('b');

    // Persist the game + light W/L stats (off the hot path). Participants come
    // from the persistent snapshot too, so mid-game leavers are recorded.
    if (Object.keys(this.players).length || Object.keys(this.persistentPlayerData).length) {
      this.saveInProgress = true;
      this.saveTeamDuelToMongoDB(winningTeam, draw)
        .then(() => { this.saveInProgress = false; })
        .catch(error => {
          console.error('Error saving team duel game to MongoDB:', error);
          this.saveInProgress = false;
        });
    }
  }

  // ── Post-game Play Again (team duels) ────────────────────────────────────
  // Requeueing from the results screen needs consensus: every LIVING teammate
  // must ack before the duo re-queues together. Acks live on the ended game
  // (playAgainAcks, set in finishTeamDuel); any teammate departure resets the
  // team's acks and re-broadcasts, so the survivor's button downgrades to a
  // fresh solo 1-click Play Again instead of silently firing a stale consent.

  livingTeamPlayAgain(team) {
    // Auto-paired (matchmade) teams dissolve on any disconnect: a vanished
    // random teammate must not hold the survivor's Play Again hostage for
    // the 30s purge — count only connected members so the button downgrades
    // to a 1-click solo requeue instantly. Chosen (join-code) duos keep the
    // reconnect grace: a briefly-dropped friend stays counted until the
    // purge trims the roster at 30s, so a wifi blip doesn't split the duo.
    const autoPaired = !!this.autoPairedTeams?.[team];
    const living = this.teamMembers(team)
      .filter((p) => {
        if (!autoPaired) return true;
        const sock = players.get(p.id);
        return sock && !sock.disconnected;
      })
      .map((p) => p.id);
    const ackedIds = living.filter((id) => this.playAgainAcks?.[team]?.[id]);
    return { needed: living.length, ackedIds };
  }

  sendPlayAgainState(team) {
    if (!team || !this.teamDuel || this.state !== 'end') return;
    const { needed, ackedIds } = this.livingTeamPlayAgain(team);
    if (needed === 0) return;
    this.sendTeam(team, { type: 'playAgain2v2', needed, ackedIds });
  }

  // Move a team (or one member) off the ended results screen into a fresh 2v2
  // staging lobby. queue=false → Back (sit in the lobby, no matchmaking);
  // queue=true → Play Again: returns the lobby so the caller can queue it
  // synchronously (duo → stage-2 opponents search, solo → stage-1 teammate
  // search) — autoQueue2v2At stays stamped as a poll-tick fallback AND as the
  // autoQueueInMs=0 wire signal the client uses to skip rendering the lobby.
  regroupTeamFromResults(team, { onlyPlayerId = null, queue = false } = {}) {
    const live = [];
    for (const member of this.teamMembers(team)) {
      if (onlyPlayerId && member.id !== onlyPlayerId) continue;
      const sock = players.get(member.id);
      if (!sock || sock.disconnected) continue;
      live.push(sock);
    }
    if (!live.length) return;

    // Quiet-remove from the ended game first (no gameShutdown). removePlayer's
    // end-state hook re-broadcasts the remaining teammate's Play Again state.
    for (const sock of live) this.removePlayer(sock, true);

    const lobby = new Game(uuidv4(), { is2v2Lobby: true });
    games.set(lobby.id, lobby);
    // A regrouped matchmade pairing keeps matchmade cancel semantics; a
    // chosen duo stays a chosen duo (mirrors cancelTeamDuelPregame).
    lobby.autoPaired = live.length >= 2 && !!this.autoPairedTeams?.[team];
    if (queue) {
      lobby.autoQueue2v2At = Date.now(); // poll fallback if the caller can't queue synchronously
      // Duo requeue → the client skips rendering this lobby entirely (queue
      // screen is next in the same burst). Explicit flag because the duo's
      // first-added member gets their init snapshot while players.length is
      // still 1 — a client-side roster heuristic can't tell them from a solo.
      lobby.queueBoundDuo = live.length >= 2;
    }
    // Crown the chosen-duo host when present, else the first member.
    const hostId = this.teamHostIds?.[team];
    live.sort((x, y) => (y.id === hostId) - (x.id === hostId));
    lobby.addPlayer(live[0], true);
    if (live[1]) lobby.addPlayer(live[1]);
    return lobby;
  }

  // Does a finished game of THIS shape expect to pay stamps? Rides duelEnd as
  // `stampsPending` so the end screen can RESERVE the receipt row's height
  // instead of having it appear under the player's thumb half a second later
  // and shove Play Again down (same layout-stability rule as the profile
  // graph's reserved min-height).
  //
  // It is an EXPECTATION, not a promise, and the difference is the whole reason
  // it is computed here rather than assumed by the client: with the economy
  // killed, or a bot duel, or a guest opponent, the flag is simply absent and
  // the screen reserves nothing. The only way to reserve a row that never fills
  // is a save replayed for an already-paid gameId, where every grant collapses
  // onto its idempotency key.
  get stampsExpected() {
    if (!STAMPS_ENABLED) return false;
    // Matchmade 2v2 pays; cumulative team parties are saved through the
    // unranked path, which passes no stampContext at all.
    if (this.teamDuel) return !!this.public;
    if (!this.duel) return false;
    // A bot duel is NOT excluded here even though it is unrated: it still pays
    // the capped bot trickle, and a payout the player can see in their balance
    // but not on the end screen is the exact confusion this whole row exists to
    // remove. Its own edge (the 30/day cap refusing to pay, leaving the row
    // reserved and empty) costs a gap for someone grinding their 31st bot game
    // of the day, which is a better trade than every other player's buttons
    // jumping.
    return this.isBotGame ? !!this.accountIds?.p1 : !!this.accountIds?.p2;
  }

  // Ranked/unranked 1v1 duel finisher: forfeit resolution, ELO application,
  // per-player duelEnd sends, and the conditional ranked save. Awaited by
  // end() so the trailing full-state update fires after the DB reads.
  async finishSoloDuel(leftUser, decided = false) {
    if (this.calculationDone) return;
      // find the winner
      // winner is the one with most points
      // or if only 1 player, they win
      this.calculationDone = true;

      let winner = null;
      let draw = false;


      // Resolve through the persistent snapshot so a leaver (already removed
      // from this.players) still resolves by their real final score below.
      const p1 = this.getPlayerData(Object.values(this.players).find((p) => p.tag === 'p1'), 'p1');
      const p2 = this.getPlayerData(Object.values(this.players).find((p) => p.tag === 'p2'), 'p2');

      const p1obj = players.get(this.pIds.p1);
      const p2obj = players.get(this.pIds.p2);

      // Handle forfeit (someone left the game) — unless the match was already
      // decided when they left (0 HP / all rounds played): then the leave only
      // skipped the results wait and the scores below resolve the outcome.
      // For ranked duels, use tracked disconnection to ensure forfeiter always loses
      if(!decided && this.public && this.disconnectedPlayer === "p1") {
        winner = p2;
      } else if(!decided && this.public && this.disconnectedPlayer === "p2") {
        winner = p1;
      }
      // Fallback to leftUser parameter for regular duels
      else if(!decided && leftUser === "p1") {
        winner = p2;
      } else if(!decided && leftUser === "p2") {
        winner = p1;
      }
      // Only check scores if no one forfeited
      else if(p1 && p2 && p1.score > p2.score) {
        winner = p1;
      } else if(p1 && p2 && p2.score > p1.score) {
        winner = p2;
      } else if(p1 && p2 && p1.score === p2.score) {
        draw = true;
      }
      // A side with no live entry AND no snapshot (private-duel leaver): the
      // remaining player wins — same outcome the forfeit path gave them.
      else if(p1 && !p2) {
        winner = p1;
      } else if(p2 && !p1) {
        winner = p2;
      }



      const p1EloResult = await User.findById(this.accountIds.p1).select('elo').lean();
      const p2EloResult = await User.findById(this.accountIds.p2).select('elo').lean();

      // Use DB value if available, otherwise fall back to stored oldElos from game creation
      // This prevents null ELO bugs while still handling external ELO updates
      let p1OldElo = p1EloResult?.elo ?? this.oldElos?.p1 ?? null;
      let p2OldElo = p2EloResult?.elo ?? this.oldElos?.p2 ?? null;

      let p1NewElo = p1OldElo;
      let p2NewElo = p2OldElo;

      // True only when a placement seed WRITE actually landed. The duelEnd
      // payload's placement fields key on this — an abandoned/drawn/failed
      // placement must not show the "Placement match" seed reveal, because
      // no seed exists and the account re-gates into another placement.
      let placementSeeded = false;

      // Only a RESOLVED game books anything. With neither a winner nor a draw
      // (both sides gone, no snapshot to resolve from) there is nothing to pay
      // out and nothing to charge — and no counters either, since booking a
      // "loss" for both players is not a thing that happened.
      const resolved = draw || !!winner;

      // ── RATING APPLY ────────────────────────────────────────────────────
      // Four mutually exclusive worlds, and the ORDER is load-bearing:
      //   1. placement       — a placement match IS a bot game, so it must be
      //                        tested before the bot branch swallows it.
      //   2. unrated bot     — under v2 a bot can never move the ladder.
      //   3. v2 transfer     — the precomputed zero-sum apply.
      //   4. legacy v1       — untouched, and unreachable while RATING_V2 is on
      //                        for a game that was wired with ratingV2.
      if (RATING_V2 && this.isPlacement) {
        // ---- PLACEMENT ---------------------------------------------------
        // The human is p1 by construction, and wins by construction: the
        // placement bot scores 0 every round, so the only way p1 does not win
        // is by abandoning or disconnecting.
        const p1Id = this.pIds?.p1;
        // Mean over the rounds this player ACTUALLY PLAYED. The HP race can
        // end a duel at round 2, so roundHistory.length is not 5 and dividing
        // by this.rounds would seed a fast, perfect winner as if they had
        // scored 0 on the rounds that never happened.
        const played = this.roundHistory.filter((r) => r.players?.[p1Id]);
        const avgRoundPoints = played.length
          ? played.reduce((sum, r) => sum + (r.players[p1Id].points || 0), 0) / played.length
          : 0;

        if (winner?.tag === 'p1' && this.accountIds?.p1) {
          const seed = placementSeed(avgRoundPoints);
          // applyPlacementSeed is gated on ratedGames:0 server-side and only
          // reports true when the write actually landed — mirror the rating
          // into the end payload only then.
          const seeded = await applyPlacementSeed(this.accountIds.p1, seed, p1obj);
          if (seeded) {
            p1NewElo = clampRating(seed);
            placementSeeded = true;
          }
        }
        // A loss, draw, abandon or disconnect grants NOTHING: the rating stays
        // at entry and ratedGames stays 0, so the next queue join re-gates this
        // account into ANOTHER placement match. That is precisely why quitting
        // cannot be used to reroll a bad seed — bailing out does not discard a
        // seed, it just declines to earn one, and the seed is a pure function
        // of the round points of the run that WINS.
        //
        // Counters still book: a placement win is a real game in duels_wins.
        // rated:false keeps ratedGames at 0 (the K schedule starts at game 2),
        // and going through the counter path directly instead of setElo is
        // deliberate — setElo also writes elo, and that second, UNGATED write
        // would defeat applyPlacementSeed's ratedGames:0 filter.
        if (resolved) {
          await this.applyUnratedCounters(this.accountIds?.p1, { winner: winner?.tag === 'p1', draw });
        }
      } else if (RATING_V2 && this.isBotGame) {
        // ---- BOT GAME (v2) -----------------------------------------------
        // Bot duels are UNRATED: no rating moves, in either direction, for
        // either side. Skipping the apply entirely is the point — a bot that
        // could give rating is a bot that will be farmed. Counters still book
        // the game so profile/history surfaces don't lose it, at rated:false.
        if (resolved) {
          await this.applyUnratedCounters(this.accountIds?.p1, { winner: winner?.tag === 'p1', draw });
        }
      } else if (RATING_V2 && this.ratingV2 && resolved && p1OldElo && p2OldElo) {
        // ---- v2 ZERO-SUM TRANSFER ----------------------------------------
        // The transfers were precomputed at match creation (ws.js) against the
        // match-start ratings; only the APPLY happens here, against the fresh
        // DB read above.

        // WAIT FOR THE ANTI-FARM DECAY READ BEFORE READING THE TRANSFERS.
        //
        // ws.js stamps the game synchronously at decay 1 and re-stamps once the
        // two PairWins reads land, on the argument that "the shortest possible
        // duel is still tens of seconds". That holds for a duel that is PLAYED
        // and fails for one that is RESOLVED: an instant forfeit or a pregame
        // disconnect finishes in well under a second and would read the decay-1
        // stamp — handing full rating on exactly the games a farming pair would
        // use.
        //
        // Bounded, because a result must never hang on the database. If the
        // read has not landed in time the decay-1 stamp stands, which is the
        // same fail-open direction ws.js already documents: a DB blip must not
        // quietly delete a player's rating.
        if (this.ratingV2Ready) {
          try {
            await Promise.race([
              this.ratingV2Ready,
              new Promise((resolve) => setTimeout(resolve, RATING_DECAY_WAIT_MS)),
            ]);
          } catch (e) {
            // ws.js already logs and swallows the read failure; this only
            // guards against the handle itself being a rejected promise.
          }
        }

        const transfers = this.ratingV2.transfers || {};
        // Outcome → the transfer for it, normalised to P1's PERSPECTIVE:
        // positive moves rating to p1, negative moves it away. The draw entry
        // carries its own sign (a draw between mismatched ratings moves the
        // ladder); win entries are keyed by ws player id (same convention as
        // the legacy eloChanges map) and are re-signed from the winner's tag,
        // so a producer that stored plain magnitudes cannot invert the ladder.
        const winnerKey = winner ? (winner.tag === 'p1' ? this.pIds?.p1 : this.pIds?.p2) : null;
        const rawTransfer = Number(draw ? transfers.draw : (winnerKey != null ? transfers[winnerKey] : 0)) || 0;
        const signed = draw
          ? rawTransfer
          : (winner?.tag === 'p1' ? Math.abs(rawTransfer) : -Math.abs(rawTransfer));

        // ONE applied magnitude for BOTH sides. This is the whole fix: the v1
        // path below re-clamps each side independently, so when the loser
        // would breach the floor their loss gets truncated while the winner
        // still banks the full gain — the ladder mints rating out of nothing.
        // Cap the magnitude by what the loser can actually pay, THEN mirror it.
        const loserFresh = signed > 0 ? p2OldElo : p1OldElo;
        const applied = Math.min(Math.abs(signed), Math.max(0, loserFresh - RATING_FLOOR));
        const dP1 = Math.sign(signed) * applied;
        p1NewElo = clampRating(p1OldElo + dP1);
        p2NewElo = clampRating(p2OldElo - dP1);

        // rated:true — this is a real human ranked game: it books ratedGames
        // (K schedule) and lastRankedAt (leaderboard inactivity).
        const p1Data = { winner: winner?.tag === 'p1', draw, oldElo: p1OldElo, rated: true };
        const p2Data = { winner: winner?.tag === 'p2', draw, oldElo: p2OldElo, rated: true };
        if (p1obj) p1obj.setElo(p1NewElo, p1Data);
        else setElo(this.accountIds.p1, p1NewElo, p1Data);
        if (p2obj) p2obj.setElo(p2NewElo, p2Data);
        else setElo(this.accountIds.p2, p2NewElo, p2Data);
      }
      // elo changes
      else if(this.eloChanges && p1OldElo && p2OldElo) {
        if(draw) {

          const changes = this.eloChanges.draw;
          // { newRating1, newRating2 }

          // Deltas were computed against match-start elo but apply to the
          // fresh DB read above — re-clamp so the result can never hit the
          // MIN_ELO floor's void (0 is falsy and breaks the gates below).
          p1NewElo = Math.max(MIN_ELO, p1NewElo + changes.newRating1);
          p2NewElo = Math.max(MIN_ELO, p2NewElo + changes.newRating2);

          if(p1obj) {

          p1obj.setElo(p1NewElo, { draw: true, oldElo: p1OldElo });
          } else {
            setElo(this.accountIds.p1, p1NewElo, { draw: true, oldElo: p1OldElo });
          }

          if(p2obj) {
          p2obj.setElo(p2NewElo, { draw: true, oldElo: p2OldElo });
        } else {
          setElo(this.accountIds.p2, p2NewElo, { draw: true, oldElo: p2OldElo });
        }
        } else if(winner) {

          const changes = this.eloChanges[winner.id];
          // { newRating1, newRating2 }
          p1NewElo = Math.max(MIN_ELO, p1NewElo + changes.newRating1);
          p2NewElo = Math.max(MIN_ELO, p2NewElo + changes.newRating2);

          if(p1obj) {
          p1obj.setElo(p1NewElo, { winner: winner.tag === 'p1', oldElo: p1OldElo });
          } else {
            setElo(this.accountIds.p1, p1NewElo, { winner: winner.tag === 'p1', oldElo: p1OldElo });
          }

          if(p2obj) {
          p2obj.setElo(p2NewElo, { winner: winner.tag === 'p2', oldElo: p2OldElo });
          } else {
            setElo(this.accountIds.p2, p2NewElo, { winner: winner.tag === 'p2', oldElo: p2OldElo });
          }

        }

    }

      // Report plumbing on the end screen: the saved history doc's id (the
      // roster only knows the live ws id / private code, and matchmade games
      // have code=null) plus the opponent's account identity (null accountId
      // = bot/guest → the client fakes the report instead of sending one).
      const historyGameId = `duel_${this.id}`;
      const rosterSnapshot = this.getFinalRoster().map((p) => ({
        id: p.id,
        username: p.username,
        countryCode: p.countryCode || null,
        accountId: p.accountId ?? null,
        nameGlow: p.nameGlow ?? null,
        markerSkin: p.markerSkin ?? null,
      }));

      if(p1obj && leftUser !== 'p1') {
        try {
      p1obj.send({
        type: 'duelEnd',
        winner:  winner?.tag === 'p1',
        draw,
        newElo: p1NewElo,
        timeElapsed: this.endTime - this.startTime,
        oldElo: p1OldElo,
        // Placement flag drives the client's seed reveal. Additive: an old
        // client ignores it and renders oldElo→newElo as a normal elo change,
        // which is exactly what a seed is from its point of view. Only p1 can
        // ever be in a placement (p2 is the placement bot).
        //
        // `league` rides along because a placement shows the TIER instead of a
        // signed delta (a seed is not won off an opponent, so there is nothing
        // to sign). Sending it keeps the label on the server's tier table, so a
        // seasonal re-anchor does not need a web deploy or a store release to
        // stop mislabelling the most memorable screen a new player sees.
        //
        // Gated on the seed WRITE landing, not on isPlacement alone: an
        // abandon/disconnect/draw grants no seed and re-gates the account into
        // another placement — showing the seed reveal there would tell the
        // player they placed when they didn't.
        ...(RATING_V2 && this.isPlacement && placementSeeded
          ? { placement: true, league: getLeague(p1NewElo) }
          : {}),
        ...(this.stampsExpected ? { stampsPending: true } : {}),
        historyGameId,
        players: rosterSnapshot,
        opponent: { accountId: this.accountIds.p2 ?? null, username: p2?.username ?? null }
      });
        } catch(e){}
    }

    if(p2obj && leftUser !== 'p2') {
      try {
      p2obj.send({
        type: 'duelEnd',
        winner: winner?.tag === 'p2',
        draw,
        newElo: p2NewElo,
        timeElapsed: this.endTime - this.startTime,
        oldElo: p2OldElo,
        ...(this.stampsExpected ? { stampsPending: true } : {}),
        historyGameId,
        players: rosterSnapshot,
        opponent: { accountId: this.accountIds.p1 ?? null, username: p1?.username ?? null }
      });
      } catch(e) {
      }
    }

    // Save duel game to MongoDB for history tracking. Bot games save too
    // (accountIds.p2 is null by construction there): the human's history
    // shows the match, saveDuelToMongoDB synthesizes the bot side from
    // roster data, and every per-account write path skips the null id.
    if(this.duel && this.accountIds?.p1 && (this.accountIds?.p2 || this.isBotGame) && p1OldElo && p2OldElo) {
      this.saveInProgress = true;
      // Ranked duels award double XP (2v2 and casual modes stay at 1x).
      const p1Xp = this.calculatePlayerXp(this.pIds?.p1) * 2;
      const p2Xp = this.calculatePlayerXp(this.pIds?.p2) * 2;

      console.log(`Player 1 XP: ${p1Xp}, Player 2 XP: ${p2Xp}`);

      // Run sequentially: save first (updates User.totalXp), then record stats (reads updated value)
      this.saveDuelToMongoDB(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo, p1Xp, p2Xp)
        .then(() => this.createDuelUserStats(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo))
        .then(() => { this.saveInProgress = false; })
        .catch(error => {
          console.error('Error saving duel game to MongoDB:', error);
          this.saveInProgress = false;
        });
    }
  }

  // Book a finished duel's W/L/T counters WITHOUT touching the rating — the
  // two UNRATED v2 paths (placements and bot games) both need the game to
  // exist in a player's record without it existing on the ladder.
  //
  // Deliberately NOT setElo: setElo always writes elo, and on a placement that
  // second write is UNGATED, so it would defeat the ratedGames:0 filter inside
  // applyPlacementSeed and stamp a rating the filter had just refused.
  // rated:false keeps ratedGames at 0, which is what holds both the K schedule
  // and the placement re-gate honest, and it also leaves lastRankedAt alone so
  // farming bots can't hold a leaderboard slot open.
  async applyUnratedCounters(accountId, { winner = false, draw = false } = {}) {
    if (!accountId) return;
    try {
      await User.updateOne(
        { _id: accountId },
        { $inc: duelCounterIncs({ winner, draw, rated: false }) }
      );
    } catch (error) {
      console.error('applyUnratedCounters failed for', accountId, error?.message || error);
    }
  }

  shutdown() {
    for(const playerId of Object.keys(this.players)) {
      const p = players.get(playerId);
      if(p) {
        try {
      p.send({
        type: 'gameShutdown'
      });
      this.removePlayer(p);
    } catch(e) {
    }
    }
    }
  }

  // Helper function to get player data (current or persistent for public duels)
  getPlayerData(player, tag) {
    if (player) {
      return player; // Player is still connected
    }

    // Only use persistent data for public duels
    if (this.duel && this.public) {
      // Find persistent data for disconnected player by tag
      for (const [playerId, persistentData] of Object.entries(this.persistentPlayerData)) {
        if (persistentData.tag === tag) {
          return {
            id: playerId,
            score: persistentData.initialScore, // Use initial score if no current score
            ...persistentData
          };
        }
      }
    }

    return null;
  }

  // ---- Unified Mongo persistence ------------------------------------------
  // Every mode saves the same document skeleton; only the participants,
  // summaries, result and post-save user updates differ. The former per-mode
  // savers hardcoded 60000/60 strides for duels — duels always have
  // timePerRound === 60000, so the timePerRound-derived versions below emit
  // identical values.

  // participants: [{ id, username, countryCode, accountId }] — round docs are
  // built from roundHistory (only rounds that were actually played).
  buildRoundDocs(participants) {
    return this.roundHistory.map((roundData, index) => ({
      roundNumber: index + 1,
      ...(roundData.teamRoundScores ? { teamRoundScores: roundData.teamRoundScores } : {}),
      // 2v2: applied damage + multiplier (see saveRoundToHistory) persist so
      // history replays render the same hearts the live game showed.
      ...(typeof roundData.teamDamage === 'number'
        ? { teamDamage: roundData.teamDamage, teamDamageMultiplier: roundData.teamDamageMultiplier }
        : {}),
      location: {
        lat: roundData.location.lat,
        long: roundData.location.long,
        panoId: roundData.location.panoId || null,
        country: roundData.location.country || null,
        place: roundData.location.place || null
      },
      // Includes null lat/long entries for participants who didn't guess.
      playerGuesses: participants.map((p) => ({
        playerId: p.id,
        username: p.username || 'Player',
        countryCode: p.countryCode || null,
        accountId: p.accountId || null,
        guessLat: roundData.players[p.id]?.lat || null,
        guessLong: roundData.players[p.id]?.long || null,
        points: roundData.players[p.id]?.points || 0,
        timeTaken: roundData.players[p.id]?.timeTaken || this.timePerRound / 1000,
        xpEarned: 0, // XP is aggregated on the player summary, never per round
        guessedAt: new Date(this.startTime + (index * this.timePerRound)),
        usedHint: false
      })),
      startedAt: new Date(this.startTime + (index * this.timePerRound)),
      endedAt: new Date(this.startTime + ((index + 1) * this.timePerRound))
    }));
  }

  buildSettingsDoc(official) {
    return {
      location: this.location || 'all',
      rounds: this.roundHistory.length, // actual completed rounds, not original setting
      maxDist: this.maxDist || 20000,
      timePerRound: this.timePerRound || (this.duel ? 60000 : 30000),
      official,
      showRoadName: this.showRoadName || false,
      noMove: this.nm || false,
      noPan: this.npz || false,
      noZoom: this.npz || false,
      teamGame: !!this.teamGame,
      teamScoring: this.teamGame ? this.teamScoring : null
    };
  }

  // stampContext is OPTIONAL and defaults to null, which means ZERO grants.
  // Absence is the safe state: casual, party and unranked games pass nothing
  // and therefore cannot pay out even by accident (see saveUnrankedMultiplayerToMongoDB).
  async persistGame({ gameId, gameType, official, participants, playerSummaries, result, multiplayer, userIncs = [], statsRecords = [] }, stampContext = null) {
    const gameDoc = new GameModel({
      gameId,
      gameType,
      settings: this.buildSettingsDoc(official),
      startedAt: new Date(this.startTime),
      endedAt: new Date(this.endTime),
      totalDuration: Math.floor((this.endTime - this.startTime) / 1000),
      rounds: this.buildRoundDocs(participants),
      players: playerSummaries,
      result,
      multiplayer,
      // Stamped here rather than at the one ranked-duel call site so it can
      // never be forgotten by a future save path. `!!` because isPlacement is
      // only ever SET on a placement (ws.js leaves it undefined otherwise) and
      // the schema wants a real boolean. See models/Game.js for why the saved
      // row has to carry this at all.
      placement: !!this.isPlacement
    });
    await gameDoc.save();

    // User counters first, stats snapshots second — recordGameStats reads the
    // freshly-incremented totalXp.
    await Promise.all(userIncs.map(({ accountId, inc }) =>
      User.updateOne({ _id: accountId }, { $inc: inc })
    ));

    // Stamps earn hook. Sits INSIDE persistGame and is awaited on purpose: the
    // callers wrap this whole method in the saveInProgress window that the ws
    // shutdown path waits on, so a fire-and-forget grant could be killed by a
    // deploy mid-payout. Its OWN try/catch with its OWN log tag is equally
    // deliberate — the currency economy may never be able to take game
    // persistence down with it.
    try {
      // The RECEIPT is what the end screen renders. It is derived from what the
      // ledger actually applied, never from the payout table: a duplicate grant
      // (replayed save, cron sweep) reports 0 because grantStamps reports 0, so
      // the number on screen can never claim currency the player did not get.
      await this.sendStampEarnings(await this.grantGameStamps(stampContext), gameId);
    } catch (error) {
      console.error(`[stamps] earn hook failed (${stampContext?.mode || 'none'}, ${gameId}):`, error?.message || error);
    }

    await Promise.all(statsRecords.map(({ accountId, payload }) =>
      UserStatsService.recordGameStats(accountId, gameId, payload)
    ));
    return gameDoc;
  }

  // ---- Stamps: the game-finish earns --------------------------------------
  // stampContext = {
  //   mode: 'ranked_duel' | '2v2',
  //   isBot: boolean,        // see the bot gate at each call site
  //   gameId: string,        // the saved doc's id — the idempotency anchor
  //   entries: [{ accountId, won, drew, myElo, opponentElo, stampDecay }]
  // }
  // Every payout is idempotent through grantStamps' ledger key, so re-running
  // this for the same gameId pays nothing twice.
  //
  // RETURNS the receipt: { [accountId]: { total, lines: [{reason, amount}] } },
  // built ONLY from grants that actually landed (`applied === true`). A duplicate
  // key, a refused cap or a disabled economy all contribute nothing, which is
  // what lets sendStampEarnings put the number on screen without a second read
  // of the ledger and without ever over-reporting.
  async grantGameStamps(stampContext) {
    // Kill switch and the null-context rule: both are total no-ops.
    if (!STAMPS_ENABLED || !stampContext) return null;

    const { isBot, gameId, entries = [] } = stampContext;
    if (!gameId) return null; // no anchor = no idempotency = no payout

    const payouts = {};
    // Every grant in this method goes through here instead of calling
    // grantStamps directly, so a future earn source cannot be added to the
    // payout table and silently left off the receipt.
    const pay = async (accountId, amount, reason, key, meta = {}) => {
      // meta.gameId is stamped HERE, not at call sites: the history receipt
      // (stampReceiptForGame) filters the ledger on meta.gameId while the live
      // end-screen is built from these same calls via `payouts`.
      const result = await grantStamps(accountId, amount, reason, key, { gameId, ...meta });
      if (!result?.applied) return result;
      const uid = String(accountId);
      const bucket = payouts[uid] || (payouts[uid] = { total: 0, lines: [] });
      bucket.total += amount;
      bucket.lines.push({ reason, amount });
      return result;
    };

    for (const entry of entries) {
      const accountId = entry?.accountId;
      if (!accountId) continue; // bots and guests own no balance
      const uid = String(accountId);
      // A draw is never a win, whatever the caller put in `won`.
      const won = !!entry.won && !entry.drew;

      if (isBot) {
        const dayKey = dayKeyUTC();
        // ---- BOT GAME: capped trickle, nothing else ----------------------
        // The cap doc must EXIST before the conditional $inc below can match
        // it, and that $inc deliberately does not upsert: an upsert whose
        // filter excludes an existing doc races straight into a duplicate-key
        // error on the unique (userId, periodType, periodKey) index, which is
        // indistinguishable from a real failure. So: create-if-missing first
        // (zeroed, no counters moved), then the atomic cap-then-pay.
        // Without the create step a player's FIRST bot game of the day would
        // find no doc, read as "capped", and never pay.
        await StampQuests.updateOne(
          { userId: accountId, periodType: 'day', periodKey: dayKey },
          { $setOnInsert: { botStampsAwarded: 0 } },
          { upsert: true }
        );
        // ONE atomic conditional increment: the counter only moves while it is
        // still under the cap, so N concurrent bot finishes can never overshoot.
        const capped = await StampQuests.findOneAndUpdate(
          {
            userId: accountId,
            periodType: 'day',
            periodKey: dayKey,
            botStampsAwarded: { $lte: STAMP_BOT_DAY_CAP - STAMP_BOT_GAME_REWARD },
          },
          { $inc: { botStampsAwarded: STAMP_BOT_GAME_REWARD, botGamesPlayed: 1 } },
          { new: true }
        );
        // null = cap reached. Skip ENTIRELY, without even writing a ledger
        // row: an unapplied row would be picked up by cron's reconciliation
        // sweep and turned into the payment the cap just refused.
        if (!capped) continue;

        await pay(accountId, STAMP_BOT_GAME_REWARD, 'bot_game', `g:${gameId}:${uid}:bot`);
        // No win or period bonuses. A bot is not an opponent; beating one must
        // never be worth farming.
        continue;
      }

      // ---- HUMAN GAME --------------------------------------------------
      // The PairWins decay that shrinks the ELO transfer for the Nth win over
      // the same opponent today shrinks the stamp earn with it. It existed
      // for ELO while stamps rode at full price — exactly what a wintrading
      // pair farms. Floor, never round: the decayed 1-stamp win bonus must
      // not round back up to full price. 2v2 entries carry no stampDecay
      // (no PairWins there) and default to 1.
      const stampDecay = Number.isFinite(entry.stampDecay)
        ? Math.min(1, Math.max(0, entry.stampDecay))
        : 1;
      const baseAmount = Math.floor(2 * stampDecay);
      const winAmount = won ? Math.floor(1 * stampDecay) : 0;
      const earnTotal = baseAmount + winAmount;

      // Ranked duels and 2v2 have no daily earn ceiling. Anti-farm pair decay
      // still applies above, and can reduce a repeated matchup to zero.
      if (earnTotal > 0) {
        await pay(accountId, baseAmount, 'game_base', `g:${gameId}:${uid}:base`, {
          ...(typeof entry.myElo === 'number' ? { myElo: entry.myElo } : {}),
          ...(typeof entry.opponentElo === 'number' ? { opponentElo: entry.opponentElo } : {}),
        });
        if (winAmount > 0) {
          await pay(accountId, winAmount, 'game_win', `g:${gameId}:${uid}:win`);
        }
      }
    }

    return payouts;
  }

  // Push the receipt to whoever is still connected, so the end screen can show
  // what the game paid.
  //
  // WHY A SEPARATE MESSAGE AND NOT A FIELD ON duelEnd: the grants happen inside
  // persistGame, which finishSoloDuel deliberately runs AFTER the duelEnd sends
  // (the end screen must not wait on a DB write to appear). Folding stamps into
  // duelEnd would mean holding the entire results screen behind the ledger. So
  // the screen paints immediately and the stamps row animates in a beat later,
  // which is also just a better reveal.
  //
  // Silence is a valid outcome and must stay cheap: economy disabled, nothing
  // applied, or the player already walked away all send nothing at all. The
  // ledger is the record either way — this message is presentation.
  async sendStampEarnings(payouts, gameId) {
    if (!payouts) return;
    const paid = Object.entries(payouts).filter(([, receipt]) => receipt?.total > 0);
    if (!paid.length) return;

    for (const [accountId, receipt] of paid) {
      // Same lookup ws.js /cosmetics-updated uses. Offline is NORMAL (rage
      // quit, closed tab): they were still paid, and the wallet shows it next
      // time they open the shop.
      const sock = Array.from(players.values()).find((p) => p.accountId === accountId);
      if (!sock) continue;

      // The AUTHORITATIVE balance, re-read rather than taken from the grant's
      // `balanceAfter` — that field is explicitly advisory (a purchase landing
      // mid-payout makes it stale, see grantStamps). One read per paid player
      // per game, and the wallet is the one number a player will call us liars
      // over.
      let balance = null;
      try {
        const fresh = await User.findById(accountId).select('stamps').lean();
        if (typeof fresh?.stamps === 'number') balance = fresh.stamps;
      } catch (e) {
        // A failed read costs the balance patch, not the receipt.
      }

      try {
        sock.send({
          type: 'stampsEarned',
          // Lets a client drop a receipt that belongs to a previous match.
          gameId,
          total: receipt.total,
          lines: receipt.lines,
          ...(balance !== null ? { balance } : {})
        });
      } catch (e) {
        // Socket died between the find and the send. Nothing to do.
      }
    }
  }

  async saveDuelToMongoDB(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo, p1Xp = 0, p2Xp = 0) {
    try {
      // Get player data (current or persistent)
      const player1Data = this.getPlayerData(p1, 'p1');
      const player2Data = this.getPlayerData(p2, 'p2');

      // Ranked duels intentionally use DB-fresh usernames (a mid-game rename
      // shows the new name in history). Bot p2 has no account: its identity
      // comes from the roster snapshot instead.
      const user1 = await User.findOne({ _id: this.accountIds.p1 });
      const user2 = this.accountIds.p2 ? await User.findOne({ _id: this.accountIds.p2 }) : null;

      if (!user1 || (!user2 && !this.isBotGame) || !player1Data || !player2Data) {
        console.error('Could not find users or player data for duel game save', this.accountIds, player1Data, player2Data);
        return;
      }

      const participants = [
        { id: player1Data.id, username: user1.username, countryCode: user1.countryCode, accountId: this.accountIds.p1 },
        user2
          ? { id: player2Data.id, username: user2.username, countryCode: user2.countryCode, accountId: this.accountIds.p2 }
          : { id: player2Data.id, username: player2Data.username || 'Player', countryCode: player2Data.countryCode || null, accountId: null }
      ];

      const summary = (data, participant, tag, oldElo, newElo, xp) => ({
        playerId: data.id,
        username: participant.username || 'Player',
        countryCode: participant.countryCode || null,
        accountId: participant.accountId,
        nameGlow: data.nameGlow ?? null,
        markerSkin: data.markerSkin ?? null,
        totalPoints: data.score,
        totalXp: xp,
        averageTimePerRound: this.calculateAverageTime(data.id),
        finalRank: winner?.tag === tag ? 1 : (draw ? 1 : 2),
        elo: { before: oldElo, after: newElo, change: newElo ? (newElo - oldElo) : 0 },
        // Stamped at match creation by ws.js (createRankedDuelGame). Absent on
        // a game restored from a gamestate save, which is why it defaults to
        // null rather than 0 — "we don't know" and "matched instantly" are very
        // different facts to the ETA validation this field exists for.
        queueWaitMs: this.queueWaitMs?.[tag] ?? null
      });

      await this.persistGame({
        gameId: `duel_${this.id}`,
        gameType: 'ranked_duel',
        official: true,
        participants,
        playerSummaries: [
          summary(player1Data, participants[0], 'p1', p1OldElo, p1NewElo, p1Xp),
          summary(player2Data, participants[1], 'p2', p2OldElo, p2NewElo, p2Xp)
        ],
        result: {
          // Winner is the accountId, falling back to the per-game playerId
          // for an account-less (bot) side — same guest convention as
          // playerGuessSchema.playerId.
          winner: winner ? (winner.tag === 'p1'
            ? (this.accountIds.p1 ?? player1Data.id)
            : (this.accountIds.p2 ?? player2Data.id)) : null,
          isDraw: draw,
          maxPossiblePoints: this.roundHistory.length * 5000
        },
        // isPublic:false is the long-standing stored value for ranked duels — preserved.
        multiplayer: { isPublic: false, gameCode: null, hostPlayerId: player1Data.id, maxPlayers: 2, playerCount: 2 },
        userIncs: [
          { accountId: this.accountIds.p1, inc: { totalGamesPlayed: 1, totalXp: p1Xp } },
          ...(this.accountIds.p2
            ? [{ accountId: this.accountIds.p2, inc: { totalGamesPlayed: 1, totalXp: p2Xp } }]
            : [])
        ]
        // Duel stats snapshots run separately via createDuelUserStats, chained
        // after this save in finishSoloDuel.
      }, {
        mode: 'ranked_duel',
        // THE bot gate. `official` is NOT usable here: it is hardcoded true
        // for this save, bot duels included, so gating on it would pay full
        // human rate for beating a bot. isBotGame is the explicit stamp, and
        // an account-less p2 is the structural tell (bot duels are built with
        // accountIds.p2 === null).
        isBot: !!this.isBotGame || !this.accountIds?.p2,
        gameId: `duel_${this.id}`,
        // PRE-game elos on purpose: the post-game values have already had the
        // transfer applied, which flips a near-equal matchup into a false
        // upset (winner ends above the loser by definition).
        //
        // stampDecay mirrors the ELO transfer's PairWins decay onto the earn:
        // the winner's direction sets the game's multiplier (a draw takes the
        // harsher of the two, same rule as the transfer's draw entry). Both
        // seats carry the SAME value — a farming pair must not keep full
        // participation pay while the win pay decays.
        entries: (() => {
          const decayMap = this.ratingV2?.decay || null;
          const dP1 = Number.isFinite(decayMap?.[this.pIds?.p1]) ? decayMap[this.pIds.p1] : 1;
          const dP2 = Number.isFinite(decayMap?.[this.pIds?.p2]) ? decayMap[this.pIds.p2] : 1;
          const stampDecay = draw ? Math.min(dP1, dP2)
            : winner?.tag === 'p2' ? dP2
            : dP1;
          return [
            {
              accountId: this.accountIds.p1,
              won: winner?.tag === 'p1',
              drew: draw,
              myElo: p1OldElo ?? null,
              opponentElo: p2OldElo ?? null,
              stampDecay
            },
            ...(this.accountIds.p2
              ? [{
                  accountId: this.accountIds.p2,
                  won: winner?.tag === 'p2',
                  drew: draw,
                  myElo: p2OldElo ?? null,
                  opponentElo: p1OldElo ?? null,
                  stampDecay
                }]
              : [])
          ];
        })()
      });

      console.log(`Saved duel game duel_${this.id} between ${user1.username} and ${user2?.username ?? `${player2Data.username} [bot]`} (XP: ${p1Xp}, ${p2Xp})`);

    } catch (error) {
      console.error('Error saving duel game to MongoDB:', error);
    }
  }

  async saveUnrankedMultiplayerToMongoDB() {
    try {
      // ALL players (registered and guests) are saved; only registered users
      // get counter updates and stats snapshots. getFinalRoster unions the
      // frozen snapshot with live players: for team parties this records
      // mid-game leavers (their rounds are in the team totals); for plain FFA
      // parties the snapshot is empty, so it's identical to the live roster.
      const allPlayers = this.getFinalRoster();
      const playersWithAccounts = allPlayers.filter(p => p.accountId);
      const users = await Promise.all(playersWithAccounts.map(p => User.findOne({ _id: p.accountId })));
      const validPlayersWithAccounts = playersWithAccounts.filter((p, index) => users[index] !== null);

      const awardXp = this.public; // parties don't award XP
      // gameCount suffix keeps replayed parties from colliding on gameId.
      const gameId = `${this.public ? 'unranked' : 'party'}_${this.id}${!this.public ? `_${this.gameCount}` : ''}`;
      const gameType = this.public ? 'unranked_multiplayer' : 'private_multiplayer';

      const playerSummaries = allPlayers
        .map(player => ({
          playerId: player.id,
          username: player.username || 'Player',
          countryCode: player.countryCode || null,
          accountId: player.accountId || null,
          nameGlow: player.nameGlow ?? null,
          markerSkin: player.markerSkin ?? null,
          totalPoints: player.score || 0,
          totalXp: (awardXp && player.accountId) ? this.calculatePlayerXp(player.id) : 0,
          averageTimePerRound: this.calculateAverageTime(player.id),
          finalRank: 0,
          team: player.team || null,
          elo: { before: null, after: null, change: null }
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        // INDIVIDUAL point rank — even in teamGame parties (a winning-team
        // member can rank below a losing-team member). Team W/L lives in
        // result.winningTeam; see the finalRank caution in models/Game.js.
        .map((player, index) => ({ ...player, finalRank: index + 1 }));

      const summaryFor = (player) => playerSummaries.find(p => p.accountId === player.accountId);

      // Team parties resolve win/loss by team, not by personal rank.
      const teamEnd = this.teamGame ? this.lastTeamEnd : null;
      const teamResultFor = (player) =>
        teamEnd?.draw ? 'draw' : (player.team === teamEnd?.winningTeam ? 'win' : 'loss');

      await this.persistGame({
        gameId,
        gameType,
        official: false,
        participants: allPlayers,
        playerSummaries,
        result: {
          winner: playerSummaries.length > 0 ? playerSummaries[0].accountId : null,
          isDraw: teamEnd
            ? teamEnd.draw
            : playerSummaries.length >= 2 && playerSummaries[0].totalPoints === playerSummaries[1].totalPoints,
          ...(teamEnd ? { winningTeam: teamEnd.winningTeam, teamScores: teamEnd.teamScores } : {}),
          maxPossiblePoints: this.roundHistory.length * 5000
        },
        multiplayer: {
          isPublic: this.public,
          gameCode: this.code,
          hostPlayerId: allPlayers[0]?.id || null,
          maxPlayers: this.maxPlayers,
          playerCount: allPlayers.length
        },
        userIncs: validPlayersWithAccounts.map(player => ({
          accountId: player.accountId,
          inc: { totalGamesPlayed: 1, totalXp: summaryFor(player)?.totalXp || 0 }
        })),
        statsRecords: validPlayersWithAccounts
          .filter(player => summaryFor(player))
          .map(player => ({
            accountId: player.accountId,
            payload: {
              gameType,
              result: teamEnd ? teamResultFor(player) : (summaryFor(player).finalRank === 1 ? 'win' : 'loss'),
              finalScore: summaryFor(player).totalPoints || 0,
              duration: this.endTime - this.startTime,
              playerCount: playerSummaries.length
            }
          }))
        // NO stampContext, deliberately. Casual public games and private
        // parties earn zero stamps, and the way that is enforced is by never
        // handing persistGame a context at all: absence is the safe default,
        // so no future edit to the payout table can accidentally make a party
        // game pay. Party games are also replayable in place (gameCount), so
        // paying here would be a farm with no cap on it.
      });

      console.log(`✅ Saved ${this.public ? 'public' : 'party'} multiplayer game ${gameId} with ${allPlayers.length} total players (${validPlayersWithAccounts.length} registered, ${allPlayers.length - validPlayersWithAccounts.length} guests)`);

    } catch (error) {
      console.error('Error saving unranked multiplayer game to MongoDB:', error);
    }
  }

  async saveTeamDuelToMongoDB(winningTeam, draw) {
    try {
      // Stable roster (persistent snapshot ∪ live players): mid-game leavers
      // are recorded in the saved game and take their team's result (a
      // forfeited team's members all get the loss) instead of vanishing.
      const allPlayers = this.getFinalRoster();
      const playersWithAccounts = allPlayers.filter(p => p.accountId);

      const users = await Promise.all(playersWithAccounts.map(p => User.findOne({ _id: p.accountId })));
      const validPlayersWithAccounts = playersWithAccounts.filter((p, index) => users[index] !== null);

      // Per-player "totalPoints" is each player's OWN summed round points —
      // not the shared team HP the in-game score field mirrors.
      const personalPoints = (id) => this.roundHistory.reduce((s, r) => s + (r.players[id]?.points || 0), 0);

      const playerSummaries = allPlayers.map(player => {
        const isWinner = draw || player.team === winningTeam;
        return {
          playerId: player.id,
          username: player.username || 'Player',
          countryCode: player.countryCode || null,
          accountId: player.accountId || null,
          nameGlow: player.nameGlow ?? null,
          markerSkin: player.markerSkin ?? null,
          totalPoints: personalPoints(player.id),
          totalXp: player.accountId ? this.calculatePlayerXp(player.id) : 0,
          averageTimePerRound: this.calculateAverageTime(player.id),
          // TEAM result, not individual rank (1 = winning team, 2 = losing;
          // draw → all 1) — see the finalRank caution in models/Game.js.
          finalRank: isWinner ? 1 : 2,
          team: player.team || null,
          elo: { before: null, after: null, change: null }
        };
      });

      const summaryFor = (player) => playerSummaries.find(s => s.accountId === player.accountId);

      await this.persistGame({
        gameId: `2v2_${this.id}`,
        gameType: '2v2',
        official: true,
        participants: allPlayers,
        playerSummaries,
        result: {
          winner: null,
          winningTeam: draw ? null : winningTeam,
          // Final shared team HP — history renders the same end-screen summary.
          teamScores: {
            a: Math.max(0, Math.round(this.teamScores?.a ?? 0)),
            b: Math.max(0, Math.round(this.teamScores?.b ?? 0))
          },
          isDraw: draw,
          maxPossiblePoints: this.roundHistory.length * 5000
        },
        // isPublic:false mirrors the ranked-duel convention for matchmade games.
        multiplayer: {
          isPublic: false,
          gameCode: null,
          hostPlayerId: allPlayers[0]?.id || null,
          maxPlayers: this.maxPlayers,
          playerCount: allPlayers.length
        },
        userIncs: validPlayersWithAccounts.map(player => {
          const inc = { totalGamesPlayed: 1, totalXp: summaryFor(player)?.totalXp || 0 };
          if (draw) inc.team2v2_tied = 1;
          else if (player.team === winningTeam) inc.team2v2_wins = 1;
          else inc.team2v2_losses = 1;
          return { accountId: player.accountId, inc };
        }),
        statsRecords: validPlayersWithAccounts
          .filter(player => summaryFor(player))
          .map(player => ({
            accountId: player.accountId,
            payload: {
              gameType: '2v2',
              result: draw ? 'draw' : (player.team === winningTeam ? 'win' : 'loss'),
              finalScore: summaryFor(player).totalPoints || 0,
              duration: this.endTime - this.startTime,
              playerCount: allPlayers.length
            }
          }))
      }, {
        mode: '2v2',
        // Bot gate, 2v2 flavour: isBotGame ONLY. Team duels never populate
        // this.accountIds (there are no p1/p2 tags in team mode — the roster
        // carries the account ids), so the ranked-duel `!accountIds?.p2`
        // clause would read as true for EVERY 2v2 and pay every human team
        // the capped bot trickle instead of the real payout.
        isBot: !!this.isBotGame,
        gameId: `2v2_${this.id}`,
        // 2v2 has no individual rating, so no ELO metadata is attached.
        entries: validPlayersWithAccounts.map(player => ({
          accountId: player.accountId,
          won: !draw && player.team === winningTeam,
          drew: draw,
          myElo: null,
          opponentElo: null
        }))
      });

      console.log(`✅ Saved 2v2 game 2v2_${this.id} (${validPlayersWithAccounts.length} registered / ${allPlayers.length} total, winner: ${draw ? 'draw' : winningTeam})`);
    } catch (error) {
      console.error('Error saving team duel game to MongoDB:', error);
    }
  }

  async createDuelUserStats(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo) {
    const player1Data = this.getPlayerData(p1, 'p1');
    const player2Data = this.getPlayerData(p2, 'p2');
    try {
      if (this.accountIds.p1) {
        await UserStatsService.recordGameStats(this.accountIds.p1, `duel_${this.id}`, {
          gameType: 'ranked_duel',
          result: winner?.tag === 'p1' ? 'win' : (draw ? 'draw' : 'loss'),
          opponent: this.accountIds.p2,
          eloChange: p1NewElo ? (p1NewElo - p1OldElo) : 0,
          finalScore: player1Data?.score || 0,
          duration: this.endTime - this.startTime,
          newElo: p1NewElo
        });
      }
      if (this.accountIds.p2) {
        await UserStatsService.recordGameStats(this.accountIds.p2, `duel_${this.id}`, {
          gameType: 'ranked_duel',
          result: winner?.tag === 'p2' ? 'win' : (draw ? 'draw' : 'loss'),
          opponent: this.accountIds.p1,
          eloChange: p2NewElo ? (p2NewElo - p2OldElo) : 0,
          finalScore: player2Data?.score || 0,
          duration: this.endTime - this.startTime,
          newElo: p2NewElo
        });
      }
    } catch (error) {
      console.error('Error creating duel user stats:', error);
    }
  }

  calculateAverageTime(playerId) {
    if (!this.roundHistory.length) return 30;

    let totalTime = 0;
    let roundsWithTime = 0;

    for (const round of this.roundHistory) {
      if (round.players[playerId]?.timeTaken) {
        totalTime += round.players[playerId].timeTaken;
        roundsWithTime++;
      }
    }

    return roundsWithTime > 0 ? Math.round(totalTime / roundsWithTime) : 30;
  }

  /**
   * Calculate XP earned by a player based on their points in each round
   * XP = points / 50, capped at 100 per round
   */
  calculatePlayerXp(playerId) {
    if (!this.roundHistory.length || !playerId) return 0;

    const MAX_XP_PER_ROUND = 100;
    let totalXp = 0;

    for (const round of this.roundHistory) {
      const playerData = round.players[playerId];
      if (playerData?.points) {
        // XP = points / 50, capped at 100 per round
        const roundXp = Math.min(Math.floor(playerData.points / 50), MAX_XP_PER_ROUND);
        totalXp += roundXp;
      }
    }

    return totalXp;
  }

}
