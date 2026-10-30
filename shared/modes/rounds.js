// Round generation for the quiz modes: the same function builds a party's
// rounds on the ws server and a singleplayer game's rounds in the browser, so
// the two can never drift. Pure: the caller supplies the rng (Math.random in
// production, seededRng in tests) and, for manifest modes, the pool.
//
// Every round is a "location" with lat/long so the rest of the game (round
// history, reveal map, summary, persistence) treats it like a classic round:
//   flags / shapes  { mode, country, lat, long }
//   languages       { mode, country, lat, long, lang, text, choices, spokenIn }
//   manifest modes  { mode, country, lat, long, id, label, image }

import { getMode, isQuizMode } from './catalog.js';
import { QUIZ_COUNTRIES, QUIZ_COUNTRY_BY_CODE } from './data/countries.js';
import { QUIZ_LANGUAGES, QUIZ_LANGUAGE_BY_ID } from './data/languages.js';

// Casual default: micro-states (tier 3) only appear once the rest of the
// region is used up. Raising this to 3 would put Nauru in a 10-round game.
const DEFAULT_MAX_TIER = 2;

// mulberry32: tiny, deterministic, good enough for shuffles. Tests and
// reproducible singleplayer runs use it; production passes Math.random.
export function seededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Local Fisher-Yates (shared/ cannot import components/utils/shuffle.js).
function shuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function inRegion(country, region) {
  return region === 'all' || country.continent === region;
}

// Draw `count` items without repeats while the pool lasts, then widen to the
// harder tier, then repeat (same fallback the community-map path takes when a
// map has fewer locations than rounds).
function draw(primary, secondary, count, rng) {
  let picked = shuffle(primary, rng).slice(0, count);
  if (picked.length < count) picked = picked.concat(shuffle(secondary, rng).slice(0, count - picked.length));
  const all = primary.concat(secondary);
  while (picked.length < count && all.length) picked.push(all[Math.floor(rng() * all.length)]);
  return picked;
}

function countryRounds(spec, { count, region, rng, exclude }) {
  const ok = (c) => !exclude.has(c.code) && inRegion(c, region) && (spec.pool !== 'shapes' || c.shapeOk);
  const easy = QUIZ_COUNTRIES.filter((c) => ok(c) && c.tier <= DEFAULT_MAX_TIER);
  const hard = QUIZ_COUNTRIES.filter((c) => ok(c) && c.tier > DEFAULT_MAX_TIER);
  if (!easy.length && !hard.length) throw new Error(`generateRounds: empty pool for ${spec.id} / ${region}`);
  return draw(easy, hard, count, rng).map((c) => ({
    mode: spec.id,
    country: c.code,
    lat: c.lat,
    long: c.long,
  }));
}

// Distractors that look like the answer: same script counts most (Cyrillic
// next to Cyrillic), then same family, then same continent. The n-1 picks are
// drawn from the n+1 best so the set still varies between rounds without
// turning every Russian round into Russian vs four other Cyrillic languages.
export function pickLanguageChoices(answerId, n, rng, langs = QUIZ_LANGUAGES) {
  const answer = langs.find((l) => l.id === answerId);
  if (!answer) throw new Error(`pickLanguageChoices: unknown language ${answerId}`);
  const continentOf = (l) => QUIZ_COUNTRY_BY_CODE[l.country]?.continent;
  const ranked = langs
    .filter((l) => l.id !== answerId)
    .map((l) => ({
      id: l.id,
      score: (l.script === answer.script ? 3 : 0)
        + (l.family === answer.family ? 2 : 0)
        + (continentOf(l) === continentOf(answer) ? 1 : 0)
        + rng() * 0.5,
    }))
    .sort((a, b) => b.score - a.score);
  const distractors = shuffle(ranked.slice(0, n + 1), rng).slice(0, n - 1).map((r) => r.id);
  return shuffle([answerId, ...distractors], rng);
}

