import uws from 'uWebSockets.js';
import fs from 'fs';
import { config } from 'dotenv';
import Player from './classes/Player.js';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { Filter } from 'bad-words';
import Game from './classes/Game.js';
import setCorsHeaders from '../serverUtils/setCorsHeaders.js';
import findLatLongRandom from '../components/findLatLongServer.js';
import { Webhook } from "discord-webhook-node";

import cityGen from '../serverUtils/cityGen.js';
import lookup from "coordinate_to_country"
import { players, games, disconnectedPlayers } from '../serverUtils/states.js';
import Memsave from '../models/Memsave.js';
import blockedAt from 'blocked-at';
import { getLeagueRange } from '../components/utils/leagues.js';
import calculateOutcomes from '../components/utils/eloSystem.js';
import { tmpdir } from 'os';

import arbitraryWorld from '../public/world-arbitrary.json' with { type: "json" };

function pick5RandomArb() {
  const rand = new Set();
  while(rand.size < 5) {
    rand.add(arbitraryWorld[Math.floor(Math.random() * arbitraryWorld.length)]);
  }
  return [...rand].map((r) => ({ lat: r.lat, long: r.lng, country: lookup(r.lat, r.lng, true) ? lookup(r.lat, r.lng, true)[0] : 'unknown' }));
}


config();
// Load the profanity filter
const filter = new Filter();
filter.removeWords('damn')

fs.readFileSync('public/Crazygames_profanity_filter.txt', 'utf8').split('\n').forEach((word) => {
  filter.addWords(word);
});

// init state vars
const dev = process.env.NODE_ENV !== 'production'
const port = process.env.WS_PORT || 3002;

const playersInQueue = new Map();


let maintenanceMode = false;
let dbEnabled = true;

//get current date &time in cst
function currentDate() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
}

// location generator
let allLocations = [{"lat":59.94945834525827,"long":10.74877784715781,"country":"NO"},{"lat":-22.41504758873939,"long":-42.95073348255873,"country":"BR"},{"lat":7.117061549697593,"long":6.737664188991607,"country":"NG"},{"lat":43.11066098012346,"long":141.5910123338441,"country":"JP"},{"lat":49.88659404088488,"long":-99.9475096434099,"country":"CA"},{"lat":46.720999413096,"long":19.86240516067642,"country":"HU"}];

const generateMainLocations = async () => {
  // fetch cron job localhost:3003/allCountries.json
  fetch('http://localhost:3003/allCountries.json').then(async (res) => {
    const data = await res.json();
    allLocations = data.locations??[];

  }).catch((e) => {
    console.error('Failed to load locations', e, currentDate());
  });


};

setTimeout(generateMainLocations, 2000);
setInterval(generateMainLocations, 1000 * 10);

// helpers
function joinGameByCode(code, onFull, onInvalid, onSuccess) {
  for (const game of games.values()) {
    if (game.code == code && !game.public) {
      if (Object.keys(game.players).length >= game.maxPlayers) {
        onFull();
        return;
      }

      onSuccess(game);
      return;
    }
  }
  onInvalid();
}

// connect to db
if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set".yellow);
  dbEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
    } catch (error) {
      console.error('[ERROR] Database connection failed!'.red, error.message);
      console.log(error);
      dbEnabled = false;
    }
  }
}
function log(...args) {
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }), ...args);

  // if(!dev) {
    // if(process.env.DISCORD_WEBHOOK_WS) {
    //   const hook = new Webhook(process.env.DISCORD_WEBHOOK_WS);
    //   hook.setUsername("Logs"+(dev ? ' - Dev' : ''));
    //   hook.send(args.join(' '));
    // }
  // }
}


// update console log
// if(!dev) {
// console.log = function () {
//   if (dev) {
//     return;
//   }
//   if(process.env.DISCORD_WEBHOOK_WS) {

//   const args = Array.from(arguments);
//   const timeInCST = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
//   args.unshift(timeInCST);
//   const hook = new Webhook(process.env.DISCORD_WEBHOOK_WS);
//   hook.setUsername("Logs");
//   hook.send(args.join(' '));


//   }

// }

// console.error = function () {
//   if (dev) {
//     return;
//   }
//   if(process.env.DISCORD_WEBHOOK_WS) {

