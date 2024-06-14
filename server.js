/*
                    _     _
__      _____  _ __| | __| | __ _ _   _  ___  ___ ___ _ __
\ \ /\ / / _ \| '__| |/ _` |/ _` | | | |/ _ \/ __/ __| '__|
 \ V  V / (_) | |  | | (_| | (_| | |_| |  __/\__ \__ \ |
  \_/\_/ \___/|_|  |_|\__,_|\__, |\__,_|\___||___/___/_|
                            |___/
A game by Gautam

https://github.com/codergautam/worldguessr
*/


import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { v4 as makeId } from 'uuid';
import { config } from 'dotenv';
import colors from 'colors';
import lookup from "coordinate_to_country"


config();

// ws server
import { WebSocketServer } from 'ws';

import { decrypt } from './components/utils/encryptDecrypt.js';
import mongoose from 'mongoose';
import User from './models/User.js';
import validateJWT from './components/utils/validateJWT.js';
import findLatLongRandom from './components/findLatLongServer.js';
import { getRandomPointInCountry } from './pages/api/randomLoc.js';
import calcPoints from './components/calcPoints.js';

let multiplayerEnabled = true;

if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set, multi-player will not work".yellow);
  multiplayerEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
    } catch (error) {
      console.error('[ERROR] Database connection failed! Multiplayer disabled!'.red, error.message);
      multiplayerEnabled = false;
    }
  }
}

if (!process.env.NEXTAUTH_SECRET) {
  console.log("[MISSING-ENV WARN] NEXTAUTH_SECRET env variable not set, please set it to a random string otherwise multi-player will not work".yellow);
  multiplayerEnabled = false;
}
if (!process.env.NEXTAUTH_URL) {
  console.log("[MISSING-ENV WARN] NEXTAUTH_URL env variable not set, please set it!".yellow);
}
if(process.env.DISCORD_WEBHOOK) {
  console.log("[INFO] Discord Webhook Enabled");
}
if(!process.env.GOOGLE_CLIENT_ID) {
  console.log("[MISSING-ENV WARN] GOOGLE_CLIENT_ID env variable not set, please set it for multiplayer/auth!".yellow);
  multiplayerEnabled = false;
}
if(!process.env.GOOGLE_CLIENT_SECRET) {
  console.log("[MISSING-ENV WARN] GOOGLE_CLIENT_SECRET env variable not set, please set it for multiplayer/auth!".yellow);
  multiplayerEnabled = false;
}
if(!process.env.NEXT_PUBLIC_CESIUM_TOKEN) {
  console.log("[MISSING-ENV WARN] NEXT_PUBLIC_CESIUM_TOKEN env variable not set, please set it to have the homepage globe work!".yellow);
}


const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const handlers = {};
function registerHandler(path, method, handler) {
  handlers[path] = {
    method,
    handler
  }
}

registerHandler('/hi', 'GET', (req, res, query) => {
  res.end('Hello World');
});

class Game {
  constructor(id, publicLobby) {
    this.id = id;
    this.players = {};
    this.state = 'waiting'; // [waiting, getready, guess, end]
    this.public = publicLobby;
    this.timePerRound = 120000;
    this.waitBetweenRounds = 8000;
    this.startTime = null;
    this.endTime = null;
    this.nextEvtTime = null;
    this.locations = [];
    this.location = "all"
    this.rounds = 5;
    this.curRound = 0; // 1 = 1st round
    this.maxPlayers = 10;

    this.generateLocations();
  }

  addPlayer(player) {
    const playerObj = {
      username: player.username,
      // accountId: player.accountId,
      id: player.id,
      score: 0
    };
    this.sendAllPlayers({
      type: 'player',
      action: 'add',
      player: playerObj
    });

    this.players[player.id] = playerObj;
    player.gameId = this.id;
    player.inQueue = false;

    player.send({
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
      players: Object.values(this.players)
    });
  }

  givePoints() {
    for (const playerId of Object.keys(this.players)) {
      const player = this.players[playerId];
      if(!player.guess) {
        continue;
      }

      const loc = this.locations[this.curRound - 1];
      console.log('loc', loc, 'guess', player.guess);
      console.log({
        lat: loc.lat,
        lon: loc.long,
        guessLat: player.guess[0],
        guessLon: player.guess[1],
        usedHint: false,
        maxDist: 20000
      })
      player.score += calcPoints({
        lat: loc.lat,
        lon: loc.long,
        guessLat: player.guess[0],
        guessLon: player.guess[1],
        usedHint: false,
        maxDist: 20000
      })

      console.log('score', player.score);
    }
  }

