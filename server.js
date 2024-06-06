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

// const { createServer } = require('http')
// const { parse } = require('url')
// const next = require('next')
// const makeId = require('uuid').v4;
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { v4 as makeId } from 'uuid';
import { config } from 'dotenv';
import colors from 'colors';

config();

// ws server
// const WebSocket = require('ws');
import { WebSocketServer } from 'ws';

import { encrypt, decrypt } from './components/utils/encryptDecrypt.js';
import mongoose from 'mongoose';
import User from './models/User.js';
import validateJWT from './components/utils/validateJWT.js';

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
  constructor(id) {
    this.id = id;
    this.players = [];
    this.state = 'waiting';
  }
}

class Player {
  constructor(ws, id) {
    this.id = id;
    this.ws = ws;
    this.state = 'idle';
    this.account = null;
    this.gameId = null;
  }
  send(json) {
    this.ws.send(JSON.stringify(json));
  }
}

const players = new Map();

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
          player.verified = true;
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

    });

    // Set up a close listener on the client
    ws.on('close', () => {
      console.log('Client disconnected', id);
      players.delete(id);
    });
  });
});

setInterval(() => {
  for (const player of players.values()) {
    player.send({
      type: 'cnt',
      c: players.size
    });
  }
}, 5000);