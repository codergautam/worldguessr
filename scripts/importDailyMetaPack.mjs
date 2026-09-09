#!/usr/bin/env node
// Import a geocoach meta pack into data/daily-metas.json by default.
// DAILY_META_SCHEDULE_PATH optionally overrides the file (docs/daily-metas.md).
//
//   node scripts/importDailyMetaPack.mjs /private/pack.json --start YYYY-MM-DD --dry-run
//   node scripts/importDailyMetaPack.mjs /private/pack.json --start YYYY-MM-DD --country 6=QA --country 17=LK
//   node scripts/importDailyMetaPack.mjs /private/pack.json --start YYYY-MM-DD --force   # overwrite future dates
//
// Pack format (kind "geocoach.meta-pack", spec_version 1):
//   { locations: [{ title, country_code?, view: { lat, lng, heading, pitch, zoom, pano_id },
//                   metas: [{ title, explanation, hints?: string[], images?: [{ url, kind }],
//                             view: { heading, pitch, zoom } }] }] }
// Locations are taken in file order, PER_DAY (3) per date, Day 1 = --start.
// A location without country_code is resolved offline from public/genBorders.json;
// pass --country <1-based index>=<ISO2> when that lookup fails.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import {
  getDailyMetaSchedulePath, validateDailyMetaSchedule,
  earliestDailyMetaDate, validateDailyMetaUpdate, PUBLISHED_AT_KEY,
} from '../serverUtils/dailyMetaSchedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_PATH = getDailyMetaSchedulePath();
const BORDERS_PATH = path.join(ROOT, 'public', 'genBorders.json');
const PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const packPath = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--start' && argv[i - 1] !== '--country');
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const has = (name) => argv.includes(name);
const start = flag('--start');
const dryRun = has('--dry-run');
const force = has('--force');
const countryOverrides = {};
argv.forEach((a, i) => {
  if (a !== '--country') return;
  const m = /^(\d+)=([A-Za-z]{2})$/.exec(argv[i + 1] || '');
  if (!m) fail(`--country expects <index>=<ISO2>, got "${argv[i + 1]}"`);
  countryOverrides[Number(m[1])] = m[2].toUpperCase();
});

if (!packPath) fail('usage: importDailyMetaPack.mjs <pack.json> --start YYYY-MM-DD [--dry-run] [--force] [--country n=XX]');
if (has('--allow-live')) fail('--allow-live is no longer supported: accessible dates must remain unchanged');
if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) fail('--start YYYY-MM-DD is required');
const startMs = Date.parse(`${start}T00:00:00Z`);
if (Number.isNaN(startMs) || new Date(startMs).toISOString().slice(0, 10) !== start) fail(`--start "${start}" is not a real date`);
const todayUtc = new Date().toISOString().slice(0, 10);
// The locations API already accepts UTC today + 2, before local-date players
// reach it. Publish at least three UTC calendar days ahead to preserve puzzles.
const earliestStart = earliestDailyMetaDate();
if (start < earliestStart) {
  fail(`--start must be at least three UTC calendar days out (>= ${earliestStart}, today is UTC ${todayUtc}); got ${start}`);
}

// ---- pack -------------------------------------------------------------------
const rawText = fs.readFileSync(path.resolve(packPath), 'utf8');
const braceAt = rawText.indexOf('{');
if (braceAt === -1) fail('pack has no JSON object');
if (braceAt > 0) console.warn(`note: ignoring ${braceAt} stray character(s) before the JSON`);
let pack;
try {
  pack = JSON.parse(rawText.slice(braceAt));
} catch (err) {
  fail(`pack is not valid JSON: ${err.message}`);
}
if (pack.kind !== 'geocoach.meta-pack' || pack.spec_version !== 1) {
  console.warn(`note: expected kind geocoach.meta-pack spec 1, got ${pack.kind} spec ${pack.spec_version}`);
}
const locations = pack.locations;
if (!Array.isArray(locations) || locations.length === 0) fail('pack.locations is empty');
if (locations.length % PER_DAY !== 0) {
  fail(`${locations.length} locations is not a multiple of ${PER_DAY}; a day must have exactly ${PER_DAY}`);
}

// ---- offline country lookup (same ring test as components/findCountryLocal.js)
let borderIndex = null;
function countryAt(lat, lng) {
  if (!borderIndex) {
    const geo = JSON.parse(fs.readFileSync(BORDERS_PATH, 'utf8'));
    borderIndex = [];
    for (const f of geo.features) {
      const code = f.properties?.code;
      if (!code) continue;
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        const ring = poly[0];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        borderIndex.push({ code, ring, minX, maxX, minY, maxY });
      }
    }
  }
  for (const e of borderIndex) {
    if (lng < e.minX || lng > e.maxX || lat < e.minY || lat > e.maxY) continue;
    let inside = false;
    const r = e.ring;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    if (inside) return e.code;
  }
  return null;
}

