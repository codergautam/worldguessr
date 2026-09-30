import ratelimit from '../../../components/utils/ratelimitMiddleware.js';
import GameRound from '../../../models/GameRound.js';
import { getRoundSession } from '../../../serverUtils/gameRounds.js';
import lookup from 'coordinate_to_country';
import continentMapping from '../../../public/continentMapping.json' with { type: 'json' };

const EARTH_RADIUS_KM = 6371;

function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Request failed' });
  const { lat, lng } = req.body || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Request failed' });
  }

  try {
    const sessionId = getRoundSession(req, res);
    const now = new Date();
    const filter = { roundId: req.params.roundId, sessionId, status: 'open', expiresAt: { $gt: now } };
    const round = await GameRound.findOne(filter).lean();
    if (!round) return res.status(404).json({ error: 'Request failed' });

    const distance = distanceKm(round.lat, round.lng, lat, lng);
    let score;
    if (round.countryGuesser) {
      const guessedCountry = lookup(lat, lng, true)?.[0] || null;
      const expected = round.countryGuessrSubMode === 'continent'
        ? continentMapping[round.country]
        : round.country;
      const guessed = round.countryGuessrSubMode === 'continent'
        ? continentMapping[guessedCountry]
        : guessedCountry;
      score = guessed && expected && guessed === expected ? 1000 : 0;
    } else {
      let points = 5000 * Math.exp(-10 * (distance / round.maxDist));
      if (round.hintUsed) points /= 2;
      if (points > 4997 || distance < 0.03) points = 5000;
      score = Math.round(points);
    }
    const durationMs = Math.max(0, now.getTime() - round.createdAt.getTime());
    const closed = await GameRound.findOneAndUpdate(
      filter,
      { $set: {
        status: 'closed', guessedAt: now, guessLat: lat, guessLng: lng,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        durationMs, distanceKm: distance, score,
      } },
      { new: true }
    ).lean();
    if (!closed) return res.status(404).json({ error: 'Request failed' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      distanceKm: distance,
      score,
      actual: { lat: round.lat, lng: round.lng },
      ...(round.country ? { actualCountry: round.country } : {}),
      ...(round.dailyMetas ? { metas: round.dailyMetas } : {}),
    });
  } catch (error) {
    console.error('[rounds] guess failed:', error?.message || error);
    return res.status(400).json({ error: 'Request failed' });
  }
}

export default ratelimit(handler, 30, 60000);
