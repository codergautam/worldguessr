import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';
import {
  getDailyMetaSchedulePath, dailyMetaPublishedAt,
  validateDailyMetaSchedule, validateDailyMetaUpdate,
} from './dailyMetaSchedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROUNDS_PER_DAY = 3;
// Curated daily-challenge pool. Country sits at extra.tags[0] (ISO-2). We
// derive a flat shape on first load so getDailyLocations stays branch-free.
const POOL_PATH = path.join(__dirname, '..', 'data', 'daily-challenge.json');
// Same mapping the web/mobile continent guesser uses; server reads it via fs
// because this module also runs outside the Next bundler.
const CONTINENTS_PATH = path.join(__dirname, '..', 'public', 'continentMapping.json');
const SECRET = process.env.DAILY_SECRET || 'worldguessr-daily-default-secret';
const CACHE_SIZE = 14;
// Hand-scheduled "meta" days (docs/daily-metas.md): date -> the day's three
// locations, each carrying the tips shown on the reveal. A scheduled date
// bypasses the seeded draw entirely; every other date is untouched. Defaults
// to data/daily-metas.json, with DAILY_META_SCHEDULE_PATH as an optional override.
//
// Resolved on first use, not at import: server.js registers API routes with
// a dynamic import that has no rejection handler, so a throw here at module
// scope silently left every /api/dailyChallenge/* route unregistered. A bad
// path now logs once at first use and fails each daily request with a clear
// message instead.
let metasPathResolved = false;
let metasPath = null;
let metasPathError = null;
function resolveMetasPath() {
  if (!metasPathResolved) {
    metasPathResolved = true;
    try {
      metasPath = getDailyMetaSchedulePath();
      console.log(`[dailyChallenge] meta schedule: ${metasPath}`);
    } catch (err) {
      metasPathError = err;
      console.error('[dailyChallenge] DAILY_META_SCHEDULE_PATH rejected; daily requests will fail until it is fixed:', err?.message);
    }
  }
  if (metasPathError) throw metasPathError;
  return metasPath;
}