  clearGuesses() {
    for (const playerId of Object.keys(this.players)) {
      const player = this.players[playerId];
      player.guess = null;
      player.final = false;
    }
  }

  sendStateUpdate(includeLocations=false) {
    const state = {
      type: 'game',
      state: this.state,
      curRound: this.curRound,
      maxPlayers: this.maxPlayers,
      nextEvtTime: this.nextEvtTime,
      players: Object.values(this.players)
    };
    if (includeLocations) {
      state.locations = this.locations;
    }
    this.sendAllPlayers(state);
  }

  removePlayer(player) {
    if (!this.players[player.id]) {
      return;
    }
    player.send({
      type: 'gameShutdown'
    });
    delete this.players[player.id];
    player.gameId = null;
    player.inQueue = false;

    this.sendAllPlayers({
      type: 'player',
      id: player.id,
      action: 'remove'
    });

    // self destruct if no players
    if (Object.keys(this.players).length < 1) {
      console.log('Game self destructing', this.id);
      games.delete(this.id);
    }
  }

  start() {
    if (this.state !== 'waiting' || this.players.size < 2 || this.rounds !== this.locations.length) {
      return;
    }
    this.state = 'getready';
    this.startTime = Date.now();
    this.nextEvtTime = this.startTime + 5000;
    this.curRound = 1;
    this.sendStateUpdate(true);
  }
  setGuess(playerId, latLong, final) {
    console.log('setGuess', playerId, latLong, final);
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

    console.log(playerId, latLong, final);
    if(final) {
      this.sendAllPlayers({
        type: 'place',
        id: playerId,
        final: true,
        latLong
      });


      // check if all players have placed
      let allFinal = true;
      for (const p of Object.values(this.players)) {
        if (!p.final) {
          allFinal = false;
          break;
        }
      }

      if (allFinal && (this.nextEvtTime - Date.now()) > 5000) {
        this.nextEvtTime = Date.now() + 1000;
        this.sendStateUpdate();
      }
    }

  }
  async generateLocations() {
    for (let i = 0; i < this.rounds; i++) {
      const loc = await findLatLongRandom({ location: this.location }, getRandomPointInCountry, lookup);
      this.locations.push(loc);
      console.log(loc, i);
    }
  }
  sendAllPlayers(json) {
    for (const playerId of Object.keys(this.players)) {
      const p = players.get(playerId);
      p.send(json);
    }
  }
  end() {
    this.state = 'end';
    this.endTime = Date.now();
    this.nextEvtTime = this.endTime + 60000;
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

class Player {
  constructor(ws, id) {
    this.id = id;
    this.ws = ws;
    this.username = null;
    this.accountId = null;
    this.gameId = null;
    this.inQueue = false;
    this.lastMessage = 0;
  }
  send(json) {
    if(!this.ws) return;
    this.ws.send(JSON.stringify(json));
  }
}

const players = new Map();
const games = new Map();
const playersInQueue = new Set();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      const { pathname, query } = parsedUrl

      if (handlers[pathname] && req.method === handlers[pathname].method) {
        return handlers[pathname].handler(req, res, query);
      }

      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })

  // Create a WebSocket server
  // const wss = new WebSocket.Server({ noServer: true });
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket connections
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url, true);
    if (pathname === '/multiplayer' && multiplayerEnabled) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // Set up a connection listener
  wss.on('connection', (ws) => {
    // Send a message to the client
    const id = makeId();
    const player = new Player(ws, id);
    players.set(id, player);

    // Set up a message listener on the client
    ws.on('message', async (message) => {
      const json = JSON.parse(message);
      if (!player.verified && json.type !== 'verify') {
        return;
      }
      if (json.type === 'verify' && !player.verified) {
        // account verification
        const valid = await validateJWT(json.jwt, User, decrypt);
        if (valid) {
          // make sure the user is not already logged in (only on prod)
          if (!dev) {
            for (const p of players.values()) {
              console.log(p.accountId, valid._id);
              if (p.accountId === valid._id.toString()) {
                player.send({
                  type: 'error',
                  message: 'User already connected'
                });
                player.ws.close();
                return;
              }
            }
          }
          player.verified = true;
          player.username = valid.username;
          player.accountId = valid._id.toString();
          player.send({
            type: 'verify'
          });
          player.send({
            type: 'cnt',
            c: players.size
          })
        } else {
          player.send({
            type: 'error',
            message: 'Failed to login'
          });
          player.ws.close();
        }
      }

      if (json.type === 'publicDuel' && !player.gameId) {
        player.inQueue = true;
        playersInQueue.add(player.id);
      }

      if(json.type === 'place' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const latLong = json.latLong;
        const final = json.final;

        // make sure latLong is an array of floats with 2 elements
        if (!Array.isArray(latLong) || latLong.length !== 2) {
          return;
        }

        // make sure final is a boolean
        if (typeof final !== 'boolean') {
          return;
        }

        game.setGuess(player.id, latLong, final);

      }

      if(json.type === 'chat' && player.gameId && games.has(player.gameId)) {
        const message = json.message;
        const lastMessage = player.lastMessage || 0;
        if (typeof message !== 'string' || message.length < 1 || message.length > 200 || Date.now() - lastMessage < 500) {
          return;
        }
        const game = games.get(player.gameId);
        player.lastMessage = Date.now();
        game.sendAllPlayers({
          type: 'chat',
          id: player.id,
          message
        });
      }

      if(json.type=== 'leaveGame' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        game.removePlayer(player);
      }

    });

    // Set up a close listener on the client
    ws.on('close', () => {
      console.log('Client disconnected', id);

      if (player.gameId) {
        const game = games.get(player.gameId);
        if (game) {
          game.removePlayer(player);
        }
      }

      if (player.inQueue) {
        playersInQueue.delete(id);
      }

      players.delete(id);
    });
  });
});

