import uws from 'uWebSockets.js';
import fs from 'fs';
import { config } from 'dotenv';
import Player from './classes/Player.js';
import { v4 as uuidv4 } from 'uuid';
import User, { USERNAME_COLLATION } from '../models/User.js';
import mongoose from 'mongoose';
import Game from './classes/Game.js';
import setCorsHeaders from '../serverUtils/setCorsHeaders.js';
import { getActivePlayerCount, getPlatformDistribution } from '../serverUtils/playerCounts.js';

import lookup from "coordinate_to_country"
import { players, games, disconnectedPlayers, playersInQueue } from '../serverUtils/states.js';
import Memsave from '../models/Memsave.js';
import blockedAt from 'blocked-at';
import { getLeagueRange, leagues } from '../components/utils/leagues.js';
import calculateOutcomes from '../components/utils/eloSystem.js';
import { tmpdir } from 'os';

import arbitraryWorld from '../data/world-arbitrary.json' with { type: "json" };
import {
  BOTS_ENABLED, BOTS_INSTANT,
  createBotPlayer, makeBotUsername, refreshBotEligibility, tickBots
} from './botUtils.js';
config();

console.log("[INFO] Starting ws.js")
global.serverStartTime = Date.now();


import { createClient } from 'redis';

let redisClient;
if(!process.env.REDIS_URI) {
  console.log("[MISSING-ENV WARN] REDIS_URI env variable not set");
} else {
redisClient = createClient({
  url: process.env.REDIS_URI,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

const main = async () => {
  await redisClient.connect();
  console.log('Connected to Redis');
};


main();
}

function normalizeArbLoc(r) {
  const loc = { lat: r.lat, long: r.lng, country: r.country || 'unknown' };
  if (r.heading !== undefined && r.heading !== null) loc.heading = r.heading;
  if (r.pitch !== undefined && r.pitch !== null) loc.pitch = r.pitch;
  if (r.panoId) loc.panoId = r.panoId;
  return loc;
}

function pick5RandomArb() {
  const rand = new Set();
  while(rand.size < 5) {
    rand.add(arbitraryWorld[Math.floor(Math.random() * arbitraryWorld.length)]);
  }
  return [...rand].map(normalizeArbLoc);
}

// 2v2 team duels: each round draws 50/50 from the standard world pool and the
// arbitrary pool (the harder map high-elo 1v1 duels play on). A coin flip per
// round rather than a pool merge, so the mix holds regardless of pool sizes.
function pick5WorldArbMix(worldPool) {
  const seen = new Set();
  const locs = [];
  while (locs.length < 5) {
    const fromArb = Math.random() < 0.5;
    const pool = fromArb ? arbitraryWorld : worldPool;
    const r = pool[Math.floor(Math.random() * pool.length)];
    if (seen.has(r)) continue;
    seen.add(r);
    locs.push(fromArb ? normalizeArbLoc(r) : r);
  }
  return locs;
}


// init state vars
const dev = process.env.NODE_ENV !== 'production'
const port = process.env.WS_PORT || 3002;

const lastDuelOpponent = new Map(); // accountId -> accountId (prevents same matchup twice in a row)

let maintenanceMode = false;
let dbEnabled = true;

//get current date &time in cst
function currentDate() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
}

// location generator
let allLocations = [{"lat":59.94945834525827,"long":10.74877784715781,"country":"NO"},{"lat":-22.41504758873939,"long":-42.95073348255873,"country":"BR"},{"lat":7.117061549697593,"long":6.737664188991607,"country":"NG"},{"lat":43.11066098012346,"long":141.5910123338441,"country":"JP"},{"lat":49.88659404088488,"long":-99.9475096434099,"country":"CA"},{"lat":46.720999413096,"long":19.86240516067642,"country":"HU"}];

const generateMainLocations = async () => {
  try {
  fetch('http://localhost:3003/allCountries.json').then(async (res) => {
    const data = await res.json();
    if(data.locations && Array.isArray(data.locations) && data.locations.length > 0) {
      allLocations = data.locations;

    } else {
      console.error('Failed to load locations', currentDate);
    }

  }).catch((e) => {
    console.error('Failed to load locations', currentDate());
  });
} catch(e) {
  console.error('Failed to load locations', currentDate());
}


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
  console.log("[MISSING-ENV WARN] MONGODB env variable not set");
  dbEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
    } catch (error) {
      console.error('[ERROR] Database connection failed!', error.message);
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

app.get('/playercnt', (res) => {
  setCorsHeaders(res);
  res.writeHeader('Content-Type', 'text/plain');
  res.writeStatus('200 OK');
  res.end(String(getActivePlayerCount()));
});

app.get('/platformdist', (res) => {
  setCorsHeaders(res);
  res.writeHeader('Content-Type', 'application/json');
  res.writeStatus('200 OK');
  res.end(JSON.stringify(getPlatformDistribution()));
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
    try {

      if (player.ip.includes(ip)) {
        if (player.ws) player.ws.close();
        else {
          console.log('Player with matching IP has no WebSocket connection', player.username, player.ip, currentDate());
        }
        cnt++;
      }
      } catch(e) {
    console.error('Error banning IP', e, currentDate());
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

  app.get(`/enforce-ban/${maintenanceSecret}/:accountId`, (res, req) => {
    const accountId = req.getParameter(0);

    if (!accountId) {
      setCorsHeaders(res);
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: 'Account ID required',
        playerFound: false
      }));
      return;
    }

    // Find player by accountId
    const player = Array.from(players.values()).find(p => p.accountId === accountId);

    if (!player) {
      // Player not connected - this is OK, return success
      setCorsHeaders(res);
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        playerFound: false,
        playerDisconnected: false,
        wasInGame: false,
        message: 'Player not currently connected'
      }));
      console.log('Ban enforcement: Player not connected', accountId, currentDate());
      return;
    }

    let gameInfo = {
      wasInGame: false,
      gameId: null,
      gameType: null,
      opponentRefunded: false,
      opponentAccountId: null
    };

    // Handle active game
    if (player.gameId && games.has(player.gameId)) {
      const game = games.get(player.gameId);
      gameInfo.wasInGame = true;
      gameInfo.gameId = game.id;

      // Determine game type
      if (game.duel && game.public) {
        gameInfo.gameType = 'ranked_duel';

        // For ranked duels, identify opponent
        const playerTag = Object.values(game.players).find(p => p.id === player.id)?.tag;
        if (playerTag && game.accountIds) {
          // Find opponent
          const opponentTag = playerTag === 'p1' ? 'p2' : 'p1';
          const opponentAccountId = game.accountIds[opponentTag];

          if (opponentAccountId) {
            gameInfo.opponentAccountId = opponentAccountId;
            gameInfo.opponentRefunded = true; // Opponent will win via forfeit logic
          }
        }
      } else if (game.public) {
        gameInfo.gameType = 'unranked_multiplayer';
      } else {
        gameInfo.gameType = 'private_multiplayer';
      }

      // Remove player from game (will trigger game.end() if duel)
      game.removePlayer(player, true);
    }

    // Close WebSocket connection
    try {
      player.ws.close();
      console.log('Ban enforcement: Disconnected player', player.username, accountId, currentDate());
    } catch (e) {
      console.error('Ban enforcement: Error closing WebSocket', e, currentDate());
    }

    // Return success response
    setCorsHeaders(res);
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      playerFound: true,
      playerDisconnected: true,
      ...gameInfo,
      message: gameInfo.wasInGame
        ? `Player banned and disconnected from ${gameInfo.gameType}${gameInfo.opponentRefunded ? '. Opponent will be awarded win.' : ''}`
        : 'Player banned and disconnected'
    }));
  });

}

const bannedIps = new Set();
const ipConnectionCount = new Map();
const ipDuelRequestsLast10 = new Map();

setInterval(() => {
  ipDuelRequestsLast10.clear();
}, 10000);

function updateGameOptions(game, rounds=5, timePerRound=30, location="all", nm=false, npz=false, showRoadName=true, displayLocation="World") {
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
          game.rounds = Number(rounds);
          game.displayLocation = displayLocation;

          // generate locations
          game.generateLocations(allLocations);

          game.sendStateUpdate(true);

        }
