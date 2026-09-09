import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';
import countries from 'i18n-iso-countries';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY_MS = 24 * 60 * 60 * 1000;

function outsideCheckout(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

export function getDailyMetaSchedulePath() {
  const configured = process.env.DAILY_META_SCHEDULE_PATH;
  if (!configured) return path.join(ROOT, 'data', 'daily-metas.json');
  if (!path.isAbsolute(configured)) throw new Error('DAILY_META_SCHEDULE_PATH must be absolute');
  const resolved = path.resolve(configured);
  if (!outsideCheckout(resolved)) throw new Error('DAILY_META_SCHEDULE_PATH must be outside the checkout');
  // A symlink must not turn a private-looking path into a file inside Git.
  let existing = resolved;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  if (!outsideCheckout(fs.realpathSync(existing))) {
    throw new Error('DAILY_META_SCHEDULE_PATH must resolve outside the checkout');
  }
  return resolved;
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const bounded = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const realDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function invalid(where, message) {
  throw new Error(`Invalid daily meta schedule at ${where}: ${message}`);
}

// The one non-date key a schedule may carry. The importer stamps the moment
// it published the file so a worker can judge which dates were legal to add
// from the AUTHORING time, not from the file's mtime: a copy to the host a
// UTC day later (scp without -p, a deploy after midnight) resets mtime and
// used to make warm workers reject dates that cold workers accepted, which
// split one date across two puzzles.
export const PUBLISHED_AT_KEY = '_publishedAt';

export function dailyMetaPublishedAt(schedule) {
  const stamp = Date.parse(schedule?.[PUBLISHED_AT_KEY]);
  return Number.isFinite(stamp) ? stamp : null;
}

export function validateDailyMetaSchedule(schedule) {
  if (!isRecord(schedule)) invalid('root', 'expected a date-to-locations object');
  for (const [date, day] of Object.entries(schedule)) {
    if (date === PUBLISHED_AT_KEY) {
      if (typeof day !== 'string' || !Number.isFinite(Date.parse(day))) invalid(date, 'expected an ISO timestamp');
      continue;
    }
    if (!realDate(date)) invalid(date, 'expected a real UTC date (YYYY-MM-DD)');
    if (!Array.isArray(day) || day.length !== 3) invalid(date, 'expected exactly three locations');
    day.forEach((loc, index) => {
      const where = `${date}[${index}]`;
      if (!isRecord(loc) || !bounded(loc.lat, -90, 90) || !bounded(loc.lng, -180, 180)) {
        invalid(where, 'latitude/longitude must be finite and within geographic bounds');
      }
      if (typeof loc.country !== 'string' || !/^[A-Z]{2}$/.test(loc.country) || !countries.isValid(loc.country)) {
        invalid(where, 'country must be an uppercase ISO-2 code');
      }
      if (loc.heading !== undefined && !Number.isFinite(loc.heading)) invalid(where, 'heading must be finite');
      if (loc.title !== undefined && typeof loc.title !== 'string') invalid(where, 'title must be text');
      if (!Array.isArray(loc.metas) || loc.metas.length === 0) invalid(where, 'expected at least one meta');
      loc.metas.forEach((meta, metaIndex) => {
        const at = `${where}.metas[${metaIndex}]`;
        if (!isRecord(meta) || !isText(meta.title) || !isText(meta.explanation)) {
          invalid(at, 'title and explanation must be nonempty text');
        }
        if (!isRecord(meta.view) || !Number.isFinite(meta.view.heading)) invalid(at, 'view.heading must be finite');
        if (meta.view.lat !== undefined && !bounded(meta.view.lat, -90, 90)) invalid(at, 'view.lat is out of bounds');
        if (meta.view.lng !== undefined && !bounded(meta.view.lng, -180, 180)) invalid(at, 'view.lng is out of bounds');
        if (meta.view.pitch !== undefined && !bounded(meta.view.pitch, -90, 90)) invalid(at, 'view.pitch is out of bounds');
        if (meta.view.zoom !== undefined && (!Number.isFinite(meta.view.zoom) || meta.view.zoom < 0)) invalid(at, 'view.zoom must be finite and nonnegative');
        if (meta.category !== undefined && typeof meta.category !== 'string') invalid(at, 'category must be text');
        if (meta.hint !== undefined && typeof meta.hint !== 'string') invalid(at, 'hint must be text');
        if (meta.image !== undefined) {
          let url;
          try { url = new URL(meta.image); } catch { invalid(at, 'image must be an HTTP(S) URL'); }
          if (typeof meta.image !== 'string' || !['http:', 'https:'].includes(url.protocol)) invalid(at, 'image must be an HTTP(S) URL');
        }
      });
    });
  }
  return schedule;
}

// The public endpoint already exposes dates up to 48 hours ahead, including
// UTC today+2. Only today+3 and later are safe to publish or replace.
export function earliestDailyMetaDate(now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  return new Date(Date.parse(`${today}T00:00:00Z`) + 3 * DAY_MS).toISOString().slice(0, 10);
}

export function validateDailyMetaUpdate(previous, next, now = Date.now()) {
  validateDailyMetaSchedule(previous);
  validateDailyMetaSchedule(next);
  const earliest = earliestDailyMetaDate(now);
  for (const date of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (date === PUBLISHED_AT_KEY) continue;
    if (date < earliest && !isDeepStrictEqual(previous[date], next[date])) {
      throw new Error(`Cannot change protected daily date ${date}; only dates >= ${earliest} may change`);
    }
  }
  return next;
}
