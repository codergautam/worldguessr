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
import cities from './public/cities.json' assert { type: "json" };

let multiplayerEnabled = true;

if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set".yellow);
  multiplayerEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
    } catch (error) {
      console.error('[ERROR] Database connection failed!'.red, error.message);
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

// redirect /wiki to /wiki/index.html
registerHandler('/wiki', 'GET', (req,res,query)=>{
  res.writeHead(301, {
    Location: '/wiki/index.html'
  });
  res.end();
});

// registerHandler('/memdump', 'GET', (req, res, query) => {
//   const filename = writeHeapSnapshot();

// console.log('a memdump requested')
//   // Ensure cleanup in case of request abortion
//   // res.onAborted(() => {
//   //   fs.unlinkSync(filename); // Clean up the file if the client aborts the connection
//   // });

//   try {
//     // Read the file into memory - be cautious with large files
//     readFileAsync(filename).then((data) => {
//       res.setHeader('Content-Type', 'application/octet-stream');
//       res.setHeader('Content-Disposition', 'attachment; filename=memdump.heapsnapshot');
//       res.end(data);

//       // Clean up the file after sending
//       unlinkSync(filename);
//     });
//   } catch (error) {
//     unlinkSync(filename);
//     res.end("e")
//   }
// });
let allLocations = [];
const locationCnt = 100;
const batchSize = 20;

function cityGen(location) {
  const city = cities[Math.floor(Math.random() * cities.length)];
  const coord = city.coordinates;
  const lat = coord.lat;
  const long = coord.lon;

  const radius_km = 5;
  const latOffset = Math.random() * radius_km * 0.009;
  const longOffset = Math.random() * radius_km * 0.009;

  return [lat + latOffset, long + longOffset];

}

const generateMainLocations = async () => {
  for (let i = 0; i < locationCnt; i += batchSize) {
    const batchPromises = [];

    for (let j = 0; j < batchSize && i + j < locationCnt; j++) {
      const locationPromise = new Promise((resolve, reject) => {
        findLatLongRandom({ location: 'all' }, cityGen, lookup).then(resolve).catch(reject)
      });

      batchPromises.push(locationPromise);
    }

    try {
      const batchResults = await Promise.all(batchPromises);
      allLocations.push(...batchResults);
      console.log('Generated', allLocations.length, '/', locationCnt);
      if(allLocations.length === locationCnt) {
        console.log('Finished generating all locations');
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          let latLong = await findLatLongRandom({ location: 'all' }, cityGen, lookup);
          if(!latLong) {
            continue;
          }
          // put in first allLocations and remove the last
          allLocations.unshift(latLong);
          allLocations.pop();

        }
      }
    } catch (error) {
      console.error('Error generating batch', i / batchSize, error);
    }
  }
};

generateMainLocations();

