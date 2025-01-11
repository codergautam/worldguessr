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

      nm: this.nm,
      npz: this.npz,
      showRoadName: this.showRoadName,
    }
  }

  resetGame(allLocations) {
    this.state = 'waiting';
    // clear locations
    this.locations = [];
    // start generating new locations
    this.generateLocations(allLocations);
    this.sendStateUpdate();
  }


  rejoinGame(player) {
    if(this.public && this.state === 'end') {
      this.removePlayer(player);
    } else {
    player.ws.send(JSON.stringify(this.getInitialSendState(player)));
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

  clearGuesses() {
    for (const playerId of Object.keys(this.players)) {
      const player = this.players[playerId];
      player.guess = null;
      player.final = false;
    }
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
    if (this.state !== 'waiting' || Object.keys(this.players).length < 2 || this.rounds !== this.locations.length) {
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
        console.log('All locations', allLocations.length);
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
      console.time('Country locations '+this.location);
      let data = await fetch('http://localhost:3001/countryLocations/'+this.location, {
        headers: {
          'Content-Type': 'application/json'
        },
      });
     data = await data.json();
     console.timeEnd('Country locations '+this.location);
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
    this.state = 'end';
    this.endTime = Date.now();
    this.nextEvtTime = this.endTime + 60000;


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
      p1obj.send({
        type: 'duelEnd',
        winner:  winner?.tag === 'p1',
        draw,
        newElo: p1NewElo,
        timeElapsed: this.endTime - this.startTime,
        oldElo: p1OldElo
      });
    }

    if(p2obj && leftUser !== 'p2') {
      p2obj.send({
        type: 'duelEnd',
        winner: winner?.tag === 'p2',
        draw,
        newElo: p2NewElo,
        timeElapsed: this.endTime - this.startTime,
        oldElo: p2OldElo
      });
    }

    }


    this.sendStateUpdate();
  }

  shutdown() {
    for(const playerId of Object.keys(this.players)) {
      const p = players.get(playerId);
      p.send({
        type: 'gameShutdown'
      });
      this.removePlayer(p);
    }
  }

}