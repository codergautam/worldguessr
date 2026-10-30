// shared/modes/score.js: the one scorer for quiz modes.
//
// pointsForDistance is a copy of components/calcPoints.js (shared/ cannot
// import components/), so the first block pins the two together over seeded
// pairs. The rest covers the three target kinds and the guards that stop a
// malformed guess from scoring 5000 the way raw calcPoints does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import calcPoints from '../components/calcPoints.js';
import { buildCountryIndex } from '../shared/country/findCountry.js';
import {
  haversineKm,
  pointsForDistance,
  choicePoints,
  scoreGuess,
  scoreGuessDetailed,
  MAX_TRIES,
  TRY_POINTS,
} from '../shared/modes/score.js';
import { seededRng } from '../shared/modes/rounds.js';

const borders = JSON.parse(fs.readFileSync(new URL('../public/modes/countries.json', import.meta.url), 'utf8'));
const index = buildCountryIndex(borders);

// Inside San Marino (a hole in Italy) and inside Italy proper.
const SAN_MARINO_CITY = { lat: 43.9356, lng: 12.4473 };
const ROME = { lat: 41.9028, lng: 12.4964 };
const SM = { lat: 43.9424, long: 12.4578, country: 'SM' };
const IT = { lat: 42.8333, long: 12.8333, country: 'IT' };

describe('pointsForDistance parity with calcPoints', () => {
  it('matches calcPoints for 2000 seeded pairs at several maxDist values', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 2000; i++) {
      const lat = rng() * 170 - 85, lon = rng() * 360 - 180;
      const gLat = rng() * 170 - 85, gLon = rng() * 360 - 180;
      const hint = rng() < 0.2;
      for (const maxDist of [20000, 5000, 1200, 300]) {
        const expected = calcPoints({ lat, lon, guessLat: gLat, guessLon: gLon, usedHint: hint, maxDist });
        const got = pointsForDistance(haversineKm(lat, lon, gLat, gLon), maxDist, hint);
        expect(got).toBe(expected);
      }
    }
  });

  it('snaps to 5000 under 30 m and above the 4997 threshold', () => {
    expect(pointsForDistance(0.02, 20000)).toBe(5000);
    expect(pointsForDistance(1, 20000)).toBe(5000);
    expect(pointsForDistance(0.02, 20000, true)).toBe(5000);
  });
});

describe('country targets', () => {
  it('scores 5000 inside the answer and halves on a hint', () => {
    expect(scoreGuess({ mode: 'flags', location: IT, guess: ROME, countryIndex: index })).toBe(5000);
    expect(scoreGuess({ mode: 'flags', location: IT, guess: ROME, usedHint: true, countryIndex: index })).toBe(2500);
  });

  it('does not count San Marino as Italy (hole) and does count SM for SM', () => {
    const inIt = scoreGuessDetailed({ mode: 'flags', location: IT, guess: SAN_MARINO_CITY, countryIndex: index });
    expect(inIt.correct).toBe(false);
    expect(inIt.points).toBeLessThan(5000);
    const inSm = scoreGuessDetailed({ mode: 'flags', location: SM, guess: SAN_MARINO_CITY, countryIndex: index });
    expect(inSm.correct).toBe(true);
    expect(inSm.points).toBe(5000);
  });

  it('scores a miss by distance to the label point at missMaxDist', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const dist = haversineKm(IT.lat, IT.long, paris.lat, paris.lng);
    expect(scoreGuess({ mode: 'flags', location: IT, guess: paris, countryIndex: index }))
      .toBe(pointsForDistance(dist, 5000));
    // The whole point of missMaxDist: the same miss is worth far less than at 20000.
    expect(pointsForDistance(dist, 5000)).toBeLessThan(pointsForDistance(dist, 20000) - 500);
  });

  it('accepts a precomputed guess.country when no index is given', () => {
    expect(scoreGuess({ mode: 'flags', location: IT, guess: { ...ROME, country: 'IT' } })).toBe(5000);
    expect(scoreGuess({ mode: 'flags', location: IT, guess: { ...SAN_MARINO_CITY, country: 'SM' } })).toBeLessThan(5000);
  });

  it('throws when it has neither an index nor a resolved country', () => {
    expect(() => scoreGuess({ mode: 'flags', location: IT, guess: ROME })).toThrow(TypeError);
  });

  it('pays by the try the answer was found on, and 0 for a wrong country', () => {
    expect(TRY_POINTS).toEqual([5000, 3000, 1000]);
    expect(MAX_TRIES).toBe(TRY_POINTS.length);
    TRY_POINTS.forEach((pts, i) => {
      const r = scoreGuessDetailed({ mode: 'shapes', location: IT, guess: ROME, countryIndex: index, attempt: i + 1 });
      expect(r).toMatchObject({ correct: true, points: pts });
    });
    const paris = { lat: 48.8566, lng: 2.3522 };
    for (const attempt of [1, 2, 3]) {
      expect(scoreGuessDetailed({ mode: 'flags', location: IT, guess: paris, countryIndex: index, attempt }))
        .toMatchObject({ correct: false, points: 0 });
    }
    // A try past the last one is never worth anything.
    expect(scoreGuess({ mode: 'flags', location: IT, guess: ROME, countryIndex: index, attempt: 4 })).toBe(0);
  });
});