// ---- country mention ----------------------------------------------------------
// A tip that never names its country ("Rounded top with a black stripe") leaves
// the player guessing what the tip is FOR. When neither the meta title nor the
// explanation names the location's country, the explanation gets one last
// line: "Common in Switzerland." Names come from ICU; demonyms that do not
// share a stem with the country name are listed here.
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
const IRREGULAR_DEMONYMS = {
  AE: ['UAE', 'Emirati'], CH: ['Swiss'], CY: ['Cypriot'], CZ: ['Czech'], DE: ['German'],
  DK: ['Danish', 'Dane'], ES: ['Spanish', 'Spaniard'], FI: ['Finnish', 'Finn'], FR: ['French'],
  GB: ['UK', 'British', 'Britain', 'England', 'English', 'Scotland', 'Scottish', 'Wales', 'Welsh'],
  GR: ['Greek'], IE: ['Irish'], IS: ['Icelandic'], KR: ['Korean', 'Korea'], NL: ['Dutch', 'Holland'], NZ: ['Kiwi'],
  PH: ['Filipino', 'Philippine'], PL: ['Polish', 'Pole'], SE: ['Swedish', 'Swede'], TH: ['Thai'],
  US: ['US', 'U.S.', 'USA', 'American', 'America'],
};
// Names that read wrong without an article.
const NEEDS_THE = /^(United|Netherlands|Philippines|Bahamas|Gambia|Maldives|Seychelles|Comoros)|(Republic|Islands|Kingdom|Emirates)$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function countryName(code) {
  try { return REGION_NAMES.of(code) || code; } catch { return code; }
}
function mentionsCountry(text, code) {
  const name = countryName(code);
  const hay = ` ${text} `;
  const terms = [name, ...(IRREGULAR_DEMONYMS[code] || [])];
  // Stems catch the regular demonyms: Mexic(an), Canad(ian), Kyrgyz(stan),
  // Argentin(e), Japan(ese). Word-prefix, at least 4 letters.
  for (let cut = 1; cut <= 4; cut++) {
    const stem = name.slice(0, name.length - cut);
    if (stem.length >= 4) terms.push(stem);
  }
  return terms.some(t => new RegExp(`(^|[^\\p{L}])${escapeRe(t)}`, 'iu').test(hay));
}
// Joined onto the last sentence, not a new line: the card shows the whole
// tip at rest, and a line of its own would only make it taller.
function withCountryLine(explanation, title, code) {
  if (!code || mentionsCountry(`${title}\n${explanation}`, code)) return explanation;
  const name = countryName(code);
  const sentence = `Common in ${NEEDS_THE.test(name) ? 'the ' : ''}${name}.`;
  if (!explanation) return sentence;
  const body = explanation.replace(/[\s.]+$/, '');
  return `${body}. ${sentence}`;
}
// Three lines at the resting width is about this many characters. Longer
// tips grow the card, so the importer warns.
const TIP_SOFT_MAX = 150;

// ---- normalize --------------------------------------------------------------
const num = (v) => (Number.isFinite(v) ? v : null);
// One flowing paragraph. The pack's paragraph breaks are flattened (owner:
// line breaks in a three-line tip read as broken layout on both clients).
const oneLine = (s) => String(s).replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
const problems = [];
const days = [];

