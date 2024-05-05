import calcPoints from '@/components/calcPoints';
import { createUUID } from '@/components/createUUID';
import client from '@/components/multiplayerServer/redisClient';
import storeGame from '@/components/storeGame';
import moment from 'moment';
const matchesBuffer = 5000;
// multiplayer after guess
export default async function guess(req, res) {
  const { lat, long, actualLat, actualLong, usedHint, secret, roundTime } = req.body;

  if(secret) {
    try {
      await storeGame(secret, Math.round(calcPoints({ guessLat: lat, guessLon: long, lat: actualLat, lon: actualLong, usedHint }) / 100), roundTime, [lat, long]);
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', message: error.message });
    }
  }
  res.status(200).json({ success: true });
}
