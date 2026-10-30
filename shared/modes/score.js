// One scorer for every quiz mode. The ws server is authoritative and calls this
// from Game.scoreFor(); the web client calls the same function for the live
// reveal numbers so the two can never disagree. Classic rounds keep using
// components/calcPoints.js directly; this file only owns the quiz modes.
//
// pointsForDistance is a verbatim copy of calcPoints (components/calcPoints.js)
// because shared/ cannot import from components/ (Metro only watches /shared
// and /public/locales). test/modesScore.test.js pins the two to each other.
//
// Guesses are { lat, lng } objects, never [lat, lng] arrays and never a bare
// choice: calcPoints on a non-array silently scores 5000 (findDistance swallows
// the TypeError and returns 0 km), so this file refuses anything it does not
// recognise and scores it 0.

import { pointInCountry } from '../country/findCountry.js';
import { getMode } from './catalog.js';

const toRad = (deg) => deg * Math.PI / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Same curve, same caps as calcPoints: 5000 * e^(-10 * dist / maxDist), halved
// on a hint, snapped to 5000 above 4997 or under 30 m.
export function pointsForDistance(distKm, maxDist, usedHint = false) {
  let pts = 5000 * Math.E ** (-10 * (distKm / maxDist));
  if (usedHint) pts = pts / 2;
  if (pts > 4997) pts = 5000;
  if (distKm < 0.03) pts = 5000;
  return Math.round(pts);
}

const CHOICE_BASE = 2500;
const CHOICE_SPEED_BONUS = 2500;

// Correct choice: 2500 for a last-second answer, up to 5000 for an instant one.
// No usable clock counts as full time, never as instant.
export function choicePoints(correct, timeTakenMs, timePerRoundMs) {
  if (!correct) return 0;
  if (!Number.isFinite(timeTakenMs) || !Number.isFinite(timePerRoundMs) || timePerRoundMs <= 0) {
    return CHOICE_BASE;
  }
  const frac = Math.min(1, Math.max(0, timeTakenMs / timePerRoundMs));
  return Math.max(CHOICE_BASE, Math.floor(CHOICE_BASE + CHOICE_SPEED_BONUS * (1 - frac)));
}

// Country rounds played with tries (singleplayer flags / shapes): a wrong
// country costs a try, the answer pays by the try it was found on, and three
// wrong countries pay nothing.
export const MAX_TRIES = 3;
export const TRY_POINTS = Object.freeze([5000, 3000, 1000]);

const isPoint = (g) => !!g && Number.isFinite(g.lat) && Number.isFinite(g.lng);

/**
 * @param {number} [args.attempt] country targets only: which try this click
 *   is (1-based). Given, a hit pays TRY_POINTS[attempt - 1] and a miss pays 0
 *   (the caller decides whether a try is left). Omitted, a miss is scored by
 *   distance (parties, until they get tries too).
 * @returns {{ points: number, correct: boolean, distKm: number|null }}
 *   correct: country target -> click inside the answer; choice -> right id;
 *            point target -> full marks.
 */
export function scoreGuessDetailed({
  mode,
  location,
  guess = null,
  choice = null,
  maxDist = 20000,
  timeTakenMs,
  timePerRoundMs,
  usedHint = false,
  countryIndex = null,
  attempt = null,
}) {
  const spec = getMode(mode);
  if (!spec || !location) return { points: 0, correct: false, distKm: null };

  if (spec.input === 'choice') {
    const correct = choice != null && choice === location.lang;
    return { points: choicePoints(correct, timeTakenMs, timePerRoundMs), correct, distKm: null };
  }

  if (!isPoint(guess)) return { points: 0, correct: false, distKm: null };
  const distKm = haversineKm(location.lat, location.long, guess.lat, guess.lng);

  if (spec.target === 'country') {
    let inside;
    if (countryIndex) {
      inside = pointInCountry(countryIndex, guess.lat, guess.lng, location.country);
    } else if (typeof guess.country === 'string') {
      inside = guess.country === location.country;
    } else {
      throw new TypeError('scoreGuess: country target needs countryIndex or guess.country');
    }
    if (attempt != null) {
      const points = inside ? (TRY_POINTS[attempt - 1] ?? 0) : 0;
      return { points, correct: inside, distKm };
    }
    if (inside) return { points: usedHint ? 2500 : 5000, correct: true, distKm };
    return {
      points: pointsForDistance(distKm, spec.missMaxDist ?? maxDist, usedHint),
      correct: false,
      distKm,
    };
  }

  // point target
  const points = pointsForDistance(distKm, maxDist, usedHint);
  return { points, correct: points === 5000, distKm };
}

export function scoreGuess(args) {
  return scoreGuessDetailed(args).points;
}
