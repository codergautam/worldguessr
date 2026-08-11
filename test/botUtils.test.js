// Placement bot guess engine (ws/botUtils.js).
//
// The scripted 5-round arc rests on two pure pieces of math — the calcPoints
// inversion and the great-circle destination — plus the placementGuess damage
// window built on them. These tests pin the window's load-bearing guarantees:
//
//   1. Rounds 1-4 the bot scores STRICTLY below the human (the human never
//      takes damage), and per-round damage respects the 1000-point cap unless
//      the guess was the accepted terrible-throw fallback (score ~0, which
//      only ever kills the bot EARLIER — never the human).
//   2. Every guess the bot ever returns is on land (coordinate_to_country).
//   3. Round 5 (and nothing-to-shadow rounds) are a genuine throw.
//
// Games are plain-object stand-ins (the matchmakingV2.test.js pattern) — no
// real Game/Player instances needed; placementGuess only reads data fields.
import { describe, it, expect } from 'vitest';
import lookup from 'coordinate_to_country';
import calcPoints, { findDistance } from '../components/calcPoints.js';
import {
  invertCalcPointsDistance,
  greatCircleDestination,
  terribleLandGuess,
  placementGuess,
} from '../ws/botUtils.js';

const MAX_DIST = 20000;
const scoreAt = (loc, pt) =>
  calcPoints({ lat: loc.lat, lon: loc.long, guessLat: pt[0], guessLon: pt[1], usedHint: false, maxDist: MAX_DIST });

// A guess engineered to score ~target at `loc` — how the tests fabricate the
// human side of a round.
const guessScoring = (loc, target, bearing = 10) =>
  greatCircleDestination(loc.lat, loc.long, bearing, invertCalcPointsDistance(target, MAX_DIST));

const PARIS = { lat: 48.8566, long: 2.3522 };

const gameWith = ({ loc = PARIS, humanGuess = null, round = 2, rounds = 5 } = {}) => {
  const locations = Array(rounds).fill(null);
  locations[round - 1] = loc;
  return {
    curRound: round,
    rounds,
    maxDist: MAX_DIST,
    locations,
    pIds: { p1: 'human', p2: 'bot' },
    players: { human: { guess: humanGuess }, bot: {} },
  };
};

describe('invertCalcPointsDistance', () => {
  it('is the inverse of calcPoints pre-clamp: a point at that distance scores ~target', () => {
    for (const target of [4500, 3000, 1500, 500]) {
      const dist = invertCalcPointsDistance(target, MAX_DIST);
      const pt = greatCircleDestination(PARIS.lat, PARIS.long, 137, dist);
      expect(findDistance(PARIS.lat, PARIS.long, pt[0], pt[1])).toBeCloseTo(dist, 0);
      expect(Math.abs(scoreAt(PARIS, pt) - target)).toBeLessThanOrEqual(10);
    }
  });

  it('is monotonically decreasing in score', () => {
    expect(invertCalcPointsDistance(4000)).toBeLessThan(invertCalcPointsDistance(1000));
  });

  it('stays finite on garbage instead of blowing up the guess path', () => {
    for (const junk of [0, -50, 999999, NaN, undefined]) {
      expect(Number.isFinite(invertCalcPointsDistance(junk))).toBe(true);
    }
  });
});

describe('greatCircleDestination', () => {
  it('round-trips through findDistance across bearings and latitudes', () => {
    for (const [lat, lon] of [[48.85, 2.35], [-33.87, 151.2], [64.1, -21.9]]) {
      for (const bearing of [0, 90, 210, 333]) {
        const [dlat, dlon] = greatCircleDestination(lat, lon, bearing, 3000);
        expect(findDistance(lat, lon, dlat, dlon)).toBeCloseTo(3000, -1);
      }
    }
  });

  it('normalizes longitude across the antimeridian into [-180, 180]', () => {
    const [, lon] = greatCircleDestination(0, 179, 90, 5000);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
  });
});