registerHandler('/allCountries.json', 'GET', (req, res, query) => {
  if(allLocations.length !== locationCnt) {
    // send json {ready: false}
    res.end(JSON.stringify({ ready: false }));
  } else {
    res.end(JSON.stringify({ ready: true, locations: allLocations }));
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
            console.log('Sending toast to last player', pObj.username);
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
    this.screen = "home";

    this.friends = []; // { id (accountId), online, socketId (id), name }
    this.sentReq = [];
    this.receivedReq = [];
    this.allowFriendReq = true;
  }
  send(json) {
    if(!this.ws) return;
    this.ws.send(JSON.stringify(json));
  }
  setScreen(screen) {
    const validScreens = ["home", "singleplayer", "multiplayer"];
    if(validScreens.includes(screen)) {
      this.screen = screen;
    }
  }
  sendFriendData() {
  if(!this.accountId) {
    return;
  }

  let friends = this.friends;

  // check if online
  for(const f of friends) {
    const player = Array.from(players.values()).find((p) => p.accountId === f.id);
    if(player) {
      f.online = true;
      f.socketId = player.id;
    } else {
      f.online = false;
    }
  }

  const data = {
    type: 'friends',
    friends,
    sentRequests: this.sentReq,
    receivedRequests: this.receivedReq,
    allowFriendReq: this.allowFriendReq
  };
  this.send(data);
}

}

const players = new Map();
const games = new Map();
const playersInQueue = new Set();

function joinGameByCode(code, onFull, onInvalid, onSuccess) {
  for(const game of games.values()) {
    if(game.code == code && !game.public) {
      if(Object.keys(game.players).length >= game.maxPlayers) {
        onFull();
        return;
      }

      onSuccess(game);
      return;
    }
  }
  onInvalid();
}

// registerHandler('/players', 'GET',(req, res, query) => {
//   // return all the player names 1 by 1, along with their screen, gameId (if exists)
//   const playerData = [];
//   for(const player of players.values()) {
//     playerData.push({
//       id: player.id,
//       username: player.username,
//       screen: player.screen,
//       gameId: player.gameId
//     });
//   }
//   res.end(JSON.stringify(playerData));
// })

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
    if(pathname === '/wg') {
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
            for (const p of players.values()) {
              if (p.accountId === valid._id.toString()) {
                player.send({
                  type: 'error',
                  message: 'uac'
                });
                player.ws.close();
                console.log('User already connected', id, valid.username);
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

          player.friends = valid.friends.map((id)=>({id}));
          player.sentReq = valid.sentReq.map((id)=>({id}));
          player.receivedReq = valid.receivedReq.map((id)=>({id}));

          console.time("friendsNames")
          const friendsWithNames = [];
          // player.friends = valid.friends;
          for(let id of valid.friends) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              friendsWithNames.push({name: user.username, id});
            }
          }
          player.friends = friendsWithNames;

          const sentReqWithNames = [];
          for(let id of valid.sentReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              sentReqWithNames.push({name: user.username, id});
            }
          }
          player.sentReq = sentReqWithNames;

          const receivedReqWithNames = [];
          for(let id of valid.receivedReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              receivedReqWithNames.push({name: user.username, id});
            }
          }
          player.receivedReq = receivedReqWithNames;
          console.timeEnd("friendsNames")

          player.allowFriendReq = valid.allowFriendReq;

          console.log('User verified', id, valid.username, player.sentReq);
        } else {
          player.send({
            type: 'error',
            message: 'Failed to login',
            failedToLogin: true
          });
          console.log('Failed to verify user', id);
          player.ws.close();
        }
      }
      }

      if(json.type === 'screen' && json.screen && typeof json.screen === 'string') {
        player.setScreen(json.screen);
      }

      if (json.type === 'publicDuel' && !player.gameId) {
        console.log('Public duel requested', id, player.username);
        player.inQueue = true;
        playersInQueue.add(player.id);
      }

      if(json.type === 'leaveQueue' && player.inQueue) {
        player.inQueue = false;
        playersInQueue.delete(player.id);
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

      if(json.type === "inviteFriend" && player.accountId && json.friendId && player.gameId) {
        // here friendId is the socket id
        const friend = players.get(json.friendId);
        if(!friend) {
          return;
        }

        const game = games.get(player.gameId);
        if(!game || game.public) {
          return;
        }

        // make sure the friend is not already in this game
        if(friend.gameId === player.gameId) {
          player.send({
            type: 'toast',
            key: 'alreadyInYourGame',
            toastType: 'error'
          });
          return;
        }

        // make sure the friend is friends with the player
        if(!player.friends.find((f)=>f.id === friend.accountId)) {
          return;
        }

        if(Date.now() - friend.lastInvite < 5000) {
          player.send({
            type: 'toast',
            key: "inviteCooldown",
            t: ((5000 - (Date.now() - friend.lastInvite))/1000).toFixed(1)
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

      if(json.type === 'acceptInvite' && json.code && player.accountId) {
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
        // leave queue if in
        if(player.inQueue) {
          player.inQueue = false;
          playersInQueue.delete(player.id);
        }

        // leave current game if in
        if(player.gameId) {
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
        if(friendPlayer && player.friends.find((f)=>f.id === friendPlayer.accountId)) {
          friendPlayer.send({
            type: 'toast',
            key: 'inviteAcceptedBy',
            name: player.username,
            toastType: 'success'
          });
        }
      })
      }

      if(json.type === "setAllowFriendReq" && typeof json.allow === 'boolean' && player.accountId) {

        if(Date.now() - player.lastAllowFriendReqChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastAllowFriendReqChange)/1000),
            toastType: 'error'
          });
          return;
        }
        player.lastAllowFriendReqChange = Date.now();
        player.allowFriendReq = json.allow;
        await User.updateOne({_id: player.accountId}, {allowFriendReq: json.allow});
        player.send({
          type: 'toast',
          key: 'preferenceUpdated'
        });
        player.sendFriendData();
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
        joinGameByCode(code, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Game is full'
          });
          console.log('Game is full', code);
        }, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Invalid game code'
          });
          console.log('Invalid game code', code);
        }, (game) => {
          game.addPlayer(player);
          console.log('Player added to private game', game.id, player.username);
        });
      }

      if(json.type === 'startGameHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if(game.players[player.id].host) {

          console.log('Host started game', game.id);

          game.start();
        }
      }

      /* Friend system */
    // const handleSendRequest = () => {
    //   ws.send(JSON.stringify({ type: 'sendFriendRequest', name: newFriend }));
    //     setNewFriend('');
    // };

    // const handleAccept = (id) => {
    //     ws.send(JSON.stringify({ type: 'acceptFriend', id }));
    // };

    // const handleDecline = (id) => {
    //     ws.send(JSON.stringify({ type: 'declineFriend', id }));
    // };

    // const handleCancel = (id) => {
    //     ws.send(JSON.stringify({ type: 'cancelRequest', id }));
    // };

    if(json.type === 'getFriends') {
      player.sendFriendData();
    }

    if(json.type === 'sendFriendRequest') {
      if(!player.accountId) {
        return;
      }
      if(!json.name) {
        player.send({type:'friendReqState',state: 0})
        return;
      }
      // cannot have more than 100 friends
      if(player.friends.length > 100) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      // cannot have more than 100 sent reqs
      if(player.sentReq.length > 100) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      const friend = await User.findOne({username: { $regex: new RegExp('^'+ json.name + '$', "i") }});
      if(!friend) {
        player.send({type:'friendReqState',state: 3})
        return;
      }
      if(!friend.allowFriendReq) {
        player.send({type:'friendReqState',state: 2})
        return;
      }
      // cannot have more than 100 received requests
      if(friend.receivedReq.length > 100) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      if(friend._id.toString() === player.accountId) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      if(player.friends.findIndex((f) => f.id === friend._id.toString()) > -1) {
        player.send({type:'friendReqState',state: 6})
        return;
      }
      if(player.sentReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
        player.send({type:'friendReqState',state: 4})
        return;
      }
      // cannot have a friedn request received from this user
      if(player.receivedReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
        player.send({type:'friendReqState',state: 5})
        return;
      }

      // update mongodb
      await User.updateOne({_id: player.accountId}, {$push: {sentReq: friend._id.toString()}});
      await User.updateOne({_id: friend._id}, {$push: {receivedReq: player.accountId}});

      // update player
      player.sentReq.push({id: friend._id.toString(), name: friend.username});
      player.sendFriendData();
      player.send({type:'friendReqState',state: 1})

      // is user online
      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === friend._id.toString());
      if(friendPlayer) {
        friendPlayer.send({type:'friendReq',id: player.accountId, name: player.username});

        friendPlayer.receivedReq.push({id: player.accountId, name: player.username});
        friendPlayer.sendFriendData();
      }


    }

    if(json.type === 'cancelRequest' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.sentReq.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      player.sentReq.splice(exists, 1);

            const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.receivedReq.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.receivedReq.splice(exists, 1);
          friendPlayer.sendFriendData();
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {sentReq: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {receivedReq: player.accountId}});

      player.sendFriendData();
    }

    if(json.type === 'acceptFriend' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.receivedReq.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      const friend = player.receivedReq.splice(exists, 1)[0];
      player.friends.push(friend);

      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.sentReq.splice(exists, 1);
          friendPlayer.friends.push({id: player.accountId, name: player.username});
          friendPlayer.sendFriendData();
          // friendPlayer.send({type:'newFriend', id: player.accountId, name: player.username});
          friendPlayer.send({type:'toast', key: 'newFriend', name: player.username, toastType: 'success'});
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {receivedReq: json.id}, $push: {friends: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {sentReq: player.accountId}, $push: {friends: player.accountId}});

      player.sendFriendData();
      // player.send({type:'newFriend', id: json.id, name: friend.name});
      player.send({type:'toast', key: 'newFriend', name: friend.name, toastType: 'success'});
    }

    if(json.type === 'declineFriend' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.receivedReq.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      player.receivedReq.splice(exists, 1);

      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.sentReq.splice(exists, 1);
          friendPlayer.sendFriendData();
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {receivedReq: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {sentReq: player.accountId}});

      player.sendFriendData();
    }

    if(json.type === 'removeFriend' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.friends.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      player.friends.splice(exists, 1);

      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.friends.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.friends.splice(exists, 1);
          friendPlayer.sendFriendData();
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {friends: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {friends: player.accountId}});

      player.sendFriendData();
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
