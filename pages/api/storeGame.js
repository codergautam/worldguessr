import calcPoints from '@/components/calcPoints';
import storeGame from '@/components/storeGame';
import ratelimiter from '@/components/utils/ratelimitMiddleware'

// multiplayer after guess
async function guess(req, res) {
  const { lat, long, actualLat, actualLong, usedHint, secret, roundTime, maxDist } = req.body;

  // secret must be string
  if(typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  // handle impossible cases
  if(lat === actualLat || long === actualLong || roundTime < 0 || maxDist < 10) {
    return res.status(400).json({ message: 'Invalid input' });
  }
  
  if(secret) {
    try {
      const calcXp = Math.round(calcPoints({ guessLat: lat, guessLon: long, lat: actualLat, lon: actualLong, usedHint, maxDist }) / 50);
      await storeGame(secret, calcXp, roundTime, [lat, long]);
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', message: error.message });
    }
  }
  res.status(200).json({ success: true });
}

// Limit to 1 request per 5 seconds over a minute, generous limit but better than nothing
export default ratelimiter(guess, 12, 60000)