//   const args = Array.from(arguments);
//   const timeInCST = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
//   args.unshift(timeInCST);
//   args.unshift('**ERROR!**');
//   const hook = new Webhook(process.env.DISCORD_WEBHOOK_WS);
//   hook.setUsername("Logs");
//   hook.send(args.join(' '));
//   }
// }
// }


blockedAt((time, stack) => {
  if(time > 1000) console.log(`Blocked for ${time}ms, operation started here:`, JSON.stringify(stack, null, 2), currentDate());
})
function stop(reason) {
  console.error('Stopping server', reason, currentDate());

  // store players and games in cache
  let gamesArr = [];
  let playersArr = [];
  for (const game of games.values()) {
    // store json
    gamesArr.push(game.toJSON());
  }
  for (const player of players.values()) {
    // store json
    playersArr.push(player.toJSON());
  }
  try {
  console.log('Saving gamestate before stopping',tmpdir() + `/gamestate.worldguessr`);
  fs.writeFileSync(tmpdir() + `/gamestate.worldguessr`, JSON.stringify({ games: gamesArr, players: playersArr,
    time: Date.now() }));
    console.log("Stored ", gamesArr.length, " games and ", playersArr.length, " players");
  } catch(e) {
    console.error('Failed to save gamestate', e, currentDate());
  }
}

process.on('SIGTERM', () => {
  stop('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  stop('SIGINT');
  process.exit(0);
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err, currentDate());
  stop('uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection', reason, promise, currentDate());
  stop('unhandledRejection');
});
// uWebSockets.js
let app = uws.App({

});
app.listen('0.0.0.0', port, (ws) => {
  if (ws) {
    log('**WS Server started on port** ' + port);
  }
});

app.get('/', (res, req) => {

      // count all the headers
      let headerKb = 0;
      req.forEach((key, value) => {

        headerKb += key.length + value.length;

      });
      headerKb = headerKb / 1024;


  setCorsHeaders(res);
  res.writeHeader('Content-Type', 'text/html');
  res.writeStatus('200 OK');
  res.end("WorldGuessr - Powered by uWebSockets.js<br>Headers: "+headerKb.toFixed(2)+'kb');
});

// maintenance mode
if (process.env.MAINTENANCE_SECRET) {
  const maintenanceSecret = process.env.MAINTENANCE_SECRET;
  app.get(`/setmaintenance/${maintenanceSecret}/true`, (res) => {
    maintenanceMode = true;
    // notify all players
    for (const player of players.values()) {
      player.send({
        type: 'restartQueued',
        value: true
      });
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/plain');
    res.end('ok');
    console.log('Maintenance mode started');

  });

  app.get(`/setmaintenance/${maintenanceSecret}/false`, (res) => {
    maintenanceMode = false;
    // notify all players
    for (const player of players.values()) {
      player.send({
        type: 'restartQueued',
        value: false
      });
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/plain');
    res.end('ok');
    console.log('Maintenance mode ended');
  });

  // get all players & ips
  app.get(`/getips/${maintenanceSecret}`, (res) => {
    const playerData = [];
    for (const player of players.values()) {
      playerData.push({
        id: player.id,
        username: player.username,
        ip: player.ip
      });
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(playerData));
  });
  app.get(`/banIp/${maintenanceSecret}/:ip`, (res, req) => {
    const ip = req.getParameter(0);
    bannedIps.add(ip);
    let cnt = 0;
    // kick all players with this ip
    for (const player of players.values()) {
      if (player.ip.includes(ip)) {
        player.ws.close();
        cnt++;
      }
    }

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/htmk');
    res.end('kick count: ' + cnt+'<br>banned ip: '+ip+'<br> all ips: '+[...bannedIps].join('<br>'));
    console.log('Banned ip', ip, 'kicked', cnt, currentDate());
  });
  app.get(`/unbanIp/${maintenanceSecret}/:ip`, (res, req) => {
    const ip = req.getParameter(0);
    bannedIps.delete(ip);

    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'text/plain');
    res.end('ok');
    console.log('Unbanned ip', ip, currentDate());
  });
  app.get(`/getIpCounts/${maintenanceSecret}`, (res) => {
    const ipCounts = [...ipConnectionCount.entries()].map(([ip, cnt]) => ({ ip, cnt }));
    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(ipCounts));
  });

}

const bannedIps = new Set();
const ipConnectionCount = new Map();
const ipDuelRequestsLast10 = new Map();

setInterval(() => {
  ipDuelRequestsLast10.clear();
}, 10000);

