import { randomBytes } from 'node:crypto';
import ControlledRound from '../models/ControlledRound.js';

function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function distanceKm(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, x)));
}

// This foundation has no HTTP routes or client integration. Callers must
// derive owner/game/mode from authenticated server state, never request flags.
export async function createControlledRound({ ownerId, gameId, mode, answer, maxDist, expiresAt }) {
  const now = new Date();
  if (![ownerId, gameId, mode].every((v) => typeof v === 'string' && v.length > 0)
    || !answer || !validCoordinates(answer.lat, answer.lng)
    || !Number.isFinite(maxDist) || maxDist <= 0
    || !(expiresAt instanceof Date) || !(expiresAt > now)) throw new Error('Invalid round');
  const roundId = randomBytes(32).toString('hex');
  await ControlledRound.create({ roundId, ownerId, gameId, mode, answer, maxDist, createdAt: now, expiresAt });
  return { roundId };
}

function openFilter({ roundId, ownerId, gameId, mode }, now) {
  if (![roundId, ownerId, gameId, mode].every((v) => typeof v === 'string' && v.length > 0)) {
    throw new Error('Invalid round');
  }
  return { roundId, ownerId, gameId, mode, status: 'open', expiresAt: { $gt: now } };
}

export async function guessControlledRound(context, guess) {
  if (!guess || !validCoordinates(guess.lat, guess.lng)) throw new Error('Invalid guess');
  const filter = openFilter(context, new Date());
  const round = await ControlledRound.findOne(filter).lean();
  if (!round) return false;
  const distance = distanceKm(round.answer, guess);
  let points = 5000 * Math.exp(-10 * distance / round.maxDist);
  if (round.hintUsed) points /= 2;
  if (points > 4997 || distance < 0.03) points = 5000;
  const now = new Date();
  const result = { guessLat: guess.lat, guessLng: guess.lng, distanceKm: distance,
    score: Math.round(points), durationMs: Math.max(0, now - round.createdAt) };
  const updated = await ControlledRound.findOneAndUpdate(
    { ...filter, expiresAt: { $gt: now }, revision: round.revision },
    { $set: { status: 'guessed', result }, $inc: { revision: 1 } },
    { new: true }
  ).lean();
  // Never reveal the answer here: a future game-level reveal must authorize it.
  return Boolean(updated);
}

export async function replaceControlledRound(context) {
  const updated = await ControlledRound.findOneAndUpdate(
    openFilter(context, new Date()),
    { $set: { status: 'replaced' }, $inc: { revision: 1 } },
    { new: true }
  ).lean();
  return Boolean(updated);
}
