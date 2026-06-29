/*
Standalone auth server — isolates login + signup endpoints (googleAuth, setName)
so they keep working when the main API server is overloaded.
*/

import { config } from 'dotenv';
config();

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
import { registerCacheBusRoute } from './serverUtils/cacheBus.js';

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

app.all('/api/googleAuth', (req, res) => googleAuthHandler(req, res));
app.all('/api/setName', (req, res) => setNameHandler(req, res));
registerCacheBusRoute(app);

const port = process.env.AUTH_PORT || 3004;
app.listen(port, () => {
  console.log(`[INFO] Auth Server running on port ${port}`);
});