describe('choice targets', () => {
  const loc = { lat: 46, long: 2, country: 'FR', lang: 'fr' };
  const T = 20000;
  it('pays 5000 instantly, 3750 at half time, 2500 at or after the limit', () => {
    expect(scoreGuess({ mode: 'languages', location: loc, choice: 'fr', timeTakenMs: 0, timePerRoundMs: T })).toBe(5000);
    expect(scoreGuess({ mode: 'languages', location: loc, choice: 'fr', timeTakenMs: T / 2, timePerRoundMs: T })).toBe(3750);
    expect(scoreGuess({ mode: 'languages', location: loc, choice: 'fr', timeTakenMs: T, timePerRoundMs: T })).toBe(2500);
    expect(scoreGuess({ mode: 'languages', location: loc, choice: 'fr', timeTakenMs: T * 3, timePerRoundMs: T })).toBe(2500);
  });
  it('treats a missing clock as full time, and a wrong pick as 0', () => {
    expect(scoreGuess({ mode: 'languages', location: loc, choice: 'fr' })).toBe(2500);
    expect(scoreGuess({ mode: 'languages', location: loc, choice: 'it', timeTakenMs: 0, timePerRoundMs: T })).toBe(0);
    expect(scoreGuess({ mode: 'languages', location: loc, choice: null })).toBe(0);
    expect(choicePoints(true, NaN, T)).toBe(2500);
  });
});

describe('guards', () => {
  it('scores 0 for anything that is not a {lat, lng} guess', () => {
    const loc = { lat: 46, long: 2, country: 'FR' };
    expect(scoreGuess({ mode: 'flags', location: loc, guess: null, countryIndex: index })).toBe(0);
    expect(scoreGuess({ mode: 'flags', location: loc, guess: [46, 2], countryIndex: index })).toBe(0);
    expect(scoreGuess({ mode: 'flags', location: loc, guess: { lat: NaN, lng: 2 }, countryIndex: index })).toBe(0);
    expect(scoreGuess({ mode: 'flags', location: loc, guess: { choice: 'fr' }, countryIndex: index })).toBe(0);
  });
  it('scores 0 for an unknown mode or a missing location', () => {
    expect(scoreGuess({ mode: 'nope', location: IT, guess: ROME, countryIndex: index })).toBe(0);
    expect(scoreGuess({ mode: 'flags', location: null, guess: ROME, countryIndex: index })).toBe(0);
  });
  it('point targets use plain distance scoring', () => {
    const loc = { lat: 48.8584, long: 2.2945 };
    const near = { lat: 48.86, lng: 2.3 };
    expect(scoreGuess({ mode: 'landmarks', location: loc, guess: near, maxDist: 20000 }))
      .toBe(pointsForDistance(haversineKm(loc.lat, loc.long, near.lat, near.lng), 20000));
  });
});