locations.forEach((loc, i) => {
  const n = i + 1;
  const v = loc?.view || {};
  const lat = num(v.lat);
  const lng = num(v.lng);
  if (lat === null || lng === null) problems.push(`#${n} "${loc?.title}": view.lat/lng missing`);
  const heading = num(v.heading);
  if (heading === null) problems.push(`#${n} "${loc?.title}": view.heading missing`);

  let country = countryOverrides[n] || (typeof loc.country_code === 'string' ? loc.country_code.toUpperCase() : null);
  const looked = lat !== null && lng !== null ? countryAt(lat, lng) : null;
  if (!country) {
    if (looked) country = looked;
    else problems.push(`#${n} "${loc?.title}": no country_code and border lookup failed; pass --country ${n}=XX`);
  } else if (looked && looked !== country && !countryOverrides[n]) {
    console.warn(`warn: #${n} "${loc.title}" country_code ${country} but coordinates fall in ${looked}`);
  }

  const metas = Array.isArray(loc.metas) ? loc.metas : [];
  if (metas.length === 0) problems.push(`#${n} "${loc?.title}": no metas`);
  const outMetas = metas.map((m, mi) => {
    const mv = m?.view || {};
    if (!m?.title) problems.push(`#${n} meta ${mi + 1}: no title`);
    if (!m?.explanation) problems.push(`#${n} meta ${mi + 1}: no explanation`);
    if (num(mv.heading) === null) problems.push(`#${n} meta ${mi + 1} "${m?.title}": view.heading missing`);
    const view = { heading: num(mv.heading) ?? heading ?? 0 };
    if (num(mv.pitch) !== null) view.pitch = mv.pitch;
    if (num(mv.zoom) !== null) view.zoom = mv.zoom;
    const title = oneLine(m?.title || '');
    const explanation = withCountryLine(oneLine(m?.explanation || ''), title, country);
    if (explanation.length > TIP_SOFT_MAX) console.warn(`warn: #${n} "${title}" tip is ${explanation.length} chars (over ${TIP_SOFT_MAX}); the card grows to fit it`);
    const out = { title, explanation, view };
    if (typeof m?.category === 'string' && m.category.trim()) out.category = oneLine(m.category);
    const hint = Array.isArray(m?.hints) ? m.hints.find(h => typeof h === 'string' && h.trim()) : null;
    if (hint) out.hint = oneLine(hint);
    const imgs = Array.isArray(m?.images) ? m.images : [];
    const img = imgs.find(x => x?.kind === 'example' && x.url) || imgs.find(x => x?.url);
    if (img) out.image = img.url;
    return out;
  });

  const dayIdx = Math.floor(i / PER_DAY);
  if (!days[dayIdx]) days[dayIdx] = [];
  days[dayIdx].push({ lat, lng, heading: heading ?? 0, country, title: oneLine(loc?.title || ''), metas: outMetas });
});

if (problems.length) fail(`pack has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);

// ---- merge ------------------------------------------------------------------
let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  validateDailyMetaSchedule(existing);
} catch (err) {
  if (err.code !== 'ENOENT') fail(`Cannot read the existing schedule; refusing to replace it: ${err.message}`);
}

const dateFor = (dayIdx) => new Date(startMs + dayIdx * DAY_MS).toISOString().slice(0, 10);
const clashes = days.map((_, d) => dateFor(d)).filter(date => existing[date]);
if (clashes.length && !force) fail(`already scheduled: ${clashes.join(', ')} (use --force to overwrite)`);

const merged = { ...existing };
days.forEach((locs, d) => { merged[dateFor(d)] = locs; });
const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
try {
  validateDailyMetaUpdate(existing, sorted);
} catch (err) {
  fail(err.message);
}

console.log(`\n${pack.name || packPath}: ${locations.length} locations -> ${days.length} day(s)\n`);
days.forEach((locs, d) => {
  console.log(dateFor(d));
  locs.forEach(l => console.log(`  ${l.country}  ${l.title}  [${l.metas.map(m => m.title).join(' / ')}]`));
});

if (dryRun) {
  console.log('\n--dry-run: nothing written');
} else {
  // Readers see the complete old file or the complete new file. Never truncate
  // the live schedule. Temp files share its filesystem so rename is atomic.
  const temporary = `${OUT_PATH}.${randomUUID()}.tmp`;
  let fd;
  try {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true, mode: 0o700 });
    fd = fs.openSync(temporary, 'wx', 0o600);
    const publishedAt = Date.now();
    // Stamped INSIDE the file (see PUBLISHED_AT_KEY): a worker judges which
    // dates were legal to add from this authoring time, so copying the file
    // to a host on a later UTC day cannot make it reject them.
    sorted[PUBLISHED_AT_KEY] = new Date(publishedAt).toISOString();
    validateDailyMetaUpdate(existing, sorted, publishedAt);
    fs.writeFileSync(fd, JSON.stringify(sorted, null, 2) + '\n');
    fs.futimesSync(fd, publishedAt / 1000, publishedAt / 1000);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // A large import can cross UTC midnight after its initial date check.
    validateDailyMetaUpdate(existing, sorted);
    fs.renameSync(temporary, OUT_PATH);
  } catch (err) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch { /* no temporary file was created */ }
    fail(`Schedule was not published: ${err.message}`);
  }
  const scheduledDates = Object.keys(sorted).filter((key) => key !== PUBLISHED_AT_KEY).length;
  console.log(`\nwrote ${OUT_PATH} (${scheduledDates} scheduled date(s))`);
}
