/*
Standalone auth server — isolates login + signup endpoints (googleAuth, setName,
emailLogin, emailVerify, checkUsername) so they keep working when the main API
server is overloaded.
*/

// FIRST IMPORT, AND IT MUST STAY FIRST — see the long note at the top of
// ws/ws.js. The `config()`-in-the-body form this replaces looked correct (it sat
// above every other import) but ESM hoists and evaluates ALL imports before the
// first body statement, so api/googleAuth.js and friends were still loaded with
// an unpopulated process.env.
import 'dotenv/config';

import mongoose from 'mongoose';
import cachegoose from 'recachegoose';

cachegoose(mongoose, {
  engine: 'memory',
});

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'colors';

import googleAuthHandler from './api/googleAuth.js';
import setNameHandler from './api/setName.js';
import emailLoginHandler from './api/emailLogin.js';
import emailVerifyHandler from './api/emailVerify.js';
import checkUsernameHandler from './api/checkUsername.js';
import { registerCacheBusRoute } from './serverUtils/cacheBus.js';
import { safeInterval } from './ws/safeTimers.js';
import { startLeagueConfigRefresh } from './serverUtils/loadLeagueConfig.js';

const startedAt = Date.now();
const STATS_WINDOW_MS = 30 * 60 * 1000;
// Ring of { ts, ms } for completed /api requests in the last 30 min.
// Trimmed on every push so memory stays bounded by request rate.
const recentRequests = [];

function trimRecentRequests(now = Date.now()) {
  const cutoff = now - STATS_WINDOW_MS;
  let drop = 0;
  while (drop < recentRequests.length && recentRequests[drop].ts < cutoff) drop++;
  if (drop > 0) recentRequests.splice(0, drop);
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  if (days || hours || minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api/')) {
      recentRequests.push({ ts: start, ms: duration });
      trimRecentRequests();
    }
    if (duration > 100) {
      console.log(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});

if (!process.env.MONGODB) {
  console.log('[MISSING-ENV WARN] MONGODB env variable not set — auth server requires it'.yellow);
} else if (mongoose.connection.readyState !== 1) {
  try {
    await mongoose.connect(process.env.MONGODB);
    console.log('[INFO] Database Connected');
  } catch (error) {
    console.error('[ERROR] Database connection failed!'.red, error.message);
  }

  // Seasonal league tiers: this process serves /api/googleAuth, whose payload
  // carries the player's league. Without this it would hand out last season's
  // tier names while ws and the API server used the current ones.
  await startLeagueConfigRefresh(safeInterval, { label: 'auth' });
}

if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
  console.log('[MISSING-ENV WARN] NEXT_PUBLIC_GOOGLE_CLIENT_ID env variable not set'.yellow);
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  console.log('[MISSING-ENV WARN] GOOGLE_CLIENT_SECRET env variable not set'.yellow);
}

app.get('/', (_req, res) => {
  trimRecentRequests();
  const count = recentRequests.length;
  const avgMs = count ? recentRequests.reduce((sum, r) => sum + r.ms, 0) / count : 0;
  res.status(200).type('text/plain').send(
    `uptime: ${formatUptime(Date.now() - startedAt)}\n` +
    `avg response (last 30 min): ${count ? avgMs.toFixed(1) + ' ms over ' + count + ' requests' : 'no requests yet'}\n`
  );
});

// Every handler promise is caught, exactly as server.js wraps its
// auto-registered /api/* routes: a rejected handler answers 500 instead of
// becoming an unhandled rejection, which on Node >= 15 takes the whole auth
// process (every login) down with it.
function logCritical(tag, details) {
  console.error(`[CRITICAL] ${tag}`.red, details);
}
function guarded(path, handler) {
  app.all(path, (req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      logCritical('API HANDLER CRASH', { path, method: req.method, error: err });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Server error' });
      }
    });
  });
}
guarded('/api/googleAuth', googleAuthHandler);
guarded('/api/setName', setNameHandler);
// Email + code login (server.js auto-registers these by filename; this
// process has an explicit table, so every new auth route is listed here too).
guarded('/api/emailLogin', emailLoginHandler);
guarded('/api/emailVerify', emailVerifyHandler);
guarded('/api/checkUsername', checkUsernameHandler);
registerCacheBusRoute(app);

// Safety nets, same as server.js: log an unhandled rejection instead of
// crashing (the guarded routes above should make this rare; when it fires,
// treat the log as a bug and add try/catch at the source), and exit on an
// uncaught synchronous exception so PM2 restarts a clean process.
process.on('unhandledRejection', (reason) => {
  logCritical('UNHANDLED PROMISE REJECTION', { reason });
});
process.on('uncaughtException', (err) => {
  logCritical('UNCAUGHT EXCEPTION (PROCESS WILL EXIT)', { error: err });
  process.exit(1);
});

const port = process.env.AUTH_PORT || 3004;
const server = app.listen(port, () => {
  console.log(`[INFO] Auth Server running on port ${port}`);
});

// Graceful drain — same rationale as server.js: deploys must not kill
// requests mid-write (account creation / stamps-adjacent session writes).
let drainStarted = false;
const drain = (signal) => {
  if (drainStarted) return;
  drainStarted = true;
  console.log(`[INFO] ${signal} received — draining in-flight requests`);
  server.close(() => process.exit(0));
  if (server.closeIdleConnections) server.closeIdleConnections();
  setTimeout(() => {
    console.error('[WARN] drain timed out after 10s — exiting with requests in flight');
    process.exit(0);
  }, 10000).unref();
};
process.on('SIGTERM', () => drain('SIGTERM'));
process.on('SIGINT', () => drain('SIGINT'));