app.ws('/wg', {
  /* Options */
  compression: uws.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 60,
  /* Handlers */
  upgrade: (res, req, context) => {
    let ip =  req.getHeader('x-forwarded-for') || req.getHeader('cf-connecting-ip') || 'unknown';
    if(ip.includes(',')) {
      ip = ip.split(',')[0];
    }
    if([...bannedIps].some((bannedIp) => ip.includes(bannedIp))
       || ipConnectionCount.get(ip) && ipConnectionCount.get(ip) > 100) {
      console.log('Banned ip tried to connect', ip, currentDate());
      res.writeStatus('403 Forbidden');
      res.end();
      return;
    }
    res.upgrade({ id: uuidv4(), ip },
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'), context,
    );
  },

  open: (ws, req) => {
    const ip = ws.ip;
    const id = ws.id;
    const player = new Player(ws, id, ip);
    if(ip !== 'unknown') ipConnectionCount.set(ip, (ipConnectionCount.get(ip) || 0) + 1);


    player.send({
      type: 't',
      t: Date.now()
    })

    players.set(id, player);

    if (maintenanceMode) {
      player.send({
        type: 'restartQueued',
        value: true
      });
    } else {
      player.send({
        type: 'restartQueued',
        value: false
      });
    }

  },
  message: (ws, message, isBinary) => {
    try {
      // convert array buffer to string
      const str = new TextDecoder().decode(message);
      const json = JSON.parse(str);

      if (!json.type) {
        return;
      }

      if (!players.has(ws.id)) {
        return;
      }

      const player = players.get(ws.id);
      if (!player.verified && json.type !== 'verify') {
        return;
      }
      if (json.type === "pong") {
        player.lastPong = Date.now();
        return;
      }
      if (json.type === 'verify') {
        player.verify(json);
        return;
      }
      if (json.type === 'screen' && json.screen && typeof json.screen === 'string') {
        player.setScreen(json.screen);
      }

      if((json.type === 'unrankedDuel') && !player.gameId) {
        if(player.banned) {
          player.send({
            type: 'toast',
            key: 'unableToJoinDuel',
            toastType: 'error'
          });
          return;
        }

        player.inQueue = true;
        const queueDetails = {
          guest: player.accountId ? false : true,
          queueTime: Date.now(),
          duel: false
        }
        playersInQueue.set(player.id, queueDetails);
        if(player.ip !== 'unknown' && player.ip.includes('.')) {

          const ipOctets = player.ip.split('.').slice(0, 3).join('.');

          if (!ipDuelRequestsLast10.has(ipOctets)) {
            ipDuelRequestsLast10.set(ipOctets, 1);
          } else {
          log('Duel requests from ip', ipOctets, ipDuelRequestsLast10.get(ipOctets));

            ipDuelRequestsLast10.set(ipOctets, ipDuelRequestsLast10.get(ipOctets) + 1);
          }

          if (ipDuelRequestsLast10.get(ipOctets) > 50) {
            log('Banned IP due to spam', ipOctets);
            bannedIps.add(ipOctets);
            ws.close();

            for(const player of players.values()) {
              if(player.ip.includes(ipOctets)) {
                player.ws.close();
              }
            }
          }
        }

      }


      if ((json.type === 'publicDuel') && player.accountId &&  !player.gameId) {
        if(player.banned) {
          player.send({
            type: 'toast',
            key: 'unableToJoinDuel',
            toastType: 'error'
          });
          return;

        }
        // get range of league
        player.inQueue = true;

        if(!player.league) {

          const queueDetails = {
            guest: true,
            queueTime: Date.now(),
            duel: true
          }
          playersInQueue.set(player.id, queueDetails);

        } else {
          const range = getLeagueRange(player.league);


        const queueDetails = {
          min: range[0],
          max: range[1],
          elo: player.elo,
          guest: false,
          queueTime: Date.now(),
          duel: true
        }
        playersInQueue.set(player.id, queueDetails);

        // send the range to the player
        player.send({
          type: 'publicDuelRange',
          range
        });
      }
        if(player.ip !== 'unknown' && player.ip.includes('.')) {

        const ipOctets = player.ip.split('.').slice(0, 3).join('.');

        if (!ipDuelRequestsLast10.has(ipOctets)) {
          ipDuelRequestsLast10.set(ipOctets, 1);
        } else {
        log('Duel requests from ip', ipOctets, ipDuelRequestsLast10.get(ipOctets));

          ipDuelRequestsLast10.set(ipOctets, ipDuelRequestsLast10.get(ipOctets) + 1);
        }

        if (ipDuelRequestsLast10.get(ipOctets) > 50) {
          log('Banned IP due to spam', ipOctets);
          bannedIps.add(ipOctets);
          ws.close();

          for(const player of players.values()) {
            if(player.ip.includes(ipOctets)) {
              player.ws.close();
            }
          }
        }
      } else {
      }
      }


      if (json.type === 'leaveQueue' && player.inQueue) {
        player.inQueue = false;

        playersInQueue.delete(player.id);
      }

      if (json.type === 'place' && player.gameId && games.has(player.gameId)) {
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

      if (json.type === 'chat' && player.gameId && games.has(player.gameId)) {

        let message = json.message;
        const lastMessage = player.lastMessage || 0;
        if (typeof message !== 'string' || message.length < 1 || message.length > 200 || Date.now() - lastMessage < 500) {
          return;
        }
        const game = games.get(player.gameId);
        message = filter.clean(message);
        player.lastMessage = Date.now();
        game.sendAllPlayers({
          type: 'chat',
          id: player.id,
          name: player.username,
          message
        });
      }

      if (json.type === 'leaveGame' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        game.removePlayer(player);
      }

      if (json.type === "inviteFriend" && player.accountId && json.friendId && player.gameId) {
        // here friendId is the socket id
        const friend = players.get(json.friendId);
        if (!friend) {
          return;
        }

        const game = games.get(player.gameId);
        if (!game || game.public) {
          return;
        }

        // make sure the friend is not already in this game
        if (friend.gameId === player.gameId) {
          player.send({
            type: 'toast',
            key: 'alreadyInYourGame',
            toastType: 'error'
          });
          return;
        }

        // make sure the friend is friends with the player
        if (!player.friends.find((f) => f.id === friend.accountId)) {
          return;
        }

        if (Date.now() - friend.lastInvite < 5000) {
          player.send({
            type: 'toast',
            key: "inviteCooldown",
            t: ((5000 - (Date.now() - friend.lastInvite)) / 1000).toFixed(1)
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


      if (json.type === 'acceptInvite' && json.code && player.accountId) {
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
          if (player.inQueue) {
            player.inQueue = false;
            playersInQueue.delete(player.id);
          }

          // leave current game if in
          if (player.gameId) {
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
          if (friendPlayer && player.friends.find((f) => f.id === friendPlayer.accountId)) {
            friendPlayer.send({
              type: 'toast',
              key: 'inviteAcceptedBy',
              name: player.username,
              toastType: 'success'
            });
          }
        })
      }

      if (json.type === "setAllowFriendReq" && typeof json.allow === 'boolean' && player.accountId) {

        if (Date.now() - player.lastAllowFriendReqChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastAllowFriendReqChange) / 1000),
            toastType: 'error'
          });
          return;
        }
        player.lastAllowFriendReqChange = Date.now();
        player.allowFriendReq = json.allow;
        User.updateOne({ _id: player.accountId }, { allowFriendReq: json.allow }).then(() => {
          player.send({
            type: 'toast',
            key: 'preferenceUpdated'
          });
          player.sendFriendData();
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'createPrivateGame' && !player.gameId) {

        // send toast if maintenance
        if (maintenanceMode) {
          player.send({
            type: 'toast',
            key: 'maintenanceModeStarted',
            toastType: 'error'
          });
          return;
        }

        const gameId = uuidv4();
        // // options
        // let { rounds, timePerRound, locations, maxDist, location, nm, npz, showRoadName } = json;
        // rounds = Number(rounds);
        // // maxDist no longer required-> can be pulled from community map
        // if (!location) return;
        // if (!rounds || !timePerRound) {
        //   return;
        // }
        // // if(!locations || !Array.isArray(locations) || locations.length < 1 || locations.length > 20) return;
        // if (rounds < 1 || rounds > 20 || timePerRound < 10 || timePerRound > 300) {
        //   return;
        // }

        // if(!nm) nm = false;
        // if(!npz) npz = false;
        // if(!showRoadName) showRoadName = false;


        const game = new Game(gameId, false);
        // game.timePerRound = timePerRound * 1000;
        // game.nm = !!nm;
        // game.npz = !!npz;
        // game.showRoadName = !!showRoadName;

        // game.locations = locations;
        // game.location = location;
        // if (maxDist) game.maxDist = maxDist;

        games.set(gameId, game);

        game.addPlayer(player, true);
      }

      if(json.type === "resetGame" && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // make sure player is host
        if(game.players[player.id].host) {
          game.resetGame(allLocations);
        }
      }


      if(json.type === "setPrivateGameOptions" && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // make sure player is host
        if(game.players[player.id].host) {
          let { rounds, timePerRound, location, nm, npz, showRoadName, displayLocation } = json;
          rounds = Number(rounds);

          // maxDist no longer required-> can be pulled from community map
          if (!location) return;
          if (!rounds || !timePerRound) {
            return;
          }
          // make sure displayLocation isa string
          if (typeof displayLocation !== 'string') {
            displayLocation = null;
          }
          if(displayLocation) {
            // trim to 30 characters
            displayLocation = displayLocation.substring(0, 30);

          }
          // if(!locations || !Array.isArray(locations) || locations.length < 1 || locations.length > 20) return;
          if (rounds < 1 || rounds > 20 || timePerRound < 10 || (timePerRound > 300 && timePerRound !== 60*60*24 )) {
            return;
          }

          if(!nm) nm = false;
          if(!npz) npz = false;
          if(!showRoadName) showRoadName = false;

          game.timePerRound = timePerRound * 1000;
          game.nm = !!nm;
          game.npz = !!npz;
          game.showRoadName = !!showRoadName;
          game.location = location;
          // clear current locations
          game.locations = [];
          game.rounds = rounds;
          game.displayLocation = displayLocation;

          // generate locations
          game.generateLocations(allLocations);

          game.sendStateUpdate(true);

        }
      }

      if (json.type === 'joinPrivateGame' && !player.gameId) {
        let code = json.gameCode;

        // find game by code
        joinGameByCode(code, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Game is full'
          });
        }, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Invalid game code'
          });
        }, (game) => {
          game.addPlayer(player);
        });
      }

      if (json.type === 'startGameHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.players[player.id].host) {


          game.start();
        }
      }

      if (json.type === 'getFriends') {
        player.sendFriendData();
      }

      if (json.type === 'sendFriendRequest') {
        if (!player.accountId) {
          player.send({ type: 'friendReqState', state: 0 })
          return;
        }
        if (!json.name || typeof json.name !== "string" || json.name.length < 3 || json.name.length > 30 || !/^[a-zA-Z0-9_]+$/.test(json.name)) {
          player.send({ type: 'friendReqState', state: 0 })
          return;
        }
        // cannot have more than 100 friends
        if (player.friends.length > 100) {
          player.send({ type: 'friendReqState', state: 7 })
          return;
        }
        // cannot have more than 100 sent reqs
        if (player.sentReq.length > 100) {
          player.send({ type: 'friendReqState', state: 7 })
          return;
        }
        User.findOne({ username: { $regex: new RegExp('^' + json.name + '$', "i") } }).then(async (friend) => {
          if (!friend) {
            player.send({ type: 'friendReqState', state: 3 })
            return;
          }
          if (!friend.allowFriendReq) {
            player.send({ type: 'friendReqState', state: 2 })
            return;
          }
          // cannot have more than 100 received requests
          if (friend.receivedReq.length > 100) {
            player.send({ type: 'friendReqState', state: 7 })
            return;
          }
          if (friend._id.toString() === player.accountId) {
            player.send({ type: 'friendReqState', state: 7 })
            return;
          }
          if (player.friends.findIndex((f) => f.id === friend._id.toString()) > -1) {
            player.send({ type: 'friendReqState', state: 6 })
            return;
          }
          if (player.sentReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
            player.send({ type: 'friendReqState', state: 4 })
            return;
          }
          // cannot have a friedn request received from this user
          if (player.receivedReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
            player.send({ type: 'friendReqState', state: 5 })
            return;
          }

          // update mongodb
          await User.updateOne({ _id: player.accountId }, { $push: { sentReq: friend._id.toString() } });
          await User.updateOne({ _id: friend._id }, { $push: { receivedReq: player.accountId } });

          // update player
          player.sentReq.push({ id: friend._id.toString(), name: friend.username, supporter: friend.supporter });
          player.sendFriendData();
          player.send({ type: 'friendReqState', state: 1 })

          // is user online
          const friendPlayer = Array.from(players.values()).find((p) => p.accountId === friend._id.toString());
          if (friendPlayer) {
            friendPlayer.send({ type: 'friendReq', id: player.accountId, name: player.username });

            friendPlayer.receivedReq.push({ id: player.accountId, name: player.username, supporter: player.supporter });
            friendPlayer.sendFriendData();
          }
        }).catch((e) => {
          console.log(e);
        });


      }

      if (json.type === 'cancelRequest' && player.accountId && json.id) {
        if (typeof json.id !== "string") {
          return;
        }

        // check if the request exists (player side)
        const exists = player.sentReq.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        player.sentReq.splice(exists, 1);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.receivedReq.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.receivedReq.splice(exists, 1);
            friendPlayer.sendFriendData();
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { sentReq: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { receivedReq: player.accountId } }).then(() => {

            player.sendFriendData();
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'acceptFriend' && player.accountId && json.id) {
        // check if the request exists (player side)
        const exists = player.receivedReq.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        const friend = player.receivedReq.splice(exists, 1)[0];
        player.friends.push(friend);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.sentReq.splice(exists, 1);
            friendPlayer.friends.push({ id: player.accountId, name: player.username.toString(), supporter: player.supporter });
            friendPlayer.sendFriendData();
            // friendPlayer.send({type:'newFriend', id: player.accountId, name: player.username});
            friendPlayer.send({ type: 'toast', key: 'newFriend', name: player.username, toastType: 'success' });
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { receivedReq: json.id }, $push: { friends: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { sentReq: player.accountId }, $push: { friends: player.accountId } }).then(() => {

            player.sendFriendData();
            // player.send({type:'newFriend', id: json.id, name: friend.name});
            player.send({ type: 'toast', key: 'newFriend', name: friend.name, toastType: 'success' });
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'declineFriend' && player.accountId && json.id) {
        // check if the request exists (player side)
        const exists = player.receivedReq.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        player.receivedReq.splice(exists, 1);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.sentReq.splice(exists, 1);
            friendPlayer.sendFriendData();
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { receivedReq: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { sentReq: player.accountId } }).then(() => {

            player.sendFriendData();
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

      if (json.type === 'removeFriend' && player.accountId && json.id) {
        // check if the request exists (player side)
        const exists = player.friends.findIndex((f) => f.id === json.id);
        if (exists === -1) {
          return;
        }
        // remove from player
        player.friends.splice(exists, 1);

        const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
        if (friendPlayer) {
          const exists = friendPlayer.friends.findIndex((f) => f.id === player.accountId);
          if (exists > -1) {
            friendPlayer.friends.splice(exists, 1);
            friendPlayer.sendFriendData();
          }
        }
        // remove from mongodb
        User.updateOne({ _id: player.accountId }, { $pull: { friends: json.id } }).then(() => {
          User.updateOne({ _id: json.id }, { $pull: { friends: player.accountId } }).then(() => {

            player.sendFriendData();
          }).catch((e) => {
            console.log(e);
          });
        }).catch((e) => {
          console.log(e);
        });
      }

    } catch (e) {
      console.log(e);
    }
  },
  drain: (ws) => {
    console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
  },
  close: (ws, code, message) => {
    ipConnectionCount.set(ws.ip, ipConnectionCount.get(ws.ip) - 1);
    if(ipConnectionCount.get(ws.ip) < 1) {
      ipConnectionCount.delete(ws.ip);
    }

    console.log(players.has(ws.id), ws.id, players.size);
    if (players.has(ws.id)) {
      const player = players.get(ws.id);

      // handle case where user just made an account and name is not set
      if(!player.username) {
        // disconnect the player
        if(player.gameId) {
          const game = games.get(player.gameId);
          game.removePlayer(player);
        }

        players.delete(ws.id);

      } else {
      player.ws = null;
      player.inQueue = false;
      player.disconnectTime = Date.now();
      player.disconnected = true;
      disconnectedPlayers.set(player.accountId??player.rejoinCode, player.id);
      }
      console.log('Player disconnected', player.username, player.id, currentDate());
    }
    if (playersInQueue.has(ws.id)) {
      playersInQueue.delete(ws.id);
    }

  }
});



