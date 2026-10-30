// shared/modes/catalog.js and the generated data it points at. The data checks
// are what make a stale shared/modes/data/countries.js fail loudly: every
// pool code must have a polygon in modes/countries.json and a label point INSIDE
// it (seven raw centroids are not), every language must map to a pool country.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  MODES, REGIONS, DEFAULT_MODE, NO_TIMER_SECONDS,
  getMode, isQuizMode, isSelectableMode, isRegion, effectiveTimePerRound, usesPanorama,
} from '../shared/modes/catalog.js';
import { buildCountryIndex, pointInCountry, lookupCountry } from '../shared/country/findCountry.js';
import { QUIZ_COUNTRIES, QUIZ_COUNTRY_BY_CODE } from '../shared/modes/data/countries.js';
import { QUIZ_LANGUAGES } from '../shared/modes/data/languages.js';
import { poolSize } from '../shared/modes/rounds.js';
import { quizKey, modeFacts, poolCountKey, groupKey } from '../components/modes/quizClient.js';

// The globe's polygons (scripts/modes/buildGlobeCountries.mjs): what the
// player clicks and what both sides score against.
const borders = JSON.parse(fs.readFileSync(new URL('../public/modes/countries.json', import.meta.url), 'utf8'));
const index = buildCountryIndex(borders);
const borderCodes = new Set(borders.features.map((f) => f.properties?.code).filter(Boolean));

describe('catalog', () => {
  it('has a well-formed spec per mode', () => {
    for (const [id, spec] of Object.entries(MODES)) {
      expect(spec.id).toBe(id);
      expect(['pano', 'flag', 'outline', 'text', 'image']).toContain(spec.stimulus);
      expect(['map', 'choice']).toContain(spec.input);
      expect(['point', 'country', 'language']).toContain(spec.target);
      expect(spec.defaultTimePerRound).toBeGreaterThan(0);
      expect(spec.defaultRounds).toBeGreaterThan(0);
      expect(spec.maxXpPerRound).toBeGreaterThan(0);
      if (spec.input === 'choice') expect(spec.choices).toBeGreaterThan(1);
      if (spec.timerRequired) expect(spec.input).toBe('choice');
      if (spec.target === 'country') expect(spec.missMaxDist).toBeGreaterThan(0);
    }
  });

  it('resolves ids the way old payloads need', () => {
    expect(getMode(undefined)).toBe(MODES[DEFAULT_MODE]);
    expect(getMode(null)).toBe(MODES[DEFAULT_MODE]);
    expect(getMode('')).toBe(MODES[DEFAULT_MODE]);
    expect(getMode('flags')).toBe(MODES.flags);
    expect(getMode('nope')).toBeNull();
    expect(isQuizMode('classic')).toBe(false);
    expect(isQuizMode(undefined)).toBe(false);
    expect(isQuizMode('flags')).toBe(true);
    expect(isQuizMode('nope')).toBe(false);
    expect(isSelectableMode('landmarks')).toBe(false);
    expect(isSelectableMode('flags')).toBe(true);
  });

  it('knows which modes play on a panorama', () => {
    expect(usesPanorama('classic')).toBe(true);
    expect(usesPanorama(undefined)).toBe(true);
    expect(usesPanorama('not-a-mode')).toBe(true);
    expect(usesPanorama('flags')).toBe(false);
    expect(usesPanorama('languages')).toBe(false);
  });

  it('knows its regions', () => {
    expect(REGIONS[0]).toBe('all');
    expect(isRegion('Europe')).toBe(true);
    expect(isRegion('Mars')).toBe(false);
  });

  it('clamps the timer only for modes that need one', () => {
    expect(effectiveTimePerRound('languages', NO_TIMER_SECONDS)).toBe(MODES.languages.defaultTimePerRound);
    expect(effectiveTimePerRound('languages', 45)).toBe(45);
    expect(effectiveTimePerRound('flags', NO_TIMER_SECONDS)).toBe(NO_TIMER_SECONDS);
    expect(effectiveTimePerRound('classic', NO_TIMER_SECONDS)).toBe(NO_TIMER_SECONDS);
    expect(effectiveTimePerRound('nope', 30)).toBe(30);
  });
});

