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
import { setElo } from "../../api/eloRank.js";
import GameModel from "../../models/Game.js";
import User from "../../models/User.js";
import UserStatsService from "../../components/utils/userStatsService.js";
import shuffle from "../../utils/shuffle.js";
import continentMapping from '../../public/continentMapping.json' with {type: "json"};

export default class Game {
  constructor(id, {
    public: isPublic = false,
    location = 'all',
    rounds = 5,
    allLocations = null,
    duel = false,
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
      // Known gap: persistentPlayerData is not serialized, so a restart-recovery
      // mid-duel loses leaver records for that game only (pre-existing).
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
      supporter: player.supporter,
      elo: player.elo,
      tag,
      team, // 'a' | 'b' for team duels, undefined otherwise
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
      team2v2: this.teamDuel, // wire name kept for shipped clients
      is2v2Lobby: this.is2v2Lobby,
      teamScores: this.teamScores ?? null,
      teamGame: !!this.teamGame,
      teamScoring: this.teamScoring,
      allowTeamPick: !!this.allowTeamPick,
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
    // Back among the living: clear the close handler's roster flag and let
    // everyone's HUD un-dim before the rejoiner gets their own snapshot.
    const seat = this.players[player.id];
    if (seat?.disconnected) {
      delete seat.disconnected;
      this.sendStateUpdate();
    }
    // Team duels replay their frozen end payload below instead of kicking —
    // a blip in the final seconds used to cost the player the whole results
    // screen ("Reconnected!" toast straight into a silent gameShutdown).
    if(this.public && this.state === 'end' && !this.teamDuel) {
      this.removePlayer(player);
    } else {
      try {
    player.ws.send(JSON.stringify(this.getInitialSendState(player)));
      } catch(e) {
        console.error('Error sending game state to rejoining player', e);
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
      // 1.5x damage (matchmade 2v2 only — party team games have no HP) so
      // matches close out faster. Stamped on the wire because the reveal
      // banner must show the HP actually applied; a client re-deriving |a−b|
      // would drift from the bars.
      const damage = Math.round(Math.abs(scoreA - scoreB) * 1.5);
      this.lastRoundTeamScores = { round: this.curRound, scores: { a: scoreA, b: scoreB }, damage };
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

      // Team-party rounds carry the server-computed team scores: the client
      // cannot reconstruct 'average' retroactively (denominator = roster at
      // scoring time, which leavers/joiners change).
      if (this.teamGame && this.lastRoundTeamScores?.round === this.curRound) {
        roundData.teamRoundScores = this.lastRoundTeamScores.scores;
        roundData.teamTotals = { ...this.teamScores };
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
      npz: !!this.npz
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
            if ((aDone || bDone) && (this.nextEvtTime - Date.now()) > 20000) {
              this.nextEvtTime = Date.now() + 20000;
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
                  s: 20,
                  closeOnClick: true,
                  autoClose: 3000,
                  toastType: 'info'
                });
              }
            }
            return;
          }

          // 1v1 duels / other modes: drop to 20s when exactly one player remains.
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

          if(remainingCount === 1 && (this.nextEvtTime - Date.now()) > 20000) {
            this.nextEvtTime = Date.now() + 20000;
            this.sendStateUpdate();

            // send last player a toast
            const pObj = players.get(finalPlayer.id);
            pObj.send({
              type: 'toast',
              key: 'lastGuesser',
              s: 20,
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
        const candidate = [];
        for (let i = 0; i < this.rounds; i++) {
          candidate.push(allLocations[Math.floor(Math.random() * allLocations.length)]);
        }
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
      // Duels: pure random
      for (let i = 0; i < this.rounds; i++) {
        this.locations.push(allLocations[Math.floor(Math.random() * allLocations.length)]);
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
      byId[id] = { id, username: data.username, countryCode: data.countryCode, accountId: data.accountId, team: data.team, score: data.score ?? 0 };
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
    // pins/groupings to "enemy" on the round-over screen. accountId stripped —
    // the client never needs it.
    const rosterSnapshot = this.getFinalRoster().map(p => ({
      id: p.id, username: p.username, countryCode: p.countryCode || null, team: p.team || null
    }));

    // Frozen end payload (mirrors finishTeamParty's lastTeamEnd): replayed to
    // end-state rejoiners by rejoinGame so a connection blip in the final
    // seconds can't eat the results screen.
    this.lastTeamEnd = {
      team2v2: true,
      winningTeam,
      teamScores: this.teamScores,
      players: rosterSnapshot,
      draw,
      timeElapsed: this.endTime - this.startTime
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
      // elo changes
      if(this.eloChanges && p1OldElo && p2OldElo) {
        if(draw) {

          const changes = this.eloChanges.draw;
          // { newRating1, newRating2 }

          p1NewElo += changes.newRating1;
          p2NewElo += changes.newRating2;

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
          p1NewElo += changes.newRating1;
          p2NewElo += changes.newRating2;

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

      if(p1obj && leftUser !== 'p1') {
        try {
      p1obj.send({
        type: 'duelEnd',
        winner:  winner?.tag === 'p1',
        draw,
        newElo: p1NewElo,
        timeElapsed: this.endTime - this.startTime,
        oldElo: p1OldElo
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
        oldElo: p2OldElo
      });
      } catch(e) {
      }
    }

    // Save duel game to MongoDB for history tracking
    if(this.duel && this.accountIds?.p1 && this.accountIds?.p2 && p1OldElo && p2OldElo) {
      this.saveInProgress = true;
      const p1Xp = this.calculatePlayerXp(this.pIds?.p1);
      const p2Xp = this.calculatePlayerXp(this.pIds?.p2);

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

  async persistGame({ gameId, gameType, official, participants, playerSummaries, result, multiplayer, userIncs = [], statsRecords = [] }) {
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
      multiplayer
    });
    await gameDoc.save();

    // User counters first, stats snapshots second — recordGameStats reads the
    // freshly-incremented totalXp.
    await Promise.all(userIncs.map(({ accountId, inc }) =>
      User.updateOne({ _id: accountId }, { $inc: inc })
    ));
    await Promise.all(statsRecords.map(({ accountId, payload }) =>
      UserStatsService.recordGameStats(accountId, gameId, payload)
    ));
    return gameDoc;
  }

  async saveDuelToMongoDB(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo, p1Xp = 0, p2Xp = 0) {
    try {
      // Get player data (current or persistent)
      const player1Data = this.getPlayerData(p1, 'p1');
      const player2Data = this.getPlayerData(p2, 'p2');

      // Ranked duels intentionally use DB-fresh usernames (a mid-game rename
      // shows the new name in history).
      const user1 = await User.findOne({ _id: this.accountIds.p1 });
      const user2 = await User.findOne({ _id: this.accountIds.p2 });

      if (!user1 || !user2 || !player1Data || !player2Data) {
        console.error('Could not find users or player data for duel game save', this.accountIds, player1Data, player2Data);
        return;
      }

      const participants = [
        { id: player1Data.id, username: user1.username, countryCode: user1.countryCode, accountId: this.accountIds.p1 },
        { id: player2Data.id, username: user2.username, countryCode: user2.countryCode, accountId: this.accountIds.p2 }
      ];

      const summary = (data, participant, tag, oldElo, newElo, xp) => ({
        playerId: data.id,
        username: participant.username || 'Player',
        countryCode: participant.countryCode || null,
        accountId: participant.accountId,
        totalPoints: data.score,
        totalXp: xp,
        averageTimePerRound: this.calculateAverageTime(data.id),
        finalRank: winner?.tag === tag ? 1 : (draw ? 1 : 2),
        elo: { before: oldElo, after: newElo, change: newElo ? (newElo - oldElo) : 0 }
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
          winner: winner ? (winner.tag === 'p1' ? this.accountIds.p1 : this.accountIds.p2) : null,
          isDraw: draw,
          maxPossiblePoints: this.roundHistory.length * 5000
        },
        // isPublic:false is the long-standing stored value for ranked duels — preserved.
        multiplayer: { isPublic: false, gameCode: null, hostPlayerId: player1Data.id, maxPlayers: 2, playerCount: 2 },
        userIncs: [
          { accountId: this.accountIds.p1, inc: { totalGamesPlayed: 1, totalXp: p1Xp } },
          { accountId: this.accountIds.p2, inc: { totalGamesPlayed: 1, totalXp: p2Xp } }
        ]
        // Duel stats snapshots run separately via createDuelUserStats, chained
        // after this save in finishSoloDuel.
      });

      console.log(`Saved duel game duel_${this.id} between ${user1.username} and ${user2.username} (XP: ${p1Xp}, ${p2Xp})`);

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