// check if gamestate can be recovered from os.tmpdir+gamestate.worldguessr
try {
  const gamestate = JSON.parse(fs.readFileSync(tmpdir() + `/gamestate.worldguessr`));
  if (gamestate && Date.now() - gamestate.time < 1000 * 60) {
    console.log('Recovered gamestate', gamestate.games.length, 'games', gamestate.players.length, 'players');

    for (const player of gamestate.players) {
      const newPlayer = Player.fromJSON(player);
      newPlayer.disconnectTime = Date.now(); // important
      newPlayer.disconnected = true;
      if(newPlayer.inQueue) {
        newPlayer.inQueue = false;
      }
      players.set(player.id, newPlayer);
      disconnectedPlayers.set(player.accountId??player.rejoinCode, player.id);
    }
    for (const game of gamestate.games) {
      console.log(game.id);
      const newGame = Game.fromJSON(game);
      games.set(game.id, newGame);
    }

    console.log('Recovered gamestate successfully');
    // remove the file

    fs.unlinkSync(tmpdir() + `/gamestate.worldguessr`);

  }
} catch(e) {
}


  // update player count
  setInterval(() => {

    for (const player of players.values()) {
      if (player.verified && !player.gameId) {
        player.send({
          type: 'cnt',
          c: players.size-disconnectedPlayers.size
        });
      }
      player.send({
        type: 't',
        t: Date.now()
      });
    }

    if(maintenanceMode) {
      // log count of players in active games
      let playerCnt = 0;
      let unstartedGames = 0;
      for(const game of games.values()) {
        if(game.state === 'waiting') {
          unstartedGames++;
        } else {
          playerCnt += Object.keys(game.players).length;
        }
      }
      console.log('Players in active games', playerCnt);
      console.log('Unstarted games', unstartedGames);

    }
  }, 5000);

  function findDuelPairs(duelQueue) {
    const pairs = [];
    const matchedPlayers = new Set();

    // Convert Map to an array for efficient iteration
    const entries = Array.from(duelQueue.entries()).filter(r => r[1].duel);

    // Loop through each player in the queue
    for (let i = 0; i < entries.length; i++) {
      const [id1, { min, max, elo, guest }] = entries[i];

      // Skip this player if already matched
      if (matchedPlayers.has(id1)) continue;

      // Check if player1 is a guest
      if (guest) {
        // Look for another guest to pair with
        for (let j = i + 1; j < entries.length; j++) {
          const [id2, { min: min2, max: max2, elo: elo2, guest: guest2 }] = entries[j];

          if (guest2 && !matchedPlayers.has(id2)) {
            pairs.push([id1, id2]);
            matchedPlayers.add(id1);
            matchedPlayers.add(id2);
            break;
          }
        }
      } else {
        // Find a suitable ELO-based pair for non-guest player1
        for (let j = i + 1; j < entries.length; j++) {
          const [id2, { min: min2, max: max2, elo: elo2, guest: guest2 }] = entries[j];

          // Skip if already matched or if player2 is a guest
          if (matchedPlayers.has(id2) || guest2) continue;

          // Check if each player falls within the other's acceptable ELO range
          if (elo >= min2 && elo <= max2 && elo2 >= min && elo2 <= max) {
            pairs.push([id1, id2]);
            matchedPlayers.add(id1);
            matchedPlayers.add(id2);
            break;
          }
        }
      }
    }

    return pairs;
  }



  // queue handler
  setInterval(() => {


    const minRoundsRemaining = 3;
    for (const game of games.values()) {

      const playerCnt = Object.keys(game.players).length;
      // start games that have at least 2 players
      if (game.state === 'waiting' && playerCnt > 1 && game.public && game.rounds === game.locations.length) {
        game.start();
      } else if (game.state === 'getready' && Date.now() > game.nextEvtTime) {
        if(game.curRound > game.rounds || game.readyToEnd) {
          game.end();
          // game over

        } else {
        game.state = 'guess';
        game.nextEvtTime = Date.now() + game.timePerRound;
        game.clearGuesses();

        game.sendStateUpdate();
        }

      } else if (game.state === 'guess' && Date.now() > game.nextEvtTime) {
        game.givePoints();
        if(game.curRound <= game.rounds) {
          game.curRound++;
          game.state = 'getready';
          game.nextEvtTime = Date.now() + game.waitBetweenRounds - (game.curRound > game.rounds ? 5000: 0);
          game.sendStateUpdate();


        } else {
          // game over
          game.end()
        }
      }

      if(game.state === 'end' && Date.now() > game.nextEvtTime) {
        // remove game if public
        if(game.public) {
        game.shutdown()
        } else {
          game.resetGame(allLocations);
        }
      }


      // find games that can be joined
      // unranked (meaning non duel) public games
      if (playersInQueue.size < 1) {
        continue;
      }
      if (!game.public || game.duel) {
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
      for (const playerData of playersInQueue) {
        const playerId = playerData[0];
        const queueData = playerData[1];
        if (queueData.duel) {
          continue;
        }
        const player = players.get(playerId);
        if(!player) {
          playersInQueue.delete(playerId);
          continue;
        }
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

    if (playersInQueue.size > 1 && [...playersInQueue.values()].filter(r => !r.duel).length > 1) {
      // create a new public game (non duel)
      const gameId = uuidv4();
      const game = new Game(gameId, true, undefined, undefined, allLocations);
      games.set(gameId, game);

      let playersCanJoin = game.maxPlayers;
      for (const playerData of playersInQueue) {
        const playerId = playerData[0];
        const player = players.get(playerId);
        if (player.gameId) {
          continue;
        }
        if(playerData[1].duel) {
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

    if (playersInQueue.size >= 1) {
      const pairs = findDuelPairs(playersInQueue);
      for(const pair of pairs) {
        const [id1, id2] = pair;
        const p1 = players.get(id1);
        const p2 = players.get(id2);

        const gameId = uuidv4();
        const game = new Game(gameId, true, undefined, undefined, allLocations, true);
        games.set(gameId, game);

        game.addPlayer(p1, undefined, "p1");
        game.addPlayer(p2, undefined, "p2");
        playersInQueue.delete(id1);
        playersInQueue.delete(id2);

        // check if both have elo
        if(p1.elo && p2.elo) {
          // calculate elo change if p1 wins,loses,draws
          // calculate elo change if p2 wins,loses,draws

          const eloP1Win = calculateOutcomes(p1.elo, p2.elo, 1);
          const eloDraw = calculateOutcomes(p1.elo, p2.elo, 0.5);
          const eloP2Win = calculateOutcomes(p1.elo, p2.elo, 0);

          game.eloChanges = {
            [p1.id]: eloP1Win,
            [p2.id]: eloP2Win,
            draw: eloDraw
          }


          game.accountIds = {
            p1: p1.accountId,
            p2: p2.accountId
          }

          if(p1.elo > 2000 && p2.elo > 2000) {
            // use arbitrary world map to make it harder
            game.locations = pick5RandomArb();
          }


        }

        game.pIds = {
          p1: p1.id,
          p2: p2.id
        }

        // start the game
        game.start();

      }

      // remaining players in queue check if wait was longer than 10 seconds, in that case set their elo range to infinity
      for(const playerId of playersInQueue) {
        const player = players.get(playerId[0]);
        const queueData = playerId[1];
        if(!queueData.guest && queueData.duel && Date.now() - queueData.queueTime > 10000) {
          playersInQueue.set(playerId[0], { ...queueData, min: 0, max: 10000, queueTime: Date.now() });

          player.send({
            type: 'publicDuelRange',
            range: [0, 10000]
          });
        }
      }
    }

    // loop through disconnected players and remove them if they have been disconnected for more than 30 seconds
    for(const [accountId, playerId] of disconnectedPlayers) {
      const player = players.get(playerId);
      if(!player) {
        disconnectedPlayers.delete(accountId);
        continue;
      }
      if(Date.now() - player.disconnectTime > 30000) {
        disconnectedPlayers.delete(accountId);
        if (player.gameId) {
          const game = games.get(player.gameId);
          if (game) {
            game.removePlayer(player, true);
          }
        }

        players.delete(playerId);
      }
    }

  }, 500);




  if(!dev && dbEnabled) {
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


  setInterval(() => {
    // log player count, game count, memory usage
    const memUsage = process.memoryUsage().heapUsed;
    const gameCnt = games.size;
    const playerCnt = players.size;
    console.log('Players:', playerCnt, 'Games:', gameCnt, 'Memory:', memUsage);
  }, 5000)
  // // Check for pong messages and disconnect inactive clients
  // setInterval(() => {
  //   const currentTime = Date.now();
  //   players.forEach((player) => {
  //     if (currentTime - player.lastPong > 60000) { // 60 seconds timeout
  //       console.log(`Disconnecting inactive player ${player.id}`);
  //       player.ws.close(); // Disconnect the player
  //     }
  //   });
  // }, 10000); // Check every 10 seconds