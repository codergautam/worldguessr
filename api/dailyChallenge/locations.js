import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import { getDailyLocations, isValidDailyDate, issueSessionToken, challengeNumberForDate } from '../../serverUtils/dailyChallenge.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;
  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid or out-of-range date' });
  }

  try {
    const locations = getDailyLocations(date);
    const sessionToken = issueSessionToken(date);
    const challengeNumber = challengeNumberForDate(date);

    return res.status(200).json({
      date,
      challengeNumber,
      sessionToken,
      timePerRound: 30,
      totalRounds: locations.length,
      locations: locations.map(l => ({
        lat: l.lat,
        long: l.long,
        heading: l.heading,
        country: l.country,
      })),
    });
  } catch (err) {
    console.error('[dailyChallenge/locations]', err);
    return res.status(500).json({ error: 'Failed to generate daily locations' });
  }
}

export default ratelimiter(handler, 30, 60000);
