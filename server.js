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
// const { writeHeapSnapshot } = require('node:v8');
import { writeHeapSnapshot } from 'v8';

config();

// ws server
import { WebSocketServer } from 'ws';

import { decrypt } from './components/utils/encryptDecrypt.js';
import mongoose, { mongo } from 'mongoose';
import User from './models/User.js';
import Memsave from './models/Memsave.js';
import validateJWT from './components/utils/validateJWT.js';
import findLatLongRandom from './components/findLatLongServer.js';
import { getRandomPointInCountry } from './pages/api/randomLoc.js';
import calcPoints from './components/calcPoints.js';
import { promisify } from 'util';
import { readFile, unlinkSync } from 'fs';
import path from 'path';
import countries from './public/countries.json' assert { type: "json" };
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


if(!process.env.I18NEXT_DEFAULT_CONFIG_PATH) {
  throw new Error("I18NEXT_DEFAULT_CONFIG_PATH env variable not set, please set it to the path of the i18next config file");
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
if(process.env.NEXT_PUBLIC_CESIUM_TOKEN) {
  console.log("[INFO] NEXT_PUBLIC_CESIUM_TOKEN env variable set, showing home animation".yellow);
}


const dev = process.env.NODE_ENV !== 'production'

const hostname = 'localhost'
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const handlers = {};
function registerHandler(path, method, handler) {
  handlers[path] = {
    method,
    handler
  }
}
const readFileAsync = promisify(readFile);


const publicFilesToServe = ["ads.txt","manifest.json"];
const __dirname = import.meta.dirname;

for(const file of publicFilesToServe) {
  registerHandler(`/${file}`, 'GET', (req,res,query)=>{
    try{
      const filePath = path.join(__dirname, 'public', file);
      readFileAsync(filePath).then((data) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end(data);
      }).catch((error) => {
        console.log(error)
        res.end('Error reading file');
      });
    }catch(e){
      console.log(e)
      res.end('Error');
    }
  });
}

registerHandler('/memdump', 'GET', (req, res, query) => {
  const filename = writeHeapSnapshot();

console.log('a memdump requested')
  // Ensure cleanup in case of request abortion
  // res.onAborted(() => {
  //   fs.unlinkSync(filename); // Clean up the file if the client aborts the connection
  // });

  try {
    // Read the file into memory - be cautious with large files
    readFileAsync(filename).then((data) => {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename=memdump.heapsnapshot');
      res.end(data);

      // Clean up the file after sending
      unlinkSync(filename);
    });
  } catch (error) {
    unlinkSync(filename);
    res.end("e")
  }
});

function make6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000);
}

class Game {
  constructor(id, publicLobby, location="all") {
    this.id = id;
    this.code = publicLobby ? null : make6DigitCode();
    this.players = {};
    this.state = 'waiting'; // [waiting, getready, guess, end]
    this.public = publicLobby;
    this.timePerRound = 120000;
    this.waitBetweenRounds = 10000;
    this.maxDist = 20000;
    this.startTime = null;
    this.endTime = null;
    this.nextEvtTime = null;
    this.locations = [];
    this.location = location;
    this.rounds = 5;
    this.curRound = 0; // 1 = 1st round
    this.maxPlayers = 100;

    this.generateLocations();
  }

