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

let multiplayerEnabled = true;

if (!process.env.MONGODB) {
  console.log("[WARN] MONGODB env variable not set, multi-player will not work".yellow);
  multiplayerEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('Database connected');
    } catch (error) {
      console.error('Database connection failed', error.message);
    }
  }
}

if(!process.env.NEXTAUTH_SECRET) {
  console.log("[WARN] NEXTAUTH_SECRET env variable not set, please set it to a random string otherwise multi-player will not work".yellow);
  multiplayerEnabled = false;
}
if(!process.env.NEXTAUTH_URL) {
  console.log("[WARN] NEXTAUTH_URL env variable not set, please set it!".yellow);
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
    this.state = 'waiting';
    this.public = publicLobby;
    this.timePerRound = 10000;
    this.waitBetweenRounds = 5000;
    this.startTime = null;
    this.locations = [];
    this.location = "all"
    this.rounds = 5;
    this.curRound = 0; // 1 = 1st round
    this.maxPlayers = 10;

    this.generateLocations();
  }

  addPlayer(player) {
      this.players[player.id] = {
        username: player.username,
        accountId: player.accountId,
        score: 0
      };
      player.gameId = this.id;
      player.inQueue = false;

      player.send({
        type: 'game',
        state: this.state,
        timePerRound: this.timePerRound,
        waitBetweenRounds: this.waitBetweenRounds,
        startTime: this.startTime,
        locations: this.locations,
        rounds: this.rounds,
        curRound: this.curRound,
        maxPlayers: this.maxPlayers
      });
  }

  async generateLocations() {
    for(let i = 0; i < this.rounds; i++) {
      const loc = await findLatLongRandom({location: this.location}, getRandomPointInCountry, lookup);
      this.locations.push(loc);
      console.log(loc, i);
    }
  }
}

class Player {
  constructor(ws, id) {
    this.id = id;
    this.ws = ws;
    this.state = 'idle';
    this.username = null;
    this.accountId = null;
    this.gameId = null;
    this.inQueue = false;
  }
  send(json) {
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
    console.log(pathname);
    if (pathname === '/multiplayer'  && multiplayerEnabled) {
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
      if(!player.verified && json.type !== 'verify') {
        return;
      }
      if(json.type === 'verify' && !player.verified) {
        // account verification
        const valid = await validateJWT(json.jwt, User, decrypt);
        if(valid) {
          // make sure the user is not already logged in
          for(const p of players.values()) {
            console.log(p.accountId, valid._id);
            if(p.accountId === valid._id.toString()) {
              player.send({
                type: 'error',
                message: 'User already connected'
              });
              player.ws.close();
              return;
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

      if(json.type === 'publicDuel' && !player.gameId) {
        player.inQueue = true;
        playersInQueue.add(player.id);
      }

    });

    // Set up a close listener on the client
    ws.on('close', () => {
      console.log('Client disconnected', id);
      players.delete(id);
    });
  });
});

// update player count
setInterval(() => {
  for (const player of players.values()) {
    if(player.verified) {
    player.send({
      type: 'cnt',
      c: players.size
    });
  }
  }
}, 5000);

// queue handler
setInterval(() => {
  if(playersInQueue.size < 1) {
    return;
  }
  // find games that can be joined
  const minRoundsRemaining = 3;
  for(const game of games.values()) {
    if(game.rounds - game.curRound < minRoundsRemaining) {
      continue;
    }
    if(game.players.size >= game.maxPlayers) {
      continue;
    }

    const playersCanJoin = game.maxPlayers - game.players.size;
    for(const playerId of playersInQueue) {
      const player = players.get(playerId);
      if(player.gameId) {
        continue;
      }
      if(playersCanJoin < 1) {
        break;
      }
      game.addPlayer(player);
      playersInQueue.delete(playerId);
      playersCanJoin--;
    }

  }

  if(playersInQueue.size > 0) {
    // create a new public game
    const gameId = makeId();
    const game = new Game(gameId, true);
    games.set(gameId, game);

    let playersCanJoin = game.maxPlayers;
    for(const playerId of playersInQueue) {
      const player = players.get(playerId);
      if(player.gameId) {
        continue;
      }
      if(playersCanJoin < 1) {
        break;
      }
      game.addPlayer(player);
      playersInQueue.delete(playerId);
      playersCanJoin--;
    }

  }

}, 10000);