describe('placementGuess — rounds 1-4 shadow the human', () => {
  it('bot scores STRICTLY below the human at every real skill level', () => {
    // Floor at 1200: below that the design ACCEPTS the terrible-throw fallback
    // occasionally landing nearer than a bad human guess (tiny human damage,
    // documented trade-off) — asserting strict-below there would over-promise.
    for (const target of [4800, 3000, 1200]) {
      for (let round = 1; round <= 4; round++) {
        const humanGuess = guessScoring(PARIS, target);
        const game = gameWith({ humanGuess, round });
        const humanScore = scoreAt(PARIS, humanGuess);
        const pt = placementGuess(game);
        expect(scoreAt(PARIS, pt)).toBeLessThan(humanScore);
      }
    }
  });

  it('a barely-scoring human still gets a land guess back, never a crash', () => {
    const humanGuess = guessScoring(PARIS, 400);
    const pt = placementGuess(gameWith({ humanGuess, round: 2 }));
    expect(Number.isFinite(pt[0])).toBe(true);
    expect(lookup(pt[0], pt[1], true).length).toBeGreaterThan(0);
  });

  it('per-round damage respects the 1000 cap, except the accepted throw fallback', () => {
    const humanGuess = guessScoring(PARIS, 3500);
    const humanScore = scoreAt(PARIS, humanGuess);
    // A windowed accept at this human score sits within ~1400km of the true
    // location by construction (score >= humanScore-1000 bounds the distance);
    // the tier-3 throw is farthest-of-K land — continents away. Distance is
    // therefore the deterministic discriminator between "windowed guess that
    // must respect the cap" and "accepted throw that over-damages the BOT
    // only (an early KO, never the human)".
    for (let i = 0; i < 200; i++) {
      const pt = placementGuess(gameWith({ humanGuess, round: 2 }));
      const botScore = scoreAt(PARIS, pt);
      const isThrow = findDistance(PARIS.lat, PARIS.long, pt[0], pt[1]) > 3000;
      if (!isThrow) expect(humanScore - botScore).toBeLessThanOrEqual(1000);
      expect(botScore).toBeLessThan(humanScore);
    }
  });

  it('every guess is on land', () => {
    for (const target of [4800, 2000, 600]) {
      const humanGuess = guessScoring(PARIS, target);
      for (let i = 0; i < 25; i++) {
        const pt = placementGuess(gameWith({ humanGuess, round: 3 }));
        expect(lookup(pt[0], pt[1], true).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('placementGuess — the throw rounds', () => {
  it('round 5 is a genuine land throw: near-zero score', () => {
    // Best of 3: farthest-of-K sampling has a small tail where every draw
    // lands on the near side of the planet — one retry kills the flake
    // without weakening what is being claimed (the throw path is a throw).
    const humanGuess = guessScoring(PARIS, 4000);
    let best = Infinity;
    for (let i = 0; i < 3 && best > 100; i++) {
      const pt = placementGuess(gameWith({ humanGuess, round: 5 }));
      expect(lookup(pt[0], pt[1], true).length).toBeGreaterThan(0);
      best = Math.min(best, scoreAt(PARIS, pt));
    }
    expect(best).toBeLessThanOrEqual(100);
  });

  it('nothing to shadow (no human guess) still returns finite land coords', () => {
    const pt = placementGuess(gameWith({ humanGuess: null, round: 2 }));
    expect(Number.isFinite(pt[0])).toBe(true);
    expect(Number.isFinite(pt[1])).toBe(true);
    expect(lookup(pt[0], pt[1], true).length).toBeGreaterThan(0);
  });

  it('missing round location degrades to a land guess rather than blocking the round', () => {
    const game = gameWith({ humanGuess: null, round: 2 });
    game.locations[1] = null;
    const pt = placementGuess(game);
    expect(lookup(pt[0], pt[1], true).length).toBeGreaterThan(0);
  });
});

describe('terribleLandGuess', () => {
  it('lands far away, on land', () => {
    const pt = terribleLandGuess(PARIS);
    expect(lookup(pt[0], pt[1], true).length).toBeGreaterThan(0);
    expect(findDistance(PARIS.lat, PARIS.long, pt[0], pt[1])).toBeGreaterThan(3000);
  });
});