function languageRounds(spec, { count, rng, exclude }) {
  const easy = QUIZ_LANGUAGES.filter((l) => !exclude.has(l.id) && l.tier <= DEFAULT_MAX_TIER);
  const hard = QUIZ_LANGUAGES.filter((l) => !exclude.has(l.id) && l.tier > DEFAULT_MAX_TIER);
  return draw(easy, hard, count, rng).map((l) => {
    const country = QUIZ_COUNTRY_BY_CODE[l.country];
    return {
      mode: spec.id,
      country: l.country,
      lat: country.lat,
      long: country.long,
      lang: l.id,
      text: l.text,
      spokenIn: l.spokenIn,
      choices: pickLanguageChoices(l.id, spec.choices, rng),
    };
  });
}

function manifestRounds(spec, { count, region, rng, pool, exclude }) {
  const items = (pool || []).filter((it) => !exclude.has(it.id)
    && (region === 'all' || QUIZ_COUNTRY_BY_CODE[it.country]?.continent === region));
  if (!items.length) throw new Error(`generateRounds: empty pool for ${spec.id} / ${region}`);
  return draw(items, [], count, rng).map((it) => ({
    mode: spec.id,
    id: it.id,
    country: it.country,
    lat: it.lat ?? QUIZ_COUNTRY_BY_CODE[it.country]?.lat,
    long: it.long ?? QUIZ_COUNTRY_BY_CODE[it.country]?.long,
    label: it.label,
    image: it.image,
  }));
}

/**
 * @param {object} a
 * @param {string} a.mode     a quiz mode id (classic throws: it has pools of its own)
 * @param {number} a.count    rounds to produce
 * @param {string} [a.region] 'all' or a continent (ignored when the mode has no regions)
 * @param {Array}  [a.pool]   manifest items, required for manifest modes
 * @param {() => number} [a.rng]
 * @param {Iterable<string>} [a.exclude] country codes / language ids / item ids to skip
 */
export function generateRounds({ mode, count, region = 'all', pool, rng = Math.random, exclude = [] }) {
  const spec = getMode(mode);
  if (!spec || !isQuizMode(mode)) throw new Error(`generateRounds: not a quiz mode: ${mode}`);
  if (!Number.isInteger(count) || count < 1) throw new Error(`generateRounds: bad count ${count}`);
  const args = { count, region: spec.supportsRegion ? region : 'all', rng, pool, exclude: new Set(exclude) };
  if (spec.pool === 'countries' || spec.pool === 'shapes') return countryRounds(spec, args);
  if (spec.pool === 'languages') return languageRounds(spec, args);
  return manifestRounds(spec, args);
}

// How many items a run of this mode draws from, for the Quizzes page: the
// countries in the region (with a fair silhouette, for shapes), every
// language, or a manifest's items.
export function poolSize({ mode, region = 'all', pool }) {
  const spec = getMode(mode);
  if (!spec || !isQuizMode(mode)) return 0;
  const r = spec.supportsRegion ? region : 'all';
  if (spec.pool === 'countries' || spec.pool === 'shapes') {
    return QUIZ_COUNTRIES.filter((c) => inRegion(c, r) && (spec.pool !== 'shapes' || c.shapeOk)).length;
  }
  if (spec.pool === 'languages') return QUIZ_LANGUAGES.length;
  return Array.isArray(pool) ? pool.length : 0;
}

// Where a choice-mode answer "lands": the label point of the chosen language's
// country, so player.guess can stay a [lat, lng] pair on the server.
export function choicePoint(mode, choiceId) {
  const spec = getMode(mode);
  if (!spec || spec.input !== 'choice') return null;
  const lang = QUIZ_LANGUAGE_BY_ID[choiceId];
  const country = lang && QUIZ_COUNTRY_BY_CODE[lang.country];
  return country ? { lat: country.lat, long: country.long } : null;
}
