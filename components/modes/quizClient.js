// Client-side glue for the quiz modes (flags / shapes / languages). Pure
// helpers only; anything that touches the browser lives in loadShapes.js and
// preloadStimulus below (guarded). The registry itself is shared/modes/catalog.js.

import { MODES, DEFAULT_MODE, getMode, isQuizMode } from '../../shared/modes/catalog.js';
import { MAX_TRIES } from '../../shared/modes/score.js';

// The quiz spec for a mode id, or null for classic / unknown / missing.
export function quizOf(id) {
  return isQuizMode(id) ? getMode(id) : null;
}

// Singleplayer rounds where a click on a country is the answer (Flags,
// Shapes) play on QuizFind; every other round on QuizGame.
export function isFindMode(id) {
  const spec = quizOf(id);
  return !!spec && spec.input === 'map' && spec.target === 'country';
}

// Selectable quiz modes, in menu order.
export const QUIZ_IDS = Object.values(MODES)
  .filter((m) => m.id !== 'classic' && m.enabled)
  .map((m) => m.id);

// Shareable landing paths (pages/<mode>.js). English root paths only for now.
export const QUIZ_PATHS = Object.fromEntries(QUIZ_IDS.map((id) => [id, `/${id}`]));

const PATH_RE = new RegExp(`^/(${QUIZ_IDS.join('|')})/?$`);
export function quizModeFromPath(pathname) {
  const m = PATH_RE.exec(pathname || '');
  return m ? m[1] : null;
}

// A mode's strings follow one convention, so a new mode only adds its text
// (public/locales/en/common.json): quiz<Id> (its name), quiz<Id>Prompt (the
// round's question), quiz<Id>Blurb (what it is, on the Quizzes page),
// quiz<Id>TabTitle and quiz<Id>DescMeta (its landing page).
// test/modesCatalog.test.js fails when an enabled mode lacks one.
export function quizKey(id, part = '') {
  return `quiz${id[0].toUpperCase()}${id.slice(1)}${part}`;
}
const QUIZ_ALL_IDS = Object.keys(MODES).filter((id) => id !== DEFAULT_MODE);
const keysFor = (part) => Object.fromEntries(QUIZ_ALL_IDS.map((id) => [id, quizKey(id, part)]));
export const MODE_LABEL_KEYS = keysFor('');
export const MODE_PROMPT_KEYS = keysFor('Prompt');
export const MODE_BLURB_KEYS = keysFor('Blurb');
// A group's heading on the Quizzes page: quizGroup<Group>.
export const groupKey = (group) => `quizGroup${group[0].toUpperCase()}${group.slice(1)}`;

// How a mode plays, from its rules (no per-mode text): rounds, then tries
// (map rounds) or choices, then the clock when it has one. Each fact is a
// locale key and its number: text(fact.key, { n: fact.n }).
export function modeFacts(id) {
  const spec = quizOf(id);
  if (!spec) return [];
  const facts = [{ key: 'quizFactRounds', n: spec.defaultRounds }];
  if (spec.input === 'choice') facts.push({ key: 'quizFactChoices', n: spec.choices });
  else if (spec.target === 'country') facts.push({ key: 'quizFactTries', n: MAX_TRIES });
  if (spec.timerRequired) facts.push({ key: 'quizFactTimer', n: spec.defaultTimePerRound });
  return facts;
}

// The word for what a mode's pool holds ("197 countries", "46 languages").
export function poolCountKey(id) {
  const pool = quizOf(id)?.pool;
  if (pool === 'countries' || pool === 'shapes') return 'quizCountryCount';
  if (pool === 'languages') return 'quizLanguageCount';
  return 'quizItemCount';
}

export function flagSrc(code, width = 160) {
  return `https://flagcdn.com/w${width}/${String(code || '').toLowerCase()}.png`;
}

// The quiz fields a singleplayer round record carries into storeGame and the
// summary: what was shown plus what the player answered. Undefined values are
// dropped so classic records never grow keys.
export function quizRoundFields(loc, { guessCountry, choice } = {}) {
  if (!loc || !isQuizMode(loc.mode)) return {};
  const out = {
    mode: loc.mode,
    country: loc.country,
    lang: loc.lang,
    text: loc.text,
    choices: loc.choices,
    spokenIn: loc.spokenIn,
    label: loc.label,
    image: loc.image,
    guessCountry,
    choice,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// Warm whatever the next round will show so it can appear with no cover:
// decode the flag / photo, or fetch the silhouettes. Text needs nothing.
export function preloadStimulus(loc) {
  if (typeof window === 'undefined' || !loc) return Promise.resolve();
  const spec = quizOf(loc.mode);
  if (!spec) return Promise.resolve();
  if (spec.stimulus === 'flag' || spec.stimulus === 'image') {
    // Flags: the round card's size and the reveal marker's size.
    const srcs = spec.stimulus === 'flag' ? [flagSrc(loc.country, 640), flagSrc(loc.country, 80)] : [loc.image?.url];
    return Promise.all(srcs.filter(Boolean).map((src) => {
      const img = new Image();
      img.src = src;
      return (img.decode ? img.decode() : Promise.resolve()).catch(() => {});
    }));
  }
  if (spec.stimulus === 'outline') {
    return import('./loadShapes.js').then((m) => m.loadShapes()).catch(() => {});
  }
  return Promise.resolve();
}