app.ws('/wg', {
  /* Options */
  compression: uws.SHARED_COMPRESSOR,
  maxPayloadLength: 64 * 1024 * 1024,
  idleTimeout: 300,
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
    const connectTime = Date.now();

    // Store connection time for disconnect analysis
    ws.connectTime = connectTime;

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
        // Legacy keepalive — old web bundles and the mobile app still send
        // this every 10s. Nothing reads it (liveness uses the timeSync
        // round-trip); swallow it early instead of walking the whole chain.
        return;
      }
      if (json.type === "timeSync") {
        if (typeof json.clientSentAt === "number") {
          player.send({
            type: "timeSync",
            clientSentAt: json.clientSentAt,
            serverNow: Date.now()
          });
        }
        return;
      }
      if (json.type === 'verify') {
        // verify() is async and awaits several DB calls (validateSecret, friend
        // hydration, lastLogin update). A transient DB rejection used to bubble up as an
        // unhandledRejection — which logs + writes gamestate via stop() on every blip —
        // and left the client wedged OPEN-but-unverified with no signal at all. Catch it:
        //  • if the player never got verified, the failure was on the auth-critical path
        //    (before `verify` was sent) — tell the client so it stops waiting and retries
        //    (its verify-ack timer paces the reconnect). NOT failedToLogin: that logs the
        //    user out, but a DB blip is transient and safe to retry.
        //  • if it already verified, the failure was in the non-critical tail (friend
        //    list / lastLogin) and the client is fine — just log, don't disrupt it.
        player.verify(json).catch((e) => {
          console.error('Error verifying player', ws.id, e?.message || e, currentDate());
          if (!players.has(ws.id)) return;
          const p = players.get(ws.id);
          if (!p.verified) {
            p.send({ type: 'error', message: 'verifyError' });
          }
        });
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
        // Explicitly confirm the join so the client has a signal the queue
        // actually registered. Without this the unranked queue sent nothing back
        // and the client would spin on the matchmaking screen forever if the join
        // was dropped (e.g. socket hiccup) or silently rejected.
        player.send({ type: 'queueJoined', ranked: false });
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


      // Instant testing mode admits guests to ranked: no accountId → the
      // finishers persist nothing (two-account save gate + setElo account
      // guards), so the match is pure feel — stamp a display elo for the
      // matchup math.
      if ((json.type === 'publicDuel') && (player.accountId || BOTS_INSTANT) && !player.gameId) {
        if(player.banned) {
          player.send({
            type: 'toast',
            key: 'unableToJoinDuel',
            toastType: 'error'
          });
          return;

        }
        if (BOTS_INSTANT && !player.elo) player.elo = 1000;
        // get range of league
        player.inQueue = true;
        // Bot backfill: stamp fresh W/L eligibility on the Player (async,
        // fire-and-forget — backfill only trusts an explicit true, so it
        // kicks in on the first tick after this read resolves).
        refreshBotEligibility(player);

        if(!player.league) {

          const queueDetails = {
            guest: true,
            queueTime: Date.now(),
            duel: true
          }
          playersInQueue.set(player.id, queueDetails);
          // No league => no publicDuelRange below, so this is the only join ack
          // the client gets for this case.
          player.send({ type: 'queueJoined', ranked: true });

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
        // Uniform join ack across all queue branches (publicDuelRange alone is
        // ELO-display info; queueJoined is the canonical "you're queued" signal).
        player.send({ type: 'queueJoined', ranked: true });
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


      if (json.type === 'leaveQueue') {
        const entry = playersInQueue.get(player.id);
        player.inQueue = false;
        playersInQueue.delete(player.id);

        // A cancel can race the pairing beat: pair2v2Solos just de-queued
        // this player for the "Queueing in 3…" preview, so there's no queue
        // entry — but the lobby's auto-queue is armed and about to queue them
        // into the pairing they declined. Dropping the message here (the old
        // `player.inQueue` guard) made Cancel a no-op mid-preview.
        const lobby = player.gameId ? games.get(player.gameId) : null;
        const pendingAutoQueue = !entry && lobby && !lobby.public
          && lobby.state === 'waiting' && !!lobby.autoQueue2v2At;

        if (entry?.mode === '2v2' || pendingAutoQueue) {
          // 2v2 lobbies survive matchmaking, so a cancel returns the WHOLE
          // group (host + teammate) to the same lobby and code. Re-sending the
          // lobby state is enough — the client's `game` handler snaps queued
          // players back into the lobby screen.
          if (lobby && !lobby.public && lobby.state === 'waiting' && lobby.autoPaired) {
            // AUTO-FOUND teammate (stage-1 pairing): cancel dissolves the
            // pairing instead of parking two strangers in a shared lobby.
            // The host keeps this lobby (it was theirs before the pairing);
            // the non-host gets their own fresh lobby back. Whoever did NOT
            // cancel resumes the teammate search in the same burst as their
            // lobby snapshot — a deferred 3s auto-queue stamp here painted a
            // disabled "Queueing in 3…" button the partner couldn't cancel.
            lobby.autoQueue2v2At = null; // mid-preview cancel — disarm the pending auto-queue
            const members = Object.values(lobby.players);
            for (const member of members) {
              const sock = players.get(member.id);
              if (!sock) continue;
              sock.inQueue = false;
              playersInQueue.delete(member.id);
            }
            lobby.autoPaired = false;
            const nonHostEntry = members.find((m) => !m.host);
            const nonHost = nonHostEntry ? players.get(nonHostEntry.id) : null;
            if (nonHost) {
              lobby.removePlayer(nonHost, true); // quiet — no gameShutdown
              const fresh = new Game(uuidv4(), { is2v2Lobby: true });
              games.set(fresh.id, fresh);
              fresh.addPlayer(nonHost, true); // sends them the fresh lobby state
              // State BEFORE queue: the client's `game` handler wipes
              // gameQueued, so enter2v2Queue must follow the snapshot.
              if (nonHost.id !== player.id) queue2v2Members(fresh);
            }
            // By the .host field, not insertion order — [0] only worked via the
            // implicit "host added first, roster capped at 2" invariants.
            const roster = Object.values(lobby.players);
            const hostEntry = roster.find(p => p.host) || roster[0];
            const hostSock = hostEntry ? players.get(hostEntry.id) : null;
            if (hostSock) {
              hostSock.send(lobby.getInitialSendState(hostSock));
              if (hostSock.id !== player.id) queue2v2Members(lobby);
            }
          } else if (lobby && !lobby.public && lobby.state === 'waiting') {
            // CHOSEN teammate (invited / joined by code): the duo belongs
            // together — return the whole group to their shared lobby.
            // Disarm any pending auto-queue (pregame-regroup countdown) so
            // the poll can't re-queue the group right after this restore.
            lobby.autoQueue2v2At = null;
            for (const member of Object.values(lobby.players)) {
              const sock = players.get(member.id);
              if (!sock) continue;
              sock.inQueue = false;
              playersInQueue.delete(member.id);
              sock.send(lobby.getInitialSendState(sock));
            }
          } else {
            // No restorable lobby (never had one, or it's gone/stale) — put
            // them in a fresh one so a 2v2 cancel always lands somewhere
            // instead of leaving the client on the pending lobby shell.
            const gameId = uuidv4();
            const fresh = new Game(gameId, { is2v2Lobby: true });
            games.set(gameId, fresh);
            fresh.addPlayer(player, true);
          }
        }
      }

      if (json.type === 'place' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const latLong = json.latLong;
        const final = json.final;
        const round = json.round;

        // make sure latLong is an array of floats with 2 elements
        if (!Array.isArray(latLong) || latLong.length !== 2) {
          return;
        }

        // make sure final is a boolean
        if (typeof final !== 'boolean') {
          return;
        }

        // validate round if provided (new clients send it, old clients may not)
        if (round !== undefined && round !== null) {
          if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) {
            return;
          }
        }

        game.setGuess(player.id, latLong, final, round);
      }

      if (json.type === 'emote' && player.gameId && games.has(player.gameId)) {
        const emote = json.emote;
        if (!Number.isInteger(emote) || emote < 0 || emote > 9) return;
        const lastEmote = player.lastEmote || 0;
        if (Date.now() - lastEmote < 1500) return;
        const game = games.get(player.gameId);
        player.lastEmote = Date.now();
        game.sendAllPlayers({
          type: 'emote',
          id: player.id,
          name: player.username,
          countryCode: player.countryCode || null,
          // 'a' | 'b' in team modes (2v2 duels + team parties), null otherwise —
          // clients color the reaction bubble by allegiance.
          team: game.players[player.id]?.team ?? null,
          emote
        });
      }

      if (json.type === 'leaveGame' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        game.removePlayer(player);
      }

      // ── Post-game team-duel results actions ──────────────────────────────
      // playAgain2v2: consensus requeue. Ack; when every LIVING teammate has
      // acked, the team regroups into a fresh staging lobby and goes straight
      // into matchmaking (duo → opponents search, solo → teammate search).
      if (json.type === 'playAgain2v2' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const me = game.players[player.id];
        if (game.teamDuel && game.state === 'end' && me?.team) {
          game.playAgainAcks = game.playAgainAcks || { a: {}, b: {} };
          game.playAgainAcks[me.team][player.id] = true;
          const { needed, ackedIds } = game.livingTeamPlayAgain(me.team);
          if (needed >= 1 && ackedIds.length >= needed) {
            // Queue in the same burst as the lobby's `game` payload — leaving
            // it to the 500ms autoQueue2v2At poll makes the client paint the
            // staging lobby for up to one tick before the queue screen.
            const lobby = game.regroupTeamFromResults(me.team, { queue: true });
            if (lobby) queue2v2Members(lobby);
          } else {
            game.sendPlayAgainState(me.team);
          }
        }
      }

      // teamDuelBack: leave the results for a staging lobby WITHOUT queueing.
      // Auto-paired members act solo (the pairing dissolves); a chosen duo's
      // host takes the whole team back together; chosen guests have no
      // in-screen Back (client hides it — this guard enforces it) unless
      // they're the last one standing.
      if (json.type === 'teamDuelBack' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const me = game.players[player.id];
        if (game.teamDuel && game.state === 'end' && me?.team) {
          const team = me.team;
          const isChosen = !game.autoPairedTeams?.[team];
          const isHost = game.teamHostIds?.[team] === player.id;
          const living = game.teamMembers(team).length;
          if (isChosen && !isHost && living > 1) return;
          game.regroupTeamFromResults(team, {
            onlyPlayerId: (isChosen && isHost) ? null : player.id,
            queue: false
          });
        }
      }

      // Results-screen buttons must never dead-click: if the ended game is
      // already gone from under the client (2h idle sweep, server restart),
      // restage the sender in a fresh solo staging lobby instead of silently
      // dropping the message — Play Again queues it (stage-1 teammate
      // search), Back just parks there. inQueue means they're not on a
      // results screen; a live gameId means the handlers above own it.
      if ((json.type === 'playAgain2v2' || json.type === 'teamDuelBack')
          && (!player.gameId || !games.has(player.gameId)) && !player.inQueue) {
        const lobby = new Game(uuidv4(), { is2v2Lobby: true });
        games.set(lobby.id, lobby);
        if (json.type === 'playAgain2v2') lobby.autoQueue2v2At = Date.now();
        lobby.addPlayer(player, true);
        // Same-burst queue as the consensus path above — no 500ms poll wait.
        if (json.type === 'playAgain2v2') queue2v2Members(lobby);
      }

      if (json.type === 'updateCountryCode' && player.accountId && typeof json.countryCode === 'string') {
        // Update player's countryCode
        player.countryCode = json.countryCode || null;
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

        // Full party / 2v2 staging lobby: the invite could never be accepted
        // (joinGameByCode bounces with gameIsFull) — refuse at send time so
        // the INVITER learns immediately instead of the friend on accept.
        // After the already-in-game check so that more specific toast wins.
        if (Object.keys(game.players).length >= game.maxPlayers) {
          player.send({
            type: 'toast',
            key: 'gameIsFull',
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
        // Block banned users and users with pending name changes from multiplayer
        if (player.banned) {
          player.send({
            type: 'toast',
            key: 'accountSuspended',
            toastType: 'error'
          });
          return;
        }

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
          // Rollout gate: a friend on a pre-team client accepted an invite into
          // a team lobby it can't render. Reject BEFORE the leave-queue /
          // leave-game side effects. Sentence-as-key: old clients show unknown
          // toast keys verbatim.
          if ((game.teamGame || game.is2v2Lobby || game.teamDuel) && !player.teamSupport) {
            player.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
            return;
          }

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

      // Account-settings writes (settings UI). Discipline for both handlers:
      // the in-memory player field — which sendFriendData echoes as the
      // authoritative value — changes ONLY after the DB write sticks, and
      // EVERY path (cooldown, success, failure) ends in sendFriendData() so an
      // optimistically-flipped client always reconciles to server truth.
      if (json.type === "setAllowFriendReq" && typeof json.allow === 'boolean' && player.accountId) {

        if (Date.now() - player.lastAllowFriendReqChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastAllowFriendReqChange) / 1000),
            toastType: 'error'
          });
          player.sendFriendData(); // snap the optimistic client back
          return;
        }
        player.lastAllowFriendReqChange = Date.now();
        User.updateOne({ _id: player.accountId }, { allowFriendReq: json.allow }).then(() => {
          player.allowFriendReq = json.allow;
          player.send({
            type: 'toast',
            key: 'preferenceUpdated'
          });
          player.sendFriendData();
        }).catch((e) => {
          console.log(e);
          player.sendFriendData(); // write failed — echo the unchanged truth
        });
      }

      // Privacy toggle: hide own "last seen" from friends.
      if (json.type === "setHideLastSeen" && typeof json.hide === 'boolean' && player.accountId) {

        if (Date.now() - player.lastHideLastSeenChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastHideLastSeenChange) / 1000),
            toastType: 'error'
          });
          player.sendFriendData(); // snap the optimistic client back
          return;
        }
        player.lastHideLastSeenChange = Date.now();
        User.updateOne({ _id: player.accountId }, { hideLastSeen: json.hide }).then(() => {
          player.hideLastSeen = json.hide;
          player.send({
            type: 'toast',
            key: 'preferenceUpdated'
          });
          player.sendFriendData();
        }).catch((e) => {
          console.log(e);
          player.sendFriendData(); // write failed — echo the unchanged truth
        });
      }

      // ---- DEPRECATED protocol shims (remove after the next web deploy) ----
      // Pre-unification web tabs still send these; alias them onto the unified
      // messages so live sessions keep working across the server deploy.
      if (json.type === 'create2v2Lobby') { json.type = 'createPrivateGame'; json.mode = '2v2'; }
      if (json.type === 'join2v2Lobby') { json.type = 'joinPrivateGame'; }

      if (json.type === 'createPrivateGame' && !player.gameId) {

        // Block banned users and users with pending name changes from multiplayer
        if (player.banned) {
          player.send({
            type: 'toast',
            key: 'accountSuspended',
            toastType: 'error'
          });
          return;
        }

        // send toast if maintenance
        if (maintenanceMode) {
          player.send({
            type: 'toast',
            key: 'maintenanceModeStarted',
            toastType: 'error'
          });
          return;
        }

        // 2v2 staging needs a team-capable client (rollout gate: pre-team
        // bundles and the mobile app don't announce teamSupport in verify).
        // Normal parties stay open to everyone. Sentence-as-key: this toast is
        // only ever seen by old clients, whose t() renders unknown keys verbatim.
        if (json.mode === '2v2' && !player.teamSupport) {
          player.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
          return;
        }

        // Guests can't start NEW 2v2 games — the client shows a link-Google
        // modal instead of ever sending this, so the sentence-as-key toast
        // only covers stale or hand-rolled clients. In-flight 2v2 games are
        // untouched: this guards staging-lobby creation only. Instant testing
        // mode admits guests (nothing persists for them anyway).
        if (json.mode === '2v2' && !player.accountId && !BOTS_INSTANT) {
          player.send({ type: 'toast', key: 'Link your account to play 2v2', toastType: 'error' });
          return;
        }

        // Creating a lobby cancels any matchmaking search. addPlayer below
        // already drops the inQueue flag (which every pairer re-checks), but
        // do it explicitly like acceptInvite so the invariant is local and
        // the stale playersInQueue entry doesn't linger until a pairer sweep.
        if (player.inQueue) {
          player.inQueue = false;
          playersInQueue.delete(player.id);
        }

        const gameId = uuidv4();
        // mode:'2v2' → a 2-max staging lobby for the 2v2 queue. It never plays
        // itself (Find Match dissolves it into the matchmaker), so it skips
        // game options / location generation entirely.
        const is2v2Lobby = json.mode === '2v2';
        const game = new Game(gameId, { is2v2Lobby });
        games.set(gameId, game);
        game.addPlayer(player, true);
        if (!is2v2Lobby) {
          // initialize with default options
          updateGameOptions(game);
        }
      }

      if(json.type === "resetGame" && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // make sure player is host; never reset over an in-flight save (the
        // end-state auto-reset in the game loop waits the same way) — a reset
        // clears roundHistory out from under the running persist.
        if(game.players[player.id].host && !game.saveInProgress) {
          // Host is cutting a live match short — tell the members why they're
          // suddenly back in the lobby. End-state resets stay silent: the game
          // loop auto-resets those on a timer, so a lobby return is expected.
          // Round-1 countdown resets are silent too (preGame, mirrors the
          // teamDuel carve-out): "host ended the match" is wrong copy for a
          // cancelled start, and the lobby reappearing explains itself.
          if (['getready', 'guess'].includes(game.state)
              && !(game.state === 'getready' && game.curRound <= 1)) {
            for (const pid of Object.keys(game.players)) {
              if (pid === player.id) continue;
              players.get(pid)?.send({ type: 'toast', key: 'hostEndedMatch', toastType: 'info' });
            }
          }
          game.resetGame(allLocations);
        }
      }


      if(json.type === "setPrivateGameOptions" && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // make sure player is host
        if(game.players[player.id].host) {
          let { rounds, timePerRound, location, nm, npz, showRoadName, displayLocation } = json;
          updateGameOptions(game, rounds, timePerRound, location, nm, npz, showRoadName, displayLocation);

        }
      }

      // ---- Intra-party team mode ----
      // Deliberately separate from setPrivateGameOptions: that path clears and
      // regenerates locations on every call, which a team toggle must not do.
      // All three reject silently on bad state — the broadcast is the source
      // of truth and the lobby UI renders only server state.
      if (json.type === 'setTeamConfig' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host) return;
        // Rollout gate: the party may have formed as a normal lobby, so members
        // on pre-team clients can be sitting in it. Remove them BEFORE the mode
        // flips (applyTeamConfig assigns teams to whoever remains) — the
        // standard kick teardown is something every client vintage handles.
        // The host (who sent this) always has teamSupport, so is never kicked.
        if (json.enabled === true && !game.teamGame) {
          for (const pid of Object.keys(game.players)) {
            const member = players.get(pid);
            if (member?.teamSupport) continue;
            // Never strand a searching client (mirrors kickPlayer). Unreachable
            // — unsupported members can't be 2v2-queued — but raw messages
            // must not strand players.
            if (member?.inQueue || playersInQueue.has(pid)) continue;
            const memberName = game.players[pid].username;
            if (member) {
              // Sentence-as-key: old clients render unknown toast keys verbatim.
              member.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
              game.removePlayer(member);
            } else {
              // Roster entry whose socket is already gone — just drop it.
              delete game.players[pid];
              game.sendAllPlayers({ type: 'player', id: pid, action: 'remove' });
            }
            player.send({ type: 'toast', key: 'playerKicked', name: memberName, toastType: 'info' });
          }
        }
        game.applyTeamConfig(json);
      }

      if (json.type === 'shuffleTeams' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host || !game.teamGame) return;
        game.shuffleTeamsEvenly();
      }

      if (json.type === 'setPlayerTeam' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // The client flips the row optimistically before this arrives, so a
        // rejected move must answer with the real state or that client shows
        // the wrong team until some unrelated broadcast fixes it.
        const rejectAndResync = () => {
          if (game.players[player.id]) player.send(game.getInitialSendState(player));
        };
        if (game.public || game.is2v2Lobby || game.state !== 'waiting' || !game.teamGame) return rejectAndResync();
        const { playerId, team } = json;
        if (team !== 'a' && team !== 'b') return;
        if (typeof playerId !== 'string' || !game.players[playerId]) return rejectAndResync();
        const isHost = !!game.players[player.id]?.host;
        // Hosts move anyone; others move only themselves, and only when the
        // host has allowed self-picking.
        if (!isHost && !(game.allowTeamPick && playerId === player.id)) return rejectAndResync();
        game.players[playerId].team = team;
        game.sendStateUpdate();
      }

      if (json.type === 'joinPrivateGame') {
        // Block banned users and users with pending name changes from multiplayer
        if (player.banned) {
          player.send({
            type: 'toast',
            key: 'accountSuspended',
            toastType: 'error'
          });
          return;
        }

        // Joining out of a game requires an explicit leaveGame first — EXCEPT
        // from a 2v2 staging lobby, which may be hopped out of silently (e.g.
        // entering a friend's code while sitting in your own auto-created lobby).
        const current = player.gameId ? games.get(player.gameId) : null;
        if (current && !current.is2v2Lobby) return;

        let code = json.gameCode;

        // find game by code — ONE join path for every private-lobby code
        // (party or 2v2 staging), so codes and ?party= links are interchangeable
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
          if (game.id === current?.id) {
            // Entering the code of the lobby you're already in.
            player.send({ type: 'gameJoinError', error: 'Invalid game code' });
            return;
          }
          // Rollout gate: clients that didn't announce teamSupport in verify
          // can't render team lobbies/duels. gameJoinError text is displayed
          // verbatim on every client vintage (join screen / toast).
          if ((game.teamGame || game.is2v2Lobby || game.teamDuel) && !player.teamSupport) {
            player.send({
              type: 'gameJoinError',
              error: 'Play team games on worldguessr.com for now'
            });
            return;
          }
          // Guests can't enter 2v2 staging lobbies (they couldn't queue from
          // one anyway — queue2v2Members re-checks). Party/team lobbies stay
          // open to guests: intra-party team games are deliberately allowed.
          if (game.is2v2Lobby && !player.accountId) {
            player.send({
              type: 'gameJoinError',
              error: 'Link your Google account to play 2v2'
            });
            return;
          }
          // Joining by code cancels any matchmaking search. addPlayer below
          // already drops the inQueue flag (which every pairer re-checks),
          // but do it explicitly like acceptInvite so the invariant is local
          // and the stale queue entry doesn't linger until a pairer sweep.
          if (player.inQueue) {
            player.inQueue = false;
            playersInQueue.delete(player.id);
          }
          if (current) current.removePlayer(player, true);
          game.addPlayer(player);
        });
      }

      if (json.type === 'startGameHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.players[player.id].host) {
          game.start(player);
        }
      }

      // Host kicks a player from a private waiting lobby. The kicked client
      // gets an explanatory toast followed by the standard gameShutdown
      // teardown; the host gets a confirmation toast; everyone else sees the
      // regular roster-remove broadcast.
      if (json.type === 'kickPlayer' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        // No kicking in 2v2 staging lobbies: the seat opposite the host is a
        // matched stranger or regrouping teammate, not a guest of the host's
        // party. Real parties (including team-mode) keep host kick.
        if (game.public || game.is2v2Lobby || game.state !== 'waiting') return;
        if (!game.players[player.id]?.host) return;
        const targetId = json.playerId;
        if (typeof targetId !== 'string' || targetId === player.id || !game.players[targetId]) return;

        const targetName = game.players[targetId].username;
        const target = players.get(targetId);
        // No kicking a teammate who is mid-queue: removePlayer would clear
        // their inQueue with nothing their searching screen reacts to,
        // stranding the client. (Unreachable via the UI — the lobby is hidden
        // while queued — but raw messages must not strand players.)
        if (target?.inQueue || playersInQueue.has(targetId)) return;
        if (target) {
          target.send({ type: 'toast', key: 'kickedFromParty', toastType: 'error' });
          game.removePlayer(target);
        } else {
          // Roster entry whose socket is already gone — just drop it.
          delete game.players[targetId];
          game.sendAllPlayers({ type: 'player', id: targetId, action: 'remove' });
        }
        player.send({ type: 'toast', key: 'playerKicked', name: targetName, toastType: 'success' });
      }

      // ---- 2v2 team mode ----
      // Find Match from any private waiting lobby with 1-2 players (the 2v2
      // staging lobby, or a small party): host-only; queues everyone for 2v2 —
      // solo (random teammate) or as a full duo — and dissolves the lobby.
      if (json.type === 'find2v2Match' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if (game.public || game.state !== 'waiting' || !game.players[player.id]?.host) return;
        if (game.teamGame) return; // a team-mode party must never dissolve into the ranked queue
        if (Object.keys(game.players).length > 2) return; // 2v2 queues take at most a duo
        if (player.banned) {
          player.send({ type: 'toast', key: 'accountSuspended', toastType: 'error' });
          return;
        }
        if (maintenanceMode) {
          player.send({ type: 'toast', key: 'maintenanceModeStarted', toastType: 'error' });
          return;
        }
        // Rollout gate: every seat headed into a team duel must be a
        // team-capable client. The usual trip here is a host queueing a small
        // party whose partner is on a pre-team client (normal-party joins
        // aren't gated). The host sending this is on a current bundle, so a
        // real locale key is fine.
        if (Object.keys(game.players).some(pid => !players.get(pid)?.teamSupport)) {
          player.send({ type: 'toast', key: 'teammateNeedsUpdate', toastType: 'error' });
          return;
        }
        queue2v2Members(game);
        // The lobby stays alive (members keep their gameId) so leaveQueue can
        // put the whole group back into it — same code, same teammate. The
        // matchmaker tears it down when a match actually forms.
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
        console.log(`[WS] friendRequest lookup: ${json.name}`);
        User.findOne({ username: json.name }).collation(USERNAME_COLLATION).then(async (friend) => {
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
    const connectionDuration = ws.connectTime ? Date.now() - ws.connectTime : 0;
    const durationSeconds = (connectionDuration / 1000).toFixed(1);

    console.log(`WebSocket disconnect code: ${code} (${durationSeconds}s) - ${message ? message.toString() : 'no message'}`);

    ipConnectionCount.set(ws.ip, ipConnectionCount.get(ws.ip) - 1);
    if(ipConnectionCount.get(ws.ip) < 1) {
      ipConnectionCount.delete(ws.ip);
    }

    if (players.has(ws.id)) {
      const player = players.get(ws.id);

      // A reconnect can move this player id to a new websocket before the old
      // socket's close event fires. Ignore the stale close so it does not mark
      // the newly reconnected player as disconnected or remove them from games.
      if (player.ws !== ws) {
        if (playersInQueue.has(ws.id)) {
          playersInQueue.delete(ws.id);
        }
        return;
      }

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

      // Post-game results: reflect the drop in teammates' Play Again counter
      // right away instead of after the 30s purge (livingTeamPlayAgain
      // excludes disconnected members for auto-paired teams — the survivor's
      // "(1/2)" downgrades to a 1-click solo requeue instantly; chosen duos
      // recompute to the same numbers until the purge trims the roster).
      if (player.gameId && games.has(player.gameId)) {
        const dcGame = games.get(player.gameId);
        const dcTeam = dcGame.players[player.id]?.team;
        if (dcGame.teamDuel && dcGame.state === 'end' && dcTeam) {
          dcGame.sendPlayAgainState(dcTeam);
        }

        // Surface the drop on the wire roster: HUDs dim the player through
        // the reconnect grace instead of teammates waiting on a ghost
        // ("waiting for 1 player…" with no clue who or why). Roster seats
        // serialize wholesale, so a plain flag rides every later snapshot;
        // rejoinGame clears it. Broadcast only mid-game — waiting lobbies
        // resolve departures via eviction/purge, not indicators.
        const dcSeat = dcGame.players[player.id];
        if (dcSeat) {
          dcSeat.disconnected = true;
          if (['getready', 'guess', 'end'].includes(dcGame.state)) {
            dcGame.sendStateUpdate();
          }
        }

        // Auto-paired 2v2 staging lobbies dissolve on ANY disconnect (matchmade
        // strangers get no reconnect grace — same ruling as the counter above):
        // evict the dropout's roster seat NOW. Leaving the zombie seated made
        // pair2v2Solos count this lobby as a full duo (raw roster length, not
        // live sockets), so the survivor — though correctly demoted to a
        // stage-1 solo queue entry — could never be paired again until the 30s
        // purge freed the seat, and got an identical enter2v2Queue re-send
        // every 500ms tick meanwhile. removePlayer handles the rest: crown
        // pass, survivor snap-to-lobby, and the instant autoQueue2v2At re-arm.
        // Chosen (join-code) duos keep the grace: their seat survives for
        // rejoinGame's queue re-sync.
        if (dcGame.is2v2Lobby && dcGame.state === 'waiting' && dcGame.autoPaired) {
          dcGame.removePlayer(player, true);
        }
      }

      // Stamp for friends' "Offline · last seen X ago" — written at the moment
      // of disconnect so it stays accurate long after the 30s grace purge.
      if (player.accountId) {
        User.updateOne({ _id: player.accountId }, { lastSeen: Date.now() }).catch(() => {});
      }
      }
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
    console.log('Recovered gamestate', gamestate.games.length, 'games', gamestate.players.length, 'players', currentDate());
    console.error('Recovered gamestate', gamestate.games.length, 'games', gamestate.players.length, 'players', currentDate()); // so it shows up in the error log after a crash

    for (const player of gamestate.players) {
      const newPlayer = Player.fromJSON(player);
      if (newPlayer.isBot) {
        // Bots have no socket to reconnect: restore them live so tickBots
        // resumes driving their guesses, and keep them out of the rejoin map
        // (the 30s purge would remove them mid-game as unreturned zombies).
        players.set(player.id, newPlayer);
        continue;
      }
      newPlayer.disconnectTime = Date.now(); // important
      newPlayer.disconnected = true;
      if(newPlayer.inQueue) {
        // playersInQueue is never persisted, so the queue entry died with the
        // old process. Clear the flag AND remember why, so rejoinGame can
        // toast the player — otherwise they reconnect into a silently idle
        // lobby with no clue their matchmaking evaporated.
        newPlayer.inQueue = false;
        newPlayer.queueKilledByRestart = true;
      }
      players.set(player.id, newPlayer);
      disconnectedPlayers.set(player.accountId??player.rejoinCode, player.id);
    }
    // Shift every time anchor forward by the downtime so recovered games resume
    // with the SAME remaining time on their current phase instead of waking up
    // with an already-expired nextEvtTime (which makes the 500ms loop race the
    // game to completion before anyone can reconnect → rejoin lands on 'end').
    const downtime = Date.now() - gamestate.time;
    for (const game of gamestate.games) {
      console.log(game.id);
      const newGame = Game.fromJSON(game);
      if (typeof newGame.nextEvtTime === 'number') newGame.nextEvtTime += downtime;
      if (typeof newGame.startTime === 'number') newGame.startTime += downtime;
      if (typeof newGame.endTime === 'number') newGame.endTime += downtime;
      if (newGame.roundStartTimes) {
        for (const k of Object.keys(newGame.roundStartTimes)) {
          newGame.roundStartTimes[k] += downtime;
        }
      }
      // A pending 2v2 auto-queue cannot survive a restart: queue entries are
      // not persisted and every restored member starts disconnected, so the
      // stamp would only fire against ghosts and null itself. Kill it
      // explicitly and flag the seated members (mid-"Queueing in 3…" players
      // aren't inQueue — the beat de-queues them — so the player-loop flag
      // above misses them) for the same rejoin toast.
      if (newGame.autoQueue2v2At) {
        newGame.autoQueue2v2At = null;
        for (const pid of Object.keys(newGame.players)) {
          const seated = players.get(pid);
          if (seated) seated.queueKilledByRestart = true;
        }
      }
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

    const activePlayerCount = getActivePlayerCount();
    for (const player of players.values()) {
      if (player.verified && !player.gameId) {
        player.send({
          type: 'cnt',
          c: activePlayerCount
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

    // Helper to check if two players were last opponents (and should skip matching)
    // Allow rematch if either player has been waiting > 15 seconds
    const shouldSkipLastOpponent = (p1, p2, queueTime1, queueTime2) => {
      const p1Account = players.get(p1)?.accountId;
      const p2Account = players.get(p2)?.accountId;
      if (!p1Account || !p2Account) return false;

      const wereLastOpponents = lastDuelOpponent.get(p1Account) === p2Account || lastDuelOpponent.get(p2Account) === p1Account;
      if (!wereLastOpponents) return false;

      // Allow rematch if either player has been waiting > 60 seconds
      const waitTime1 = Date.now() - queueTime1;
      const waitTime2 = Date.now() - queueTime2;
      if (waitTime1 > 60000 || waitTime2 > 60000) return false;

      return true; // Skip this match - they were last opponents and haven't waited long enough
    };

    // Loop through each player in the queue
    for (let i = 0; i < entries.length; i++) {
      const [id1, { min, max, elo, guest, queueTime }] = entries[i];

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
          const [id2, { min: min2, max: max2, elo: elo2, guest: guest2, queueTime: queueTime2 }] = entries[j];

          // Skip if already matched or if player2 is a guest
          if (matchedPlayers.has(id2) || guest2) continue;

          // Skip if these players were just matched together (prevent same matchup twice in a row)
          // Unless one of them has been waiting > 15 seconds
          if (shouldSkipLastOpponent(id1, id2, queueTime, queueTime2)) continue;

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

  // Queue every connected member of a staging lobby for 2v2 — the single
  // entry point shared by Find Match, the post-pairing auto-queue, and
  // pregame-cancel requeues. A full duo queues under a shared teamId
  // (stage 2: opponent search); a lone member queues teamId-less (stage 1:
  // teammate search). The lobby stays alive so leaveQueue can restore the
  // whole group into it — same code, same teammate.
  function queue2v2Members(lobby) {
    lobby.autoQueue2v2At = null;
    lobby.queueBoundDuo = null; // consumed — must not leak into later snapshots
    // Live sockets only — grace-window zombies still hold roster seats for up
    // to 30s, and counting them would queue a lone survivor under a phantom
    // teamId (stage-2 opponent search for a teammate who is already gone).
    // It would also recreate the queue entry their close handler cleaned and
    // pair dead players into matches.
    const members = Object.values(lobby.players)
      .map((m) => players.get(m.id))
      .filter((sock) => sock && !sock.disconnected);
    if (members.length > 2) return; // 2v2 takes at most a duo (find2v2Match enforces the same)
    // Bots never queue: the backfill seats them directly into started games,
    // and every teardown path drops them for tickBots to reap. One reaching
    // this point is an escaped orphan — refuse the whole queue entry rather
    // than feed build2v2Teams a phantom team (tickBots' non-public-game
    // backstop then clears the lobby within a tick).
    if (members.some((sock) => sock.isBot)) {
      console.error('[BOTS] queue2v2Members refused: bot in staging lobby', lobby.id);
      // Re-arm the poll fallback instead of consuming the queue attempt
      // (autoQueue2v2At was already nulled above): tickBots' backstop evicts
      // the bot within a tick, and the next autoQueue2v2At scan then queues
      // the remaining humans — a Find Match click during the contaminated
      // window is delayed by ~a tick, not silently swallowed.
      lobby.autoQueue2v2At = Date.now() + 1000;
      return;
    }
    // Guest backstop for EVERY path into the 2v2 queue (Find Match, the
    // post-pairing auto-queue, Play Again regroups, cancel requeues): guests
    // can't queue NEW games. The creation/join gates make this near
    // unreachable, but raw messages and pre-gate lobbies restored from a
    // snapshot must not slip a guest into the matchmaker. In-flight games
    // are untouched — this only guards queue entry. Instant testing mode
    // exempts guests.
    if (members.some((sock) => !sock.accountId && !BOTS_INSTANT)) {
      for (const sock of members) {
        sock.send({ type: 'toast', key: 'Link your Google account to play 2v2', toastType: 'error' });
      }
      return;
    }
    const teamId = members.length >= 2 ? uuidv4() : null;
    const now = Date.now();
    for (const sock of members) {
      sock.inQueue = true;
      // Bot backfill: refresh each member's 2v2 W/L eligibility (async,
      // fire-and-forget — resolves long before the backfill window).
      refreshBotEligibility(sock);
      playersInQueue.set(sock.id, { mode: '2v2', teamId, queueTime: now });
      // stage tells the client WHERE to render the search: 'teammate'
      // (stage 1) stays inside the lobby card, 'opponents' (stage 2) shows
      // the queue banner. Additive — old clients ignore it.
      sock.send({ type: 'enter2v2Queue', stage: teamId ? 'opponents' : 'teammate' });
    }
  }

  // Stage 1 of 2v2 matchmaking: pair two solo queuers into a TEAM before any
  // opponent search happens. The second solo moves into the first's lobby
  // (their lobby code changes — that's fine), both get snapped onto the lobby
  // screen to see their new teammate for a moment, then the lobby auto-queues
  // as a duo (stage 2). Once paired, a team stays a team across requeues —
  // intentional: duos that like each other keep playing together.
  function pair2v2Solos(queue) {
    const solos = [];
    for (const [id, q] of queue) {
      if (!q || q.mode !== '2v2' || q.teamId) continue;
      const p = players.get(id);
      if (!p || !p.inQueue) continue; // stale — build2v2Teams reaps it next
      const lobby = p.gameId ? games.get(p.gameId) : null;
      if (lobby && (lobby.public || lobby.state !== 'waiting')) continue; // stale — reaped next
      if (!lobby) {
        // Self-heal a queued solo with no home lobby: mint one (addPlayer
        // un-queues them and shows them the lobby), then auto-requeue.
        queue.delete(id);
        const fresh = new Game(uuidv4(), { is2v2Lobby: true });
        games.set(fresh.id, fresh);
        fresh.autoQueue2v2At = Date.now() + 1000;
        fresh.addPlayer(p, true);
        continue;
      }
      if (Object.keys(lobby.players).length !== 1) {
        // A friend joined the lobby by code while this member searched for a
        // random teammate — the team is complete; requeue the whole lobby as
        // a duo instead of leaving a solo entry that can never match.
        if (Object.keys(lobby.players).length === 2) queue2v2Members(lobby);
        continue;
      }
      solos.push({ id, lobby });
    }
    for (let i = 0; i + 1 < solos.length; i += 2) {
      const a = solos[i];
      const b = solos[i + 1];
      const A = players.get(a.id);
      const B = players.get(b.id);

      // De-queue both for the team-preview beat; the auto-queue re-enters them.
      A.inQueue = false;
      B.inQueue = false;
      queue.delete(a.id);
      queue.delete(b.id);

      // Move B into A's lobby. removePlayer on a lone member quietly
      // self-destructs B's old lobby (socketClosed=true suppresses the
      // gameShutdown). The auto-queue stamp is set BEFORE the state sends so
      // both clients receive autoQueueInMs and render "Queueing in 3…".
      b.lobby.removePlayer(B, true);
      // Mark the pairing as matchmade: a stage-2 cancel DISSOLVES an
      // auto-paired duo (each side back to their own lobby) instead of
      // parking two strangers together like a chosen duo.
      a.lobby.autoPaired = true;
      a.lobby.autoQueue2v2At = Date.now() + 3000;
      a.lobby.addPlayer(B); // sends B the lobby state — snaps them onto the lobby screen
      A.send(a.lobby.getInitialSendState(A)); // snap A back too — they see their new teammate
    }
    // No bot backfill here — USER RULING (July 8): bots are OPPONENTS only,
    // never a human's 2v2 teammate. A leftover solo waits for a human, even
    // in instant testing mode; only the stage-2 opposing team gets bots.
  }

  // Stage 2 of 2v2 matchmaking: only INTACT duos (both members queued under a
  // shared teamId) become teams — solos are stage 1's job. A survivor whose
  // partner is truly gone (queue entry dead AND lobby seat empty) is demoted
  // back to stage 1 to find a new teammate; while the partner is merely in the
  // 30s disconnect grace, the survivor keeps waiting for them.
  function build2v2Teams(queue) {
    const entries = Array.from(queue.entries()).filter(([id, q]) => {
      if (!q || q.mode !== '2v2') return false;
      const p = players.get(id);
      if (!p || !p.inQueue) { queue.delete(id); return false; }
      // A queued player may still sit in their private waiting lobby (kept
      // alive so cancel can restore it) — only a started/real game is stale.
      if (p.gameId) {
        const g = games.get(p.gameId);
        if (!g || g.public || g.state !== 'waiting') { queue.delete(id); return false; }
      }
      return true;
    });

    const byTeam = new Map();
    for (const [id, q] of entries) {
      if (!q.teamId) continue;
      if (!byTeam.has(q.teamId)) byTeam.set(q.teamId, []);
      byTeam.get(q.teamId).push(id);
    }

    const teams = [];
    for (const ids of byTeam.values()) {
      if (ids.length >= 2) {
        teams.push([ids[0], ids[1]]);
      } else {
        const p = players.get(ids[0]);
        const lobby = p?.gameId ? games.get(p.gameId) : null;
        if (!lobby || Object.keys(lobby.players).length < 2) {
          const q = queue.get(ids[0]);
          if (q) {
            q.teamId = null; // partner really gone → stage 1
            // Tell the client — a silent demotion leaves it painting the
            // stage-2 "Finding match" banner while we hunt teammates. Lobby
            // snapshot first (its `game` handler wipes gameQueued), then the
            // stage flip. No lobby → pair2v2Solos self-heals one next tick.
            if (p && lobby) p.send(lobby.getInitialSendState(p));
            if (p) p.send({ type: 'enter2v2Queue', stage: 'teammate' });
          }
        }
      }
    }
    return teams;
  }

  // ── Matchmade game construction ────────────────────────────────────────
  // ONE construction path per mode, shared by the human pairing passes and
  // the bot backfills below: ELO wiring or lobby handling drifting between
  // those callers is exactly the bug class this prevents. Deliberate
  // bot-path differences are explicit parameters; everything else is
  // identical by construction. Kept scope-local (like findDuelPairs /
  // build2v2Teams) so they read the live module-level allLocations, which
  // is reassigned every 10s.

  // A queued player may legitimately still sit in a private waiting lobby
  // (kept alive so cancel can restore it) — only a started/real game
  // disqualifies them from being matched.
  const inStartedRealGame = (s) => {
    if (!s.gameId) return false;
    const g = games.get(s.gameId);
    return !g || g.public || g.state !== 'waiting';
  };

  // Ranked 1v1: seats p1/p2 under their duel tags, wires the ELO deltas for
  // every outcome, and unqueues both ids (a bot id is never queued — no-op).
  //   - isBotGame stamps the finishSoloDuel save-gate carve-out: accountIds.p2
  //     stays null by construction (bots persist nothing — every per-account
  //     write path skips the null id; the saved game's bot side is
  //     synthesized from roster data).
  //   - lastDuelOpponent is never stamped for bot games: a bot is always a
  //     valid next opponent.
  function createRankedDuelGame(p1, p2, { isBotGame = false } = {}) {
    const gameId = uuidv4();
    const game = new Game(gameId, { public: true, allLocations, duel: true });
    if (isBotGame) game.isBotGame = true;
    games.set(gameId, game);

    game.addPlayer(p1, undefined, "p1");
    game.addPlayer(p2, undefined, "p2");
    playersInQueue.delete(p1.id);
    playersInQueue.delete(p2.id);

    if (isBotGame) {
      game.accountIds = {
        p1: p1.accountId,
        p2: null
      }
    } else if (p1.accountId && p2.accountId) {
      // Set account IDs for all registered players (needed for saving to MongoDB)
      game.accountIds = {
        p1: p1.accountId,
        p2: p2.accountId
      }

      // Track last opponent to prevent same matchup twice in a row
      // only for users below 5000 elo
      if (p1.elo < leagues.voyager.min && p2.elo < leagues.voyager.min) {
        lastDuelOpponent.set(p1.accountId, p2.accountId);
        lastDuelOpponent.set(p2.accountId, p1.accountId);
      }
    }

    // check if both have elo. For bot games this gate is a DELIBERATE
    // tightening vs the old inline bot path (which wired ELO
    // unconditionally): the backfill only serves elo-bearing players and
    // bots always have one, so it's equivalent today — and if an elo-less
    // player ever reaches a bot game, skipping the wiring (guest-duel
    // semantics) beats computing NaN deltas.
    if (p1.elo && p2.elo) {
      // calculate elo change if p1 wins,loses,draws
      // calculate elo change if p2 wins,loses,draws
      const eloP1Win = calculateOutcomes(p1.elo, p2.elo, 1);
      const eloDraw = calculateOutcomes(p1.elo, p2.elo, 0.5);
      const eloP2Win = calculateOutcomes(p1.elo, p2.elo, 0);

      const deltaP1Win = {newRating1: eloP1Win.newRating1 - p1.elo, newRating2: eloP1Win.newRating2 - p2.elo};
      const deltaP2Win = {newRating1: eloP2Win.newRating1 - p1.elo, newRating2: eloP2Win.newRating2 - p2.elo};
      const deltaDraw = {newRating1: eloDraw.newRating1 - p1.elo, newRating2: eloDraw.newRating2 - p2.elo};

      game.eloChanges = {
        [p1.id]: deltaP1Win,
        [p2.id]: deltaP2Win,
        draw: deltaDraw
      }

      game.oldElos = {
        p1: p1.elo,
        p2: p2.elo
      }

      // Fires for bot games too (the old inline bot path predated this flag
      // and simply lacked it — unified deliberately).
      if (process.env.DEBUG_ELO_CHANGES === 'true') {
        console.log('game.eloChanges', game.eloChanges, game.oldElos);
      }

      // Both high-elo → the harder arbitrary world map (structurally never
      // true for bot games: bots sit at 800-1000).
      if(p1.elo > 2000 && p2.elo > 2000) {
        game.locations = pick5RandomArb();
      }
    }

    game.pIds = {
      p1: p1.id,
      p2: p2.id
    }

    game.start();
    return game;
  }

  // Matchmade 2v2: rosterA seats as team 'a', rosterB as 'b' (team duels
  // have no p1..p4 tags — nothing reads them; the client keys off
  // players[].team). Tears down the staging lobbies the members came from,
  // so autoPairedTeams / teamHostIds MUST be captured by the caller BEFORE
  // this call — they read lobby state this destroys. Rematch memory
  // (last2v2Opponents) also stays caller-side: it is deliberately never
  // stamped for bot games (bot ids are fresh uuids per match; a stamp could
  // never match a future opponent key).
  function createTeamDuelGame(rosterA, rosterB, { autoPairedTeams, teamHostIds, queueIds, isBotGame = false }) {
    // Tear down the staging lobbies the matched players came from. Queued
    // members ignore the resulting gameShutdown client-side (not inGame),
    // while any non-queued straggler (e.g. a friend who joined the lobby
    // mid-search) gets properly reset home. Bots hold no lobby.
    for (const lobbyId of new Set([...rosterA, ...rosterB].map(s => s.gameId).filter(Boolean))) {
      const lobby = games.get(lobbyId);
      if (lobby && !lobby.public && lobby.state === 'waiting') {
        games.delete(lobbyId);
        lobby.shutdown();
      }
    }

    const gameId = uuidv4();
    // public=true (loop manages lifecycle like a public duel), teamDuel=true.
    const game = new Game(gameId, { public: true, allLocations, teamDuel: true });
    // Matchmade 2v2s play a world + arbitrary-map mix (same override
    // pattern as the high-elo 1v1 path — constructor generation of the
    // "all" pool is synchronous, so replacing here is safe).
    game.locations = pick5WorldArbMix(allLocations);
    if (isBotGame) game.isBotGame = true;
    game.autoPairedTeams = autoPairedTeams;
    game.teamHostIds = teamHostIds;
    games.set(gameId, game);

    for (const p of rosterA) game.addPlayer(p, undefined, undefined, 'a');
    for (const p of rosterB) game.addPlayer(p, undefined, undefined, 'b');
    for (const id of queueIds) playersInQueue.delete(id);

    game.start();
    return game;
  }

  // queue handler
  setInterval(() => {

    // Duel bots: drive scheduled guesses, tear down bot-only ended games,
    // reap bots whose game is gone.
    tickBots();

    // Dynamically adjust join threshold based on online player count
    // When fewer players online, allow joining later rounds to speed up matchmaking
    const minRoundsRemaining = players.size >= 3000 ? 4 : 3;
    for (const game of games.values()) {

      // 2v2 staging lobby auto-queue: pairing / pregame-cancel parks members
      // in a lobby with this stamp so they see their team before queueing
      // (full duo → stage 2 opponent search, lone member → stage 1).
      if (game.is2v2Lobby && game.autoQueue2v2At && Date.now() >= game.autoQueue2v2At) {
        queue2v2Members(game);
      }

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
        // 1-second buffer for late-arriving guesses due to network latency.
        // Players who click guess at the last second may have their packet
        // arrive after the timer expires on the server.
        if (!game.roundEndedAt) {
          game.roundEndedAt = Date.now();
        }

        // Skip buffer if all players already submitted final guesses
        let allFinal = true;
        for (const p of Object.values(game.players)) {
          if (!p.final) {
            allFinal = false;
            break;
          }
        }

        if (!allFinal && Date.now() - game.roundEndedAt < 500) {
          continue; // Still in grace period, accept late guesses
        }

        game.roundEndedAt = null;
        game.givePoints();
        game.saveRoundToHistory(); // Save the round data after points are calculated
        if(game.curRound <= game.rounds) {
          game.curRound++;
          game.state = 'getready';
          // Team modes get +1s between rounds: the reveal banner carries more
          // info there (verdict + credit + damage) than a solo/1v1 reveal.
          game.nextEvtTime = Date.now() + game.waitBetweenRounds - (game.curRound > game.rounds && !game.duel ? 5000: 0)
            + ((game.teamDuel || game.teamGame) ? 1000 : 0);
          game.sendStateUpdate();


        } else {
          // game over
          game.end()
        }
      }

      if(game.state === 'end' && Date.now() > game.nextEvtTime) {
        // remove game if public
        if(game.public) {
          // Wait for any pending save operations before shutdown
          if(game.saveInProgress) {
            continue; // Skip this iteration, try again next time
          }
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
      if (game.state === 'guess' && (game.nextEvtTime - Date.now()) < game.timePerRound / 3) {
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
        if (queueData.duel || queueData.mode === '2v2') {
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

    if (playersInQueue.size > 1 && [...playersInQueue.values()].filter(r => !r.duel && r.mode !== '2v2').length > 1) {
      // create a new public game (non duel)
      const gameId = uuidv4();
      const game = new Game(gameId, { public: true, allLocations });
      games.set(gameId, game);

      let playersCanJoin = game.maxPlayers;
      for (const playerData of playersInQueue) {
        const playerId = playerData[0];
        const player = players.get(playerId);
        // Same stale-entry guard as the join loop above — a missing player
        // here would TypeError inside the interval and take the process down.
        if (!player) {
          playersInQueue.delete(playerId);
          continue;
        }
        if (player.gameId) {
          continue;
        }
        if(playerData[1].duel || playerData[1].mode === '2v2') {
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

    // 2v2 matchmaking, two distinct stages:
    //   stage 1 — find a teammate: solo queuers are paired into a shared
    //   lobby and shown their team for a beat before auto-queueing as a duo;
    //   stage 2 — find opponents: two intact duos pair into a 4-player game.
    // Players who queue from a full duo skip stage 1 entirely.
    if (playersInQueue.size >= 1) {
      pair2v2Solos(playersInQueue);
      const teams = build2v2Teams(playersInQueue);

      // Pair teams while avoiding immediate rematches: a duo is never matched
      // against the identical opponent duo it just fought (stamped on each
      // player as last2v2Opponents at match creation) — UNLESS no other
      // pairing exists and both sides have waited out a short cooldown, so a
      // two-duo queue at low population can't deadlock forever.
      const duoKey = (team) => [...team].sort().join('|');
      const isRematch = (t1, t2) => {
        const k1 = duoKey(t1), k2 = duoKey(t2);
        return t1.some(id => players.get(id)?.last2v2Opponents === k2)
            || t2.some(id => players.get(id)?.last2v2Opponents === k1);
      };
      const cooledDown = (t) => t.every(id => {
        const q = playersInQueue.get(id);
        return q && Date.now() - q.queueTime > 20000;
      });
      const pairs = [];
      const unpaired = [...teams];
      while (unpaired.length >= 2) {
        const tA = unpaired.shift();
        let idx = unpaired.findIndex(tB => !isRematch(tA, tB));
        if (idx === -1) {
          idx = unpaired.findIndex(tB => cooledDown(tA) && cooledDown(tB));
          if (idx === -1) continue; // only fresh rematches available — tA waits this tick
        }
        pairs.push([tA, unpaired.splice(idx, 1)[0]]);
      }

      for (const [teamA, teamB] of pairs) {
        const ids = [...teamA, ...teamB];
        const socks = ids.map(id => players.get(id));

        // Bail if anyone vanished / left the queue between build and create.
        if (socks.some(s => !s || !s.inQueue || inStartedRealGame(s))) {
          for (const id of ids) {
            const s = players.get(id);
            if (!s || !s.inQueue) playersInQueue.delete(id);
          }
          continue;
        }

        // Remember which teams were matchmade pairings (vs chosen duos)
        // BEFORE their lobbies are torn down — a pregame cancel propagates
        // this onto the regroup lobbies so their cancel semantics carry over.
        const teamAutoPaired = (team) => {
          const s = players.get(team[0]);
          const g = s?.gameId ? games.get(s.gameId) : null;
          return !!g?.autoPaired;
        };
        const autoPairedTeams = { a: teamAutoPaired(teamA), b: teamAutoPaired(teamB) };
        // Chosen-duo host identity (drives post-game Back/Play Again roles on
        // the results screen) — read from the staging lobby BEFORE teardown;
        // null for auto-paired teams, which have no host semantics.
        const teamHostId = (team) => {
          const s = players.get(team[0]);
          const g = s?.gameId ? games.get(s.gameId) : null;
          if (!g || g.autoPaired) return null;
          return Object.values(g.players).find(p => p.host)?.id || null;
        };
        const teamHostIds = { a: teamHostId(teamA), b: teamHostId(teamB) };

        // Rematch-avoidance memory: each player remembers the exact opponent
        // duo, so the pairing loop above skips an immediate re-encounter.
        const keyA = duoKey(teamA), keyB = duoKey(teamB);
        for (const id of teamA) { const s = players.get(id); if (s) s.last2v2Opponents = keyB; }
        for (const id of teamB) { const s = players.get(id); if (s) s.last2v2Opponents = keyA; }

        createTeamDuelGame(socks.slice(0, teamA.length), socks.slice(teamA.length), {
          autoPairedTeams, teamHostIds, queueIds: ids,
        });
      }

      // Bot backfill (2v2): a duo where BOTH members are 2v2 newbies (0 wins
      // or <10% winrate) that the pairing pass above couldn't serve gets a
      // full bot opposing team immediately. Humans still get first refusal —
      // this runs after real pairing each tick, on the leftovers.
      if (BOTS_ENABLED) {
        const duosByTeam = new Map();
        for (const [id, q] of playersInQueue) {
          if (q?.mode !== '2v2' || !q.teamId) continue;
          if (!duosByTeam.has(q.teamId)) duosByTeam.set(q.teamId, []);
          duosByTeam.get(q.teamId).push({ id, q });
        }
        for (const duo of duosByTeam.values()) {
          if (duo.length !== 2) continue;
          const socks = duo.map(({ id }) => players.get(id));
          // Instant mode drops the account + newbie gates: any duo, guests included.
          if (socks.some(s => !s || !s.inQueue || (!BOTS_INSTANT && !s.accountId))) continue;
          if (!BOTS_INSTANT && socks.some(s => s.botEligibility?.team !== true)) continue;
          // Same started/real-game staleness rule the pairing pass applies.
          if (socks.some(inStartedRealGame)) continue;

          // Capture staging-lobby semantics BEFORE teardown (mirrors the real
          // path): cancel behavior + results-screen host roles for the humans.
          const lobby = socks[0].gameId ? games.get(socks[0].gameId) : null;
          const autoPairedTeams = { a: !!lobby?.autoPaired, b: false };
          const teamHostIds = {
            a: (!lobby || lobby.autoPaired)
              ? null
              : (Object.values(lobby.players).find(p => p.host)?.id || null),
            b: null
          };

          const bots = [createBotPlayer(), createBotPlayer()];
          while (bots[1].username === bots[0].username) bots[1].username = makeBotUsername();
          console.log('[BOTS] 2v2 backfill:', bots.map(b => b.username).join('+'), 'vs', socks.map(s => s.username || s.id).join('+'));

          createTeamDuelGame(socks, bots, {
            autoPairedTeams, teamHostIds,
            queueIds: duo.map(({ id }) => id),
            isBotGame: true,
          });
        }
      }
    }

    if (playersInQueue.size >= 1) {
      const pairs = findDuelPairs(playersInQueue);
      for(const pair of pairs) {
        const [id1, id2] = pair;
        const p1 = players.get(id1);
        const p2 = players.get(id2);

        // Check if either player has left the queue (race condition prevention)
        // This can happen if they clicked leave queue right as matching occurred
        if (!p1 || !p2 || !p1?.inQueue || !p2?.inQueue) {
          // Clean up stale queue entries - remove if player is missing OR has left the queue
          if (!p1 || !p1.inQueue) playersInQueue.delete(id1);
          if (!p2 || !p2.inQueue) playersInQueue.delete(id2);
          continue; // Skip this pair, don't start a game
        }

        createRankedDuelGame(p1, p2);
      }

      // remaining players in queue check if wait was longer than 10 seconds, in that case set their elo range to infinity
      for(const playerId of playersInQueue) {
        const player = players.get(playerId[0]);
        const queueData = playerId[1];
        if(!queueData.guest && queueData.duel && Date.now() - queueData.queueTime > 10000) {
          playersInQueue.set(playerId[0], { ...queueData, min: 0, max: 20000, queueTime: Date.now() });

          player.send({
            type: 'publicDuelRange',
            range: [0, 20000]
          });
        }
      }

      // Bot backfill (ranked 1v1): a player with 0 ranked wins or an
      // under-10% winrate whom findDuelPairs couldn't serve gets a bot
      // opponent pinned to 800-1000 ELO, immediately. Runs after the
      // pairing pass each tick — humans still get first refusal.
      if (BOTS_ENABLED) {
        for (const [playerId, queueData] of playersInQueue) {
          if (!queueData.duel) continue;
          const player = players.get(playerId);
          if (!player || !player.inQueue || player.gameId || !player.elo) continue;
          if (!BOTS_INSTANT && !player.accountId) continue;
          if (!BOTS_INSTANT && player.botEligibility?.ranked !== true) continue;

          const bot = createBotPlayer();
          console.log('[BOTS] ranked backfill:', bot.username, 'vs', player.username || player.id);

          createRankedDuelGame(player, bot, { isBotGame: true });
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
        // Team rejoin exception (2v2 duels AND team parties): while the game
        // is still running and a teammate is still connected holding the
        // fort, keep the dropout rejoinable indefinitely — handleReconnect is
        // time-agnostic, it only needs this players entry plus the
        // disconnectedPlayers key. The tick after the game ends, dissolves,
        // or loses its last live teammate, this check fails and the normal
        // purge below runs. Team-party specifics:
        //  - mid-match states only: a 'waiting' lobby member purges normally
        //    (rejoining a lobby is just entering the code again);
        //  - never the host: the host-leave disband rule is deliberate, so a
        //    host dropout must still reach removePlayer after the 30s grace.
        const dcGame = player.gameId ? games.get(player.gameId) : null;
        const teamHold = dcGame?.teamDuel
          ? dcGame.state !== 'end'
          : !!dcGame?.teamGame && ['getready', 'guess'].includes(dcGame.state);
        const rosterEntry = teamHold ? dcGame.players[player.id] : null;
        if (rosterEntry?.team && !rosterEntry.host && dcGame.teamMembers(rosterEntry.team)
              .some(m => {
                if (m.id === player.id) return false;
                // "Still in the game" = an actual LIVE socket. A fellow
                // disconnected teammate must not count (two zombies would
                // keep each other alive forever), and neither may a ghost
                // roster entry whose Player object is already gone.
                const mate = players.get(m.id);
                return mate && !mate.disconnected;
              })) {
          continue;
        }
        disconnectedPlayers.delete(accountId);
        if (player.gameId) {
          const game = games.get(player.gameId);
          if (game) {
            game.removePlayer(player, true);
          }
        }

        // Never let a queue entry outlive its player — the matchmaking loops
        // dereference these entries every 500ms.
        playersInQueue.delete(playerId);
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
    let memUsage = process.memoryUsage().heapUsed;
    const gameCnt = games.size;
    const playerCnt = players.size;

     memUsage = (memUsage / 1024 / 1024).toFixed(2) + ' MB';
    console.log('Players:', playerCnt, 'Games:', gameCnt, 'Memory:', memUsage);
  }, 10000)