  addPlayer(player, host=false) {
    if(Object.keys(this.players).length >= this.maxPlayers) {
      return;
    }
    const playerObj = {
      username: player.username,
      // accountId: player.accountId,
      id: player.id,
      score: 0,
      host: host && !this.public,
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
      public: this.public,
      players: Object.values(this.players),
      host: playerObj.host,
      maxDist: this.maxDist,
      code: this.code,
      generated: this.locations.length
    });
  }

  givePoints() {
    for (const playerId of Object.keys(this.players)) {
      const player = this.players[playerId];
      if(!player.guess) {
        continue;
      }

      const loc = this.locations[this.curRound - 1];
      player.score += calcPoints({
        lat: loc.lat,
        lon: loc.long,
        guessLat: player.guess[0],
        guessLon: player.guess[1],
        usedHint: false,
        maxDist: this.maxDist
      })

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
      players: Object.values(this.players),
      generated: this.locations.length
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
    const isPlayerHost = this.players[player.id].host;
    delete this.players[player.id];
    player.gameId = null;
    player.inQueue = false;

    this.sendAllPlayers({
      type: 'player',
      id: player.id,
      action: 'remove'
    });

    this.checkRemaining();

    // self destruct if no players or it is a private game and host left
    if (Object.keys(this.players).length < 1 || (!this.public && isPlayerHost)) {
      this.shutdown();
      games.delete(this.id);
    }
  }

  start() {
    console.log('state', this.state, 'players', Object.keys(this.players).length, 'rounds', this.rounds, 'locations', this.locations.length)
    if (this.state !== 'waiting' || Object.keys(this.players).length < 2 || this.rounds !== this.locations.length) {
      return;
    }
    this.state = 'getready';
    this.startTime = Date.now();
    this.nextEvtTime = this.startTime + 5000;
    this.curRound = 1;
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
          for (const p of Object.values(this.players)) {
            if (!p.final) {
              allFinal = false;
              remainingCount++;
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
          }
  }
  async generateLocations() {
    this.sendAllPlayers({
      type: 'generating',
      generated: this.locations.length,
    })
    for (let i = 0; i < this.rounds; i++) {
      const loc = await findLatLongRandom({ location: this.location }, getRandomPointInCountry, lookup);
      this.locations.push(loc);
      console.log('Generated', this.locations.length,'/',this.rounds, 'for game',this.id, this.location);
      this.sendAllPlayers({
        type: 'generating',
        generated: this.locations.length,
      })
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
    this.lastPong = Date.now(); // Track the last pong received time
    this.verified = false;
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
      setTimeout(() => {
      console.log(`> Ready on http://${hostname}:${port}`)
      }, 100);
    })

  // Create a WebSocket server
  // const wss = new WebSocket.Server({ noServer: true });
  const wss = new WebSocketServer({ noServer: true });

    server.on('listening', () => {
      console.log('[INFO] WebSocket server listening');
    });


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
    player.send({
      type: 't',
      t: Date.now()
    })
    players.set(id, player);
    console.log('Client joined', id);


    // Set up a message listener on the client
    ws.on('message', async (message) => {
      const json = JSON.parse(message);
      if (!player.verified && json.type !== 'verify') {
        return;
      }
      if (json.type === "pong") {
        player.lastPong = Date.now();
      }
      if (json.type === 'verify' && !player.verified) {
        // account verification
        if(!json.jwt || json.jwt === 'not_logged_in') {

          // guest mode
          player.username = 'Guest #' + make6DigitCode().toString().substring(0, 4);
          player.verified = true;

          player.send({
            type: 'verify',
            guestName: player.username
          });
          player.send({
            type: 'cnt',
            c: players.size
          })
          console.log('Guest joined', id, player.username);

        } else {
        const valid = await validateJWT(json.jwt, User, decrypt);
        if (valid) {
          // make sure the user is not already logged in (only on prod)
          if (!dev) {
            for (const p of players.values()) {
              if (p.accountId === valid._id.toString()) {
                player.send({
                  type: 'error',
                  message: 'User already connected'
                });
                player.ws.close();
                console.log('User already connected', id, valid.username);
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
          console.log('User verified', id, valid.username);
        } else {
          player.send({
            type: 'error',
            message: 'Failed to login'
          });
          console.log('Failed to verify user', id);
          player.ws.close();
        }
      }
      }

      if (json.type === 'publicDuel' && !player.gameId) {
        console.log('Public duel requested', id, player.username);
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
          name: player.username,
          message
        });
      }

      if(json.type=== 'leaveGame' && player.gameId && games.has(player.gameId)) {
        console.log('Player left game', player.id, player.gameId, player.username);
        const game = games.get(player.gameId);
        game.removePlayer(player);
      }

      if(json.type === 'createPrivateGame' && !player.gameId) {
        console.log('Private game requested', id, player.username);
        const gameId = makeId();
        // options
        let {rounds, timePerRound, locations, maxDist, location} = json;
        rounds = Number(rounds);
        // console.log(location);
        if(!location) return;
        if(!rounds || !timePerRound || !maxDist) {
          return;
        }
        // if(!locations || !Array.isArray(locations) || locations.length < 1 || locations.length > 20) return;
        if(rounds < 1 || rounds > 20 || timePerRound < 10 || timePerRound > 300) {
          return;
        }
        // if(locations.length !== rounds) {
        //   return;
        // }
        if(typeof maxDist !== 'number' || maxDist > 20000 || maxDist < 10) {
          return;
        }

        // validate location (can be all or a 2 letter country code)
        if(!((location === 'all') || (countries.findIndex((c) => c === location) > -1))) {
          return;
        }


        // validate round format
        // for(const loc of locations) {
        //   // ex: {lat: number, long: number, country: 2 letter code}
        //   // make sure proper object
        //   if(typeof loc !== 'object') {
        //     return;
        //   }
        //   if(Object.keys(loc).length !== 3) {
        //     return;
        //   }

        //   if(!loc.lat || !loc.long || !loc.country) {
        //     return;
        //   }

        //   if(typeof loc.lat !== 'number' || typeof loc.long !== 'number' || typeof loc.country !== 'string') {
        //     return;
        //   }

        //   if(loc.country.length !== 2) {
        //     return;
        //   }
        // }

        const game = new Game(gameId, false, location);
        game.rounds = rounds;
        game.timePerRound = timePerRound * 1000;
        // game.locations = locations;
        // game.location = location;
        game.maxDist = maxDist;

        games.set(gameId, game);

        game.addPlayer(player, true);
        console.log('Private game created', gameId, player.username);
      }

      if(json.type === 'joinPrivateGame' && !player.gameId) {
        console.log('Join private game requested', id, player.username);
        let code = json.gameCode;

        // find game by code
        for(const game of games.values()) {
          if(game.code == code && !game.public) {
            if(Object.keys(game.players).length >= game.maxPlayers) {
              player.send({
                type: 'gameJoinError',
                error: 'Game is full'
              });
              console.log('Game is full', game.id);
              return;
            }

            game.addPlayer(player);
            console.log('Player added to private game', game.id, player.username);
            return;
          }
        }

        player.send({
          type: 'gameJoinError',
          error: 'Invalid game code'
        });
        console.log('Invalid game code', code);
      }

      if(json.type === 'startGameHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if(game.players[player.id].host) {

          console.log('Host started game', game.id);

          game.start();
        }
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
console.log("Number of games", games.size,"\nNumber of players in queue", playersInQueue.size, "\nNumber of players", players.size, "\n\n");

  for (const player of players.values()) {
    if (player.verified && !player.gameId) {
      player.send({
        type: 'cnt',
        c: players.size
      });
    }
    player.send({
      type: 't',
      t: Date.now()
    });
  }
}, 5000);

// queue handler
setInterval(() => {


  const minRoundsRemaining = 2;
  for (const game of games.values()) {

    const playerCnt = Object.keys(game.players).length;
    // start games that have at least 2 players
    if (game.state === 'waiting' && playerCnt > 1 && game.public && game.rounds === game.locations.length) {
      game.start();
      console.log('public Game started', game.id);
    } else if (game.state === 'getready' && Date.now() > game.nextEvtTime) {
      if(game.curRound > game.rounds) {
        game.end();
        console.log('Game ended', game.id);
        // game over

      } else {
      game.state = 'guess';
      console.log('State changed to guess', game.id);
      game.nextEvtTime = Date.now() + game.timePerRound;
      game.clearGuesses();

      game.sendStateUpdate();
      }

    } else if (game.state === 'guess' && Date.now() > game.nextEvtTime) {
      console.log('Round', game.curRound, 'ended for game', game.id);
      game.givePoints();
      if(game.curRound <= game.rounds) {
        game.curRound++;
        game.state = 'getready';
        game.nextEvtTime = Date.now() + game.waitBetweenRounds - (game.curRound > game.rounds ? 5000: 0);
        game.sendStateUpdate();


      } else {
        console.log('Game ended', game.id);
        // game over
        game.end()
      }
    }

    if(game.state === 'end' && Date.now() > game.nextEvtTime) {
      console.log('Game shutdown', game.id);
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


    const multiplayerMax = Math.min(10, game.maxPlayers)
    let playersCanJoin = multiplayerMax - playerCnt;
    console.log('Players can join', playersCanJoin, 'for game', game.id);
    console.log(playersInQueue, playersInQueue.size);
    for (const playerId of playersInQueue) {
      const player = players.get(playerId);
      if(!player) {
        console.log('Player not found', playerId, 'in queue');
        playersInQueue.delete(playerId);
        continue;
      }
      if (player.gameId) {
        continue;
      }
      if (playersCanJoin < 1) {
        break;
      }
      console.log('Player added to game', player.id, 'gameid', game.id);
      game.addPlayer(player);
      playersInQueue.delete(playerId);
      playersCanJoin--;
    }

  }

  if (playersInQueue.size > 1) {
    // create a new public game
    console.log('Creating new public game');
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
      console.log('Player added to new public game', player.id);
      playersInQueue.delete(playerId);
      playersCanJoin--;
    }
  }
}, 500);
if(!dev && multiplayerEnabled) {
  setInterval(() => {
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
  }, 10000);
}

// Check for pong messages and disconnect inactive clients
setInterval(() => {
  const currentTime = Date.now();
  players.forEach((player) => {
    if (currentTime - player.lastPong > 60000) { // 60 seconds timeout
      console.log(`Disconnecting inactive player ${player.id}`);
      player.ws.close(); // Disconnect the player
    }
  });
}, 10000); // Check every 10 seconds