describe('generated country pool', () => {
  it('has a polygon and an inside label point for every entry', () => {
    for (const c of QUIZ_COUNTRIES) {
      expect(borderCodes.has(c.code), `${c.code} has no polygon`).toBe(true);
      expect(pointInCountry(index, c.lat, c.long, c.code), `${c.code} label point outside`).toBe(true);
      expect(REGIONS).toContain(c.continent);
      expect([1, 2, 3]).toContain(c.tier);
    }
  });

  it('fixes the centroids that sit outside their country', () => {
    for (const code of ['IL', 'KW', 'MC', 'SM', 'VA']) {
      const c = QUIZ_COUNTRY_BY_CODE[code];
      expect(c).toBeTruthy();
      expect(pointInCountry(index, c.lat, c.long, code)).toBe(true);
    }
  });

  it('is unique by code and has every continent represented', () => {
    expect(new Set(QUIZ_COUNTRIES.map((c) => c.code)).size).toBe(QUIZ_COUNTRIES.length);
    for (const region of REGIONS.slice(1)) {
      expect(QUIZ_COUNTRIES.some((c) => c.continent === region && c.tier <= 2), region).toBe(true);
    }
  });

  it('pointInCountry respects holes (San Marino is not Italy)', () => {
    expect(['IT', 'SM']).toContain(lookupCountry(index, 43.9356, 12.4473)); // legacy first-match, order-dependent
    expect(pointInCountry(index, 43.9356, 12.4473, 'SM')).toBe(true);
    expect(pointInCountry(index, 43.9356, 12.4473, 'IT')).toBe(false);
  });
});

describe('language pool', () => {
  it('maps every language to a pool country and valid spokenIn codes', () => {
    const ids = new Set();
    for (const l of QUIZ_LANGUAGES) {
      expect(ids.has(l.id), `duplicate ${l.id}`).toBe(false);
      ids.add(l.id);
      expect(QUIZ_COUNTRY_BY_CODE[l.country], `${l.id} country ${l.country} not in pool`).toBeTruthy();
      expect(l.spokenIn).toContain(l.country);
      for (const code of l.spokenIn) expect(borderCodes.has(code), `${l.id} spokenIn ${code}`).toBe(true);
      expect(l.text.length).toBeGreaterThan(40);
      expect([1, 2, 3]).toContain(l.tier);
    }
    expect(QUIZ_LANGUAGES.length).toBeGreaterThanOrEqual(40);
  });
});

// Adding a quiz mode is a catalog entry plus its strings and landing page;
// this is the checklist that keeps the convention from rotting.
describe("every selectable quiz mode is wired", () => {
  const en = JSON.parse(fs.readFileSync(new URL("../public/locales/en/common.json", import.meta.url), "utf8"));
  const ids = Object.values(MODES).filter((m) => m.id !== DEFAULT_MODE && m.enabled).map((m) => m.id);
  it("has its strings, landing page and a non-empty pool", () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      for (const part of ["", "Prompt", "Blurb", "TabTitle", "DescMeta"]) {
        expect(en[quizKey(id, part)], `${id}: ${quizKey(id, part)}`).toBeTruthy();
      }
      expect(fs.existsSync(new URL(`../pages/${id}.js`, import.meta.url)), `pages/${id}.js`).toBe(true);
      expect(poolSize({ mode: id }), `${id} pool`).toBeGreaterThan(0);
      for (const fact of modeFacts(id)) expect(en[fact.key], fact.key).toBeTruthy();
      expect(en[poolCountKey(id)], poolCountKey(id)).toBeTruthy();
      expect(en[groupKey(MODES[id].group || "?")], `${id}: group`).toBeTruthy();
    }
  });
});
