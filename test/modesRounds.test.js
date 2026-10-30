// shared/modes/rounds.js: the shared round generator (server parties and
// browser singleplayer draw from the same function).
import { describe, it, expect } from 'vitest';
import { generateRounds, pickLanguageChoices, choicePoint, seededRng } from '../shared/modes/rounds.js';
import { QUIZ_COUNTRIES, QUIZ_COUNTRY_BY_CODE } from '../shared/modes/data/countries.js';
import { QUIZ_LANGUAGES, QUIZ_LANGUAGE_BY_ID } from '../shared/modes/data/languages.js';

const codes = (rounds) => rounds.map((r) => r.country);

describe('generateRounds', () => {
  it('is deterministic for a seed and honours count', () => {
    const a = generateRounds({ mode: 'flags', count: 10, rng: seededRng(1) });
    const b = generateRounds({ mode: 'flags', count: 10, rng: seededRng(1) });
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    for (const r of a) {
      expect(r.mode).toBe('flags');
      expect(QUIZ_COUNTRY_BY_CODE[r.country]).toBeTruthy();
      expect(r.lat).toBe(QUIZ_COUNTRY_BY_CODE[r.country].lat);
      expect(r.long).toBe(QUIZ_COUNTRY_BY_CODE[r.country].long);
    }
  });

  it('never repeats while the pool lasts, and only repeats after exhausting it', () => {
    const easyEurope = QUIZ_COUNTRIES.filter((c) => c.continent === 'Europe' && c.tier <= 2).length;
    const allEurope = QUIZ_COUNTRIES.filter((c) => c.continent === 'Europe').length;
    const distinct = generateRounds({ mode: 'flags', count: allEurope, region: 'Europe', rng: seededRng(3) });
    expect(new Set(codes(distinct)).size).toBe(allEurope);
    // The first draws come from the easy tiers before any micro-state appears.
    const firstEasy = codes(distinct).slice(0, easyEurope);
    expect(firstEasy.every((c) => QUIZ_COUNTRY_BY_CODE[c].tier <= 2)).toBe(true);
    const over = generateRounds({ mode: 'flags', count: allEurope + 5, region: 'Europe', rng: seededRng(3) });
    expect(over).toHaveLength(allEurope + 5);
  });

  it('respects the region filter', () => {
    const rounds = generateRounds({ mode: 'flags', count: 20, region: 'Africa', rng: seededRng(9) });
    expect(codes(rounds).every((c) => QUIZ_COUNTRY_BY_CODE[c].continent === 'Africa')).toBe(true);
  });

  it('skips excluded codes', () => {
    const rounds = generateRounds({ mode: 'flags', count: 30, region: 'South America', rng: seededRng(2), exclude: ['BR', 'AR'] });
    expect(codes(rounds)).not.toContain('BR');
    expect(codes(rounds)).not.toContain('AR');
  });

  it('shapes only draws countries whose silhouette is usable', () => {
    const rounds = generateRounds({ mode: 'shapes', count: 40, rng: seededRng(5) });
    expect(codes(rounds).every((c) => QUIZ_COUNTRY_BY_CODE[c].shapeOk)).toBe(true);
  });

  it('language rounds carry text, 6 unique choices including the answer, and a pool country', () => {
    const rounds = generateRounds({ mode: 'languages', count: 10, rng: seededRng(11) });
    for (const r of rounds) {
      const lang = QUIZ_LANGUAGE_BY_ID[r.lang];
      expect(lang).toBeTruthy();
      expect(r.text).toBe(lang.text);
      expect(r.choices).toHaveLength(6);
      expect(new Set(r.choices).size).toBe(6);
      expect(r.choices).toContain(r.lang);
      expect(r.country).toBe(lang.country);
      expect(QUIZ_COUNTRY_BY_CODE[r.country]).toBeTruthy();
      expect(r.spokenIn).toEqual(lang.spokenIn);
    }
    expect(new Set(rounds.map((r) => r.lang)).size).toBe(10);
  });

  it('ignores region for modes without regions', () => {
    const a = generateRounds({ mode: 'languages', count: 5, region: 'Africa', rng: seededRng(4) });
    const b = generateRounds({ mode: 'languages', count: 5, region: 'all', rng: seededRng(4) });
    expect(a).toEqual(b);
  });

  it('manifest modes need a pool and map items to rounds', () => {
    expect(() => generateRounds({ mode: 'landmarks', count: 1, rng: seededRng(1) })).toThrow(/empty pool/);
    const pool = [{ id: 'eiffel', country: 'FR', lat: 48.8584, long: 2.2945, label: 'Eiffel Tower', image: { url: 'https://x/y.jpg' } }];
    const [r] = generateRounds({ mode: 'landmarks', count: 1, pool, rng: seededRng(1) });
    expect(r).toMatchObject({ mode: 'landmarks', id: 'eiffel', country: 'FR', lat: 48.8584, long: 2.2945, label: 'Eiffel Tower' });
  });

  it('refuses classic, unknown modes and bad counts', () => {
    expect(() => generateRounds({ mode: 'classic', count: 5 })).toThrow(/not a quiz mode/);
    expect(() => generateRounds({ mode: 'nope', count: 5 })).toThrow(/not a quiz mode/);
    expect(() => generateRounds({ mode: 'flags', count: 0 })).toThrow(/bad count/);
  });
});

describe('pickLanguageChoices', () => {
  it('prefers the same script for distractors', () => {
    let sameScript = 0, total = 0;
    for (let seed = 0; seed < 50; seed++) {
      const choices = pickLanguageChoices('ru', 6, seededRng(seed));
      expect(choices).toHaveLength(6);
      expect(new Set(choices).size).toBe(6);
      expect(choices).toContain('ru');
      for (const id of choices) {
        if (id === 'ru') continue;
        total++;
        if (QUIZ_LANGUAGE_BY_ID[id].script === 'Cyrl') sameScript++;
      }
    }
    // Four other Cyrillic languages exist; they should dominate the picks.
    expect(sameScript / total).toBeGreaterThan(0.5);
  });

  it('works for every language in the pool', () => {
    for (const l of QUIZ_LANGUAGES) {
      const choices = pickLanguageChoices(l.id, 6, seededRng(1));
      expect(choices).toContain(l.id);
      expect(new Set(choices).size).toBe(6);
    }
  });
});

describe('choicePoint', () => {
  it('returns the label point of the chosen language country, null otherwise', () => {
    expect(choicePoint('languages', 'fr')).toEqual({ lat: QUIZ_COUNTRY_BY_CODE.FR.lat, long: QUIZ_COUNTRY_BY_CODE.FR.long });
    expect(choicePoint('languages', 'zz')).toBeNull();
    expect(choicePoint('flags', 'fr')).toBeNull();
  });
});