// Check before the date cache: publishing a future date must also invalidate
// an already-cached seeded draw for it. Include inode/ctime/size so atomic
// replacements do not depend on mtime having a different clock tick.
let metaScheduleCache = null;
let metaScheduleVersion = null;
let metaScheduleAcceptedVersion = null;
let metaScheduleAcceptedStamp = null;
let metaScheduleObservedAt = null;
let metaScheduleError = null;
const scheduleVersion = (stat) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
function loadMetaSchedule() {
  const METAS_PATH = resolveMetasPath();
  try {
    if (scheduleVersion(fs.statSync(METAS_PATH)) === metaScheduleVersion) {
      if (metaScheduleCache) {
        if (metaScheduleVersion === metaScheduleAcceptedVersion) metaScheduleObservedAt = Date.now();
        return metaScheduleCache;
      }
      throw metaScheduleError;
    }
    // Read metadata and bytes from the same open file, even if the publisher
    // replaces the path between stat and read.
    const fd = fs.openSync(METAS_PATH, 'r');
    let raw, stat;
    try {
      stat = fs.fstatSync(fd);
      raw = fs.readFileSync(fd, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
    metaScheduleVersion = scheduleVersion(stat);
    const next = validateDailyMetaSchedule(JSON.parse(raw));
    // This worker may miss several valid publications across UTC midnight.
    // Protect dates already immutable when it observed its baseline; one file
    // mtime cannot establish when every intervening date was first published.
    // The validated atomic publisher enforces the full history at publication.
    const now = Date.now();
    // The importer stamps its own publication time inside the file. The file
    // mtime is only a fallback: a copy to the host on a later UTC day resets
    // it, which made warm workers protect dates that were legal to add when
    // the file was authored while restarted workers accepted them.
    const stamp = dailyMetaPublishedAt(next);
    const publishedAt = Math.min(stamp ?? stat.mtimeMs, now);
    if (metaScheduleCache) {
      // A publication older than the one in use (a restored backup) would
      // carry an early stamp and pass the date check for dates players have
      // already been served. Keep the newer schedule.
      if (metaScheduleAcceptedStamp !== null) {
        // Once this worker has accepted a stamped schedule, an UNSTAMPED
        // replacement is a pre-stamp backup: its old mtime would move the
        // protected window back and let already-served dates change.
        if (stamp === null) {
          throw new Error(`schedule has no _publishedAt stamp but the accepted schedule was published ${new Date(metaScheduleAcceptedStamp).toISOString()}`);
        }
        if (stamp < metaScheduleAcceptedStamp) {
          throw new Error(`schedule published ${new Date(stamp).toISOString()} is older than the accepted ${new Date(metaScheduleAcceptedStamp).toISOString()}`);
        }
      }
      validateDailyMetaUpdate(metaScheduleCache, next, Math.min(metaScheduleObservedAt, publishedAt));
    }
    for (const date of locationCache.keys()) {
      if (!isDeepStrictEqual(metaScheduleCache?.[date], next[date])) locationCache.delete(date);
    }
    metaScheduleCache = next;
    metaScheduleAcceptedVersion = metaScheduleVersion;
    metaScheduleAcceptedStamp = stamp;
    metaScheduleObservedAt = now;
    metaScheduleError = null;
  } catch (err) {
    if (err !== metaScheduleError) console.error('[dailyChallenge] schedule rejected, keeping last valid version', err?.message);
    metaScheduleError = err;
    // Cold workers cannot know which puzzle players already received. An
    // explicitly configured but unreadable schedule must fail closed.
    if (!metaScheduleCache) throw err;
  }
  return metaScheduleCache;
}

let poolCache = null;
function loadPool() {
  if (poolCache) return poolCache;
  const raw = fs.readFileSync(POOL_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const continents = JSON.parse(fs.readFileSync(CONTINENTS_PATH, 'utf8'));
  poolCache = parsed.map(loc => {
    const country = loc?.extra?.tags?.[0] || null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      heading: loc.heading ?? 0,
      country,
      continent: (country && continents[country]) || null,
    };
  });
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

// Three rounds, three different countries, and (when enforceContinents)
// never all three on the same continent. Skip-and-retry preserves seed
// determinism (the same date always produces the same picks), and only
// kicks in on offending draws — dates whose first picks already satisfy
// the constraints are unchanged. The attempts cap is a defensive guard
// so we can never spin if the pool can't satisfy the constraints.
function drawLocations(pool, seed, enforceContinents) {
  const rng = mulberry32(seed);
  const picked = [];
  const pickedContinents = [];
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
    // Last slot: the finished trio must provably span at least two
    // continents. Unmapped continents (null) never count toward
    // distinctness, so gaps in the mapping can't sneak a trio through.
    if (enforceContinents && picked.length === ROUNDS_PER_DAY - 1) {
      const known = new Set([...pickedContinents, loc.continent].filter(Boolean));
      if (known.size < 2) continue;
    }
    usedIndexes.add(idx);
    if (loc.country) usedCountries.add(loc.country);
    pickedContinents.push(loc.continent);
    picked.push({
      lat: loc.lat,
      long: loc.lng,
      heading: loc.heading,
      country: loc.country,
    });
  }
  return picked;
}

export function getDailyLocations(dateStr) {
  const schedule = loadMetaSchedule();
  const cached = locationCache.get(dateStr);
  if (cached) return cached;

  // Every date in the accepted schedule has already passed whole-file validation.
  const scheduled = schedule[dateStr];
  if (scheduled) {
    const picked = scheduled.map(loc => ({
      lat: loc.lat,
      long: loc.lng,
      heading: loc.heading ?? 0,
      country: loc.country || null,
      metas: Array.isArray(loc.metas) ? loc.metas : [],
    }));
    cacheSet(dateStr, picked);
    return picked;
  }

  const pool = loadPool();
  const seed = seedFromDate(dateStr);

  // A short day would break scoring, so if the continent constraint is
  // ever unsatisfiable (e.g. a future pool batch with unmapped countries
  // hogging the draw), redraw without it rather than serve < 3 rounds.
  let picked = drawLocations(pool, seed, true);
  if (picked.length < ROUNDS_PER_DAY) {
    picked = drawLocations(pool, seed, false);
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
  const epoch = Date.parse('2026-04-27T00:00:00Z');
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
