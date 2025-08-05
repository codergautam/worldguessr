import make6DigitCode from "../../serverUtils/make6DigitCode.js";
import countries from '../../public/countries.json' with {type: "json"};
import officialCountryMaps from '../../public/officialCountryMaps.json' with {type: "json"};
import countryMaxDists from '../../public/countryMaxDists.json' with {type: "json"};

import MapModel from "../../models/Map.js";
import findLatLongRandom from '../../components/findLatLongServer.js';
import {games, players } from '../../serverUtils/states.js';
import { getRandomPointInCountry } from "../../components/randomLoc.js";
import lookup from "coordinate_to_country";
import calcPoints from "../../components/calcPoints.js";
import { boundingExtent } from "ol/extent.js";
import { fromLonLat } from "ol/proj.js";
import { setElo } from "../../api/eloRank.js";
import GameModel from "../../models/Game.js";
import User from "../../models/User.js";
import UserStatsService from "../../components/utils/userStatsService.js";

export default class Game {
  constructor(id, publicLobby, location="all", rounds=5, allLocations, isDuel=false) {
    this.id = id;
    this.code = publicLobby ? null : make6DigitCode();
    this.players = {};
    this.state = 'waiting'; // [waiting, getready, guess, end]
    this.public = publicLobby;
    this.duel = isDuel;
    this.timePerRound = 30000;
    this.waitBetweenRounds = 10000;
    if(isDuel) {
      this.waitBetweenRounds = 6000;
      this.timePerRound = 60000;

    }
    this.maxDist = 20000;
    this.startTime = null;
    this.endTime = null;
    this.nextEvtTime = null;
    this.locations = [];
    this.location = location;
    this.rounds = rounds;
    this.curRound = 0; // 1 = 1st round
    this.maxPlayers = 100;
    this.extent = null;
    this.displayLocation = null;
    this.readyToEnd = false;
    this.roundHistory = []; // Store guess history for each round
    this.roundStartTimes = {}; // Track when each round started for each player

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
      location: this.location,
    }
  }
  static fromJSON(json) {
    const gObj = new Game(json.id, json.public, json.location, json.rounds, null, json.duel);
    Object.assign(gObj, json);
    return gObj;

  }


  addPlayer(player, host=false, tag) {
    if(Object.keys(this.players).length >= this.maxPlayers) {
      return;
    }
    const playerObj = {
      username: player.username,
      accountId: player.accountId,
      id: player.id,
      score: this.duel ? 5000 : 0,
      host: host && !this.public,
      supporter: player.supporter,
      elo: player.elo,
      tag,
      lastPong: Date.now() // Track the last pong received time
    };
    this.sendAllPlayers({
      type: 'player',
      action: 'add',
      player: playerObj
    });

    this.players[player.id] = playerObj;
    player.gameId = this.id;
    player.inQueue = false;

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
      players: Object.values(this.players),
      host: this.players[player.id].host,
      maxDist: this.maxDist,
      code: this.code,
      extent: this.extent,
      generated: this.locations.length,
      displayLocation: this.displayLocation,
      roundHistory: this.roundHistory,

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
    // start generating new locations
    this.generateLocations(allLocations);
    this.sendStateUpdate();
  }


  rejoinGame(player) {
    if(this.public && this.state === 'end') {
      this.removePlayer(player);
    } else {
      try {
    player.ws.send(JSON.stringify(this.getInitialSendState(player)));
      } catch(e) {
        console.error('Error sending game state to rejoining player', e);
      }
  }
  }

  givePoints() {
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
      players: Object.values(this.players),
      generated: this.locations?.length || 0,
      map: this.location,
      extent: this.extent,
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
    delete this.players[player.id];
    player.gameId = null;
    player.inQueue = false;

    this.sendAllPlayers({
      type: 'player',
      id: player.id,
      action: 'remove'
    });

    this.checkRemaining();

    // self destruct if no players or it is a Party and host left
    if (Object.keys(this.players).length < 1 || (!this.duel && isPlayerHost)) {
      this.shutdown();
      games.delete(this.id);
    }

    if(this.duel && Object.keys(this.players).length < 2) {
      this.end(tag);
    }
  }

  start() {
    if ((this.state != 'waiting') || (Object.keys(this.players).length < 2) || (this.rounds != this.locations.length)) {
      console.log('Cannot start game', this.state, Object.keys(this.players).length, this.rounds, this.locations.length, Object.keys(this.players).length < 2, this.rounds !== this.locations.length, this.state !== 'waiting');
      return;
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
  setGuess(playerId, latLong, final) {
    if(this.state !== 'guess') {
      return;
    }

    if (!this.players[playerId]) {
      return;
    }

    const player = this.players[playerId];
    if (player.final) {
      return;
    }

    player.final = final;
    player.guess = latLong;

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
        latLong
      });

      this.checkRemaining();

    }

  }
  checkRemaining() {
          // check if all players have placed
          let allFinal = true;
          let remainingCount = 0;
          let finalPlayer = null;
          for (const p of Object.values(this.players)) {
            if (!p.final) {
              allFinal = false;
              remainingCount++;
              finalPlayer = p;
              if(remainingCount > 1) {
                break;
              }
            }
          }


          if (allFinal && (this.nextEvtTime - Date.now()) > 5000) {
            this.nextEvtTime = Date.now() + 1000;
            this.sendStateUpdate();
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
      locs = locs.sort(() => Math.random() - 0.5).slice(0, this.rounds).map((loc) => ({
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

    for (let i = 0; i < this.rounds; i++) {
      let loc;
        // get n random from the list
        loc = allLocations[Math.floor(Math.random() * allLocations.length)];
        this.maxDist = 20000;
        this.extent = null;

      this.locations.push(loc);

      this.sendAllPlayers({
        type: 'generating',
        generated: this.locations.length,
      })
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
  sendAllPlayers(json) {
    for (const playerId of Object.keys(this.players)) {
      const p = players.get(playerId);
      p.send(json);
    }
  }
  end(leftUser) {
    // For duels, only save the final round if it was actually completed (all players made guesses)
    // For regular games, save if the round was started but not yet saved
    if (this.curRound > 0 && this.curRound <= this.locations.length) {
      const lastSavedRound = this.roundHistory.length > 0 ? this.roundHistory[this.roundHistory.length - 1].round : 0;

      if (lastSavedRound !== this.curRound) {
        // For duels, only save if the round actually completed (time ran out or all players guessed)
        // Don't save if the game ended early due to health reaching zero with stale guesses
        if (this.duel) {
          // Check if this round was actually started and players made fresh guesses
          // If readyToEnd is true, the game ended due to health, so don't save stale guesses
          if (!this.readyToEnd) {
            // Game ended normally (time or max rounds), save the round
            this.saveRoundToHistory();
          }
          // If readyToEnd is true, don't save - the round wasn't properly completed
        } else {
          // For regular games, save as before
          this.saveRoundToHistory();
        }
      }
    }

    this.state = 'end';
    this.endTime = Date.now();
    this.nextEvtTime = this.endTime + 7200000; // 2 hours (2 * 60 * 60 * 1000)


    if(this.duel && !this.calculationDone) {
      // find the winner
      // winner is the one with most points
      // or if only 1 player, they win
      this.calculationDone = true;

      let winner = null;
      let draw = false;


      const p1 = Object.values(this.players).find((p) => p.tag === 'p1');
      const p2 = Object.values(this.players).find((p) => p.tag === 'p2');

      const p1obj = players.get(this.pIds.p1);
      const p2obj = players.get(this.pIds.p2);

      if(leftUser === "p1") {
        winner = p2;
      } else if(leftUser === "p2") {
        winner = p1;
      }else if(p1.score > p2.score) {
        winner = p1;
      } else if(p2.score > p1.score) {
        winner = p2;
      } else if(p1.score === p2.score) {
        draw = true;
      }


      let p1NewElo = null;
      let p2NewElo = null;

      let p1OldElo = p1obj?.elo || null;
      let p2OldElo = p2obj?.elo || null;

      // elo changes
      if(this.eloChanges) {
        if(draw) {

          const changes = this.eloChanges.draw;
          // { newRating1, newRating2 }

          p1NewElo = changes.newRating1;
          p2NewElo = changes.newRating2;

          if(p1obj) {

          p1obj.setElo(p1NewElo, { draw: true, oldElo: p1OldElo });
          } else {
            setElo(this.accountIds.p1, p1NewElo, { draw: true, oldElo: p1OldElo });
          }

          if(p2obj) {
          p2obj.setElo(changes.newRating2, { draw: true, oldElo: p2OldElo });
        } else {
          setElo(this.accountIds.p2, changes.newRating2, { draw: true, oldElo: p2OldElo });
        }
        } else if(winner) {

          const changes = this.eloChanges[winner.id];
          // { newRating1, newRating2 }
          p1NewElo = changes.newRating1;
          p2NewElo = changes.newRating2;

          if(p1obj) {
          p1obj.setElo(changes.newRating1, { winner: winner.tag === 'p1', oldElo: p1OldElo });
          } else {
            setElo(this.accountIds.p1, changes.newRating1, { winner: winner.tag === 'p1', oldElo: p1OldElo });
          }

          if(p2obj) {
          p2obj.setElo(changes.newRating2, { winner: winner.tag === 'p2', oldElo: p2OldElo });
          } else {
            setElo(this.accountIds.p2, changes.newRating2, { winner: winner.tag === 'p2', oldElo: p2OldElo });
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
    if(this.duel && this.accountIds?.p1 && this.accountIds?.p2) {
      this.saveDuelToMongoDB(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo).catch(error => {
        console.error('Error saving duel game to MongoDB:', error);
      });

      // Create userstats documents for both users
      this.createDuelUserStats(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo).catch(error => {
        console.error('Error creating duel user stats:', error);
      });
    }

    }


    this.sendStateUpdate(true); // Send complete state including roundHistory
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

  async saveDuelToMongoDB(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo) {
    try {
      // Get user data for both players
      const user1 = await User.findOne({ _id: this.accountIds.p1 });
      const user2 = await User.findOne({ _id: this.accountIds.p2 });

      if (!user1 || !user2) {
        console.error('Could not find users for duel game save');
        return;
      }

      // Calculate game statistics
      const totalDuration = this.endTime - this.startTime; // in milliseconds
      const maxPossiblePoints = this.roundHistory.length * 5000; // Use actual completed rounds

      // Prepare rounds data from roundHistory
      const gameRounds = this.roundHistory.map((roundData, index) => {
        // Use the location from roundHistory, not from the full locations array
        // This ensures we only save actually played rounds
        const actualLocation = roundData.location;

        return {
          roundNumber: index + 1,
          location: {
            lat: actualLocation.lat,
            long: actualLocation.long,
            country: null,
            place: null
          },
          playerGuesses: [
            // Player 1 guess
            {
              playerId: p1.id,
              username: user1.username || 'Player',
              accountId: this.accountIds.p1,
              guessLat: roundData.players[p1.id]?.lat || null,
              guessLong: roundData.players[p1.id]?.long || null,
              points: roundData.players[p1.id]?.points || 0,
              timeTaken: roundData.players[p1.id]?.timeTaken || 30,
              xpEarned: 0, // Duels don't give XP per round
              guessedAt: new Date(this.startTime + (index * 60000)), // Approximate timing
              usedHint: false
            },
            // Player 2 guess
            {
              playerId: p2.id,
              username: user2.username || 'Player',
              accountId: this.accountIds.p2,
              guessLat: roundData.players[p2.id]?.lat || null,
              guessLong: roundData.players[p2.id]?.long || null,
              points: roundData.players[p2.id]?.points || 0,
              timeTaken: roundData.players[p2.id]?.timeTaken || 30,
              xpEarned: 0,
              guessedAt: new Date(this.startTime + (index * 60000)),
              usedHint: false
            }
          ],
          startedAt: new Date(this.startTime + (index * 60000)),
          endedAt: new Date(this.startTime + ((index + 1) * 60000))
        };
      });

      // Create the game document
      const gameDoc = new GameModel({
        gameId: `duel_${this.id}`,
        gameType: 'ranked_duel',

        settings: {
          location: this.location || 'all',
          rounds: this.roundHistory.length, // Use actual completed rounds, not original setting
          maxDist: this.maxDist || 20000,
          timePerRound: this.timePerRound || 60000,
          official: true,
          showRoadName: this.showRoadName || false,
          noMove: this.nm || false,
          noPan: this.npz || false,
          noZoom: this.npz || false
        },

        startedAt: new Date(this.startTime),
        endedAt: new Date(this.endTime),
        totalDuration: Math.floor(totalDuration / 1000), // Convert to seconds

        rounds: gameRounds,

        players: [
          {
            playerId: p1.id,
            username: user1.username || 'Player',
            accountId: this.accountIds.p1,
            totalPoints: p1.score,
            totalXp: 0, // Duels don't give XP
            averageTimePerRound: this.calculateAverageTime(p1.id),
            finalRank: winner?.tag === 'p1' ? 1 : (draw ? 1 : 2),
            elo: {
              before: p1OldElo,
              after: p1NewElo,
              change: p1NewElo ? (p1NewElo - p1OldElo) : 0
            }
          },
          {
            playerId: p2.id,
            username: user2.username || 'Player',
            accountId: this.accountIds.p2,
            totalPoints: p2.score,
            totalXp: 0,
            averageTimePerRound: this.calculateAverageTime(p2.id),
            finalRank: winner?.tag === 'p2' ? 1 : (draw ? 1 : 2),
            elo: {
              before: p2OldElo,
              after: p2NewElo,
              change: p2NewElo ? (p2NewElo - p2OldElo) : 0
            }
          }
        ],

        result: {
          winner: winner ? (winner.tag === 'p1' ? this.accountIds.p1 : this.accountIds.p2) : null,
          isDraw: draw,
          maxPossiblePoints: maxPossiblePoints
        },

        multiplayer: {
          isPublic: false,
          gameCode: null,
          hostPlayerId: p1.id,
          maxPlayers: 2,
          playerCount: 2
        }
      });

      // Save to MongoDB
      await gameDoc.save();

      // Update totalGamesPlayed for both users
      await User.updateOne(
        { _id: this.accountIds.p1 },
        { $inc: { totalGamesPlayed: 1 } }
      );

      await User.updateOne(
        { _id: this.accountIds.p2 },
        { $inc: { totalGamesPlayed: 1 } }
      );

      console.log(`Saved duel game ${gameDoc.gameId} between ${user1.username} and ${user2.username}`);

    } catch (error) {
      console.error('Error saving duel game to MongoDB:', error);
    }
  }

  async createDuelUserStats(p1, p2, winner, draw, p1OldElo, p2OldElo, p1NewElo, p2NewElo) {
    try {
      // Create userstats document for player 1
      if (this.accountIds.p1) {
        await UserStatsService.recordGameStats(
          this.accountIds.p1,
          `duel_${this.id}`,
          {
            gameType: 'ranked_duel',
            result: winner?.tag === 'p1' ? 'win' : (draw ? 'draw' : 'loss'),
            opponent: this.accountIds.p2,
            eloChange: p1NewElo ? (p1NewElo - p1OldElo) : 0,
            finalScore: p1.score,
            duration: this.endTime - this.startTime
          }
        );
        console.log(`Created userstats for player 1: ${this.accountIds.p1}`);
      }

      // Create userstats document for player 2
      if (this.accountIds.p2) {
        await UserStatsService.recordGameStats(
          this.accountIds.p2,
          `duel_${this.id}`,
          {
            gameType: 'ranked_duel',
            result: winner?.tag === 'p2' ? 'win' : (draw ? 'draw' : 'loss'),
            opponent: this.accountIds.p1,
            eloChange: p2NewElo ? (p2NewElo - p2OldElo) : 0,
            finalScore: p2.score,
            duration: this.endTime - this.startTime
          }
        );
        console.log(`Created userstats for player 2: ${this.accountIds.p2}`);
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

}
