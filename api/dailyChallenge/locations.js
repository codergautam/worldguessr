import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import { getDailyLocations, isValidDailyDate, issueSessionToken, challengeNumberForDate } from '../../serverUtils/dailyChallenge.js';
import { randomBytes } from 'node:crypto';
import GameRound from '../../models/GameRound.js';
import { getRoundSession } from '../../serverUtils/gameRounds.js';
import { resolveGooglePano } from '../../serverUtils/googlePano.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;
  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid or out-of-range date' });
  }

  // Banned users are NOT blocked here: they can still play the daily and keep
  // their streak. submit.js shadow-writes their run (hidden from the public
  // leaderboard/stats), so there's nothing to gate on the read side.

  try {
    const locations = getDailyLocations(date);
    const sessionId = getRoundSession(req, res);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000);
    const rounds = await Promise.all(locations.map(async (location, index) => {
      const pano = await resolveGooglePano(location.lat, location.lng ?? location.long, location.panoId);
      const roundId = randomBytes(16).toString('hex');
      await GameRound.create({
        roundId,
        sessionId,
        lat: location.lat,
        lng: location.lng ?? location.long,
        panoId: pano.panoId,
        country: location.country || null,
        maxDist: 20000,
        official: true,
        dailyDate: date,
        dailyIndex: index,
        dailyMetas: location.metas || [],
        createdAt,
        expiresAt,
      });
      return { roundId, panoId: pano.panoId, heading: location.heading ?? 0 };
    }));
    const sessionToken = issueSessionToken(date);
    const challengeNumber = challengeNumberForDate(date);

    return res.status(200).json({
      date,
      challengeNumber,
      sessionToken,
      timePerRound: 60,
      totalRounds: locations.length,
      locations: rounds,
    });
  } catch (err) {
    console.error('[dailyChallenge/locations]', err);
    return res.status(503).json({ error: 'Request failed' });
  }
}

export default ratelimiter(handler, 30, 60000);