// update player count
setInterval(() => {
  for (const player of players.values()) {
    if (player.verified && !player.gameId) {
      player.send({
        type: 'cnt',
        c: players.size
      });
    }
  }
}, 10000);

// queue handler
setInterval(() => {


  const minRoundsRemaining = 2;
  for (const game of games.values()) {

    const playerCnt = Object.keys(game.players).length;
    // start games that have at least 2 players
    if (game.state === 'waiting' && playerCnt > 1) {
      game.start();
      console.log('game started', game.id);
    } else if (game.state === 'getready' && Date.now() > game.nextEvtTime) {
      if(game.curRound > game.rounds) {
        game.end();
        // game over
        console.log('getready -> end');

      } else {
      game.state = 'guess';
      game.nextEvtTime = Date.now() + game.timePerRound;
      game.clearGuesses();

      game.sendStateUpdate();
      console.log('getready -> guess', game.nextEvtTime);
      }

    } else if (game.state === 'guess' && Date.now() > game.nextEvtTime) {
      game.givePoints();
      if(game.curRound <= game.rounds) {
        game.curRound++;
        game.state = 'getready';
        game.nextEvtTime = Date.now() + game.waitBetweenRounds - (game.curRound > game.rounds ? 5000: 0);
        game.sendStateUpdate();

        console.log('guess -> getready', game.nextEvtTime);

      } else {
        console.log('guess -> end');
        // game over
        game.end()
      }
    }

    if(game.state === 'end' && Date.now() > game.nextEvtTime) {
      // remove game
      game.shutdown()
    }


    // find games that can be joined
    if (playersInQueue.size < 1) {
      continue;
    }
    if (!game.public) {
      continue;
    }
    if (game.rounds - game.curRound < minRoundsRemaining) {
      continue;
    }
    if (playerCnt >= game.maxPlayers) {
      continue;
    }

    let playersCanJoin = game.maxPlayers - playerCnt;
    for (const playerId of playersInQueue) {
      const player = players.get(playerId);
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

  if (playersInQueue.size > 1) {
    // create a new public game
    const gameId = makeId();
    const game = new Game(gameId, true);
    games.set(gameId, game);

    let playersCanJoin = game.maxPlayers;
    for (const playerId of playersInQueue) {
      const player = players.get(playerId);
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
}, 500);