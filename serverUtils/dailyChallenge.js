import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROUNDS_PER_DAY = 3;
// Curated daily-challenge pool. Country sits at extra.tags[0] (ISO-2). We
// derive a flat shape on first load so getDailyLocations stays branch-free.
const POOL_PATH = path.join(__dirname, '..', 'data', 'daily-challenge.json');
const SECRET = process.env.DAILY_SECRET || 'worldguessr-daily-default-secret';
const CACHE_SIZE = 14;

let poolCache = null;
function loadPool() {
  if (poolCache) return poolCache;
  const raw = fs.readFileSync(POOL_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  poolCache = parsed.map(loc => ({
    lat: loc.lat,
    lng: loc.lng,
    heading: loc.heading ?? 0,
    country: loc?.extra?.tags?.[0] || null,
  }));
  return poolCache;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromDate(dateStr) {
  const h = crypto.createHash('sha256').update(`${dateStr}|${SECRET}`).digest();
  return h.readUInt32BE(0);
}

const locationCache = new Map();
function cacheSet(key, value) {
  locationCache.set(key, value);
  if (locationCache.size > CACHE_SIZE) {
    const oldestKey = locationCache.keys().next().value;
    locationCache.delete(oldestKey);
  }
}

export function getDailyLocations(dateStr) {
  const cached = locationCache.get(dateStr);
  if (cached) return cached;

  const pool = loadPool();
  const rng = mulberry32(seedFromDate(dateStr));

  // Three rounds, three different countries — no day should serve two
  // locations from the same country. Skip-and-retry preserves seed
  // determinism (the same date always produces the same picks). The
  // attempts cap is a defensive guard so we can never spin if a future
  // pool somehow lacks 3 distinct countries.
  const picked = [];
  const usedIndexes = new Set();
  const usedCountries = new Set();
  const maxAttempts = pool.length * 2;
  let attempts = 0;
  while (picked.length < ROUNDS_PER_DAY && attempts < maxAttempts) {
    attempts++;
    const idx = Math.floor(rng() * pool.length);
    if (usedIndexes.has(idx)) continue;
    const loc = pool[idx];
    if (loc.country && usedCountries.has(loc.country)) continue;
    usedIndexes.add(idx);
    if (loc.country) usedCountries.add(loc.country);
    picked.push({
      lat: loc.lat,
      long: loc.lng,
      heading: loc.heading,
      country: loc.country,
    });
  }

  cacheSet(dateStr, picked);
  return picked;
}

export function isValidDailyDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target)) return false;
  const diff = target - now;
  return diff >= -2 * oneDay && diff <= 2 * oneDay;
}

export function challengeNumberForDate(dateStr) {
  const epoch = Date.parse('2026-04-16T00:00:00Z');
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  return Math.max(1, Math.floor((target - epoch) / (24 * 60 * 60 * 1000)) + 1);
}

const SESSION_TTL_MS = 12 * 60 * 1000;

export function issueSessionToken(dateStr) {
  const issuedAt = Date.now();
  const payload = `${dateStr}.${issuedAt}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 24);
  return `${dateStr}.${issuedAt}.${hmac}`;
}

export function verifySessionToken(token, expectedDate) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [date, issuedAtStr, hmac] = parts;
  if (date !== expectedDate) return false;
  const issuedAt = parseInt(issuedAtStr, 10);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_TTL_MS) return false;
  const payload = `${date}.${issuedAt}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 24);
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
}
