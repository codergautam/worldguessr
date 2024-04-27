import { createCode, createUUID } from '@/components/createUUID';
import client from '@/components/multiplayerServer/redisClient';

import moment from 'moment';
function validatePoints(points) {
  if(!Array.isArray(points)) {
    return false;
  }

  if(points.length > 20) {
    return false;
  }

  if(!points.length) {
    return false;
  }

  for(const point of points) {
    // should be {lat, long, country}
    if(typeof point !== 'object') {
      return false;
    }
    // should have lat and long
    if(!point.lat || !point.long) {
      return false;
    }
    // should be numbers and within range [-90, 90] and [-180, 180]
    if(typeof point.lat !== 'number' || typeof point.long !== 'number'  || point.lat < -90 || point.lat > 90 || point.long < -180 || point.long > 180) {
      return false;
    }
    // should have country
    if(!point.country) {
      return false;
    }
    // should be string
    if(typeof point.country !== 'string') {
      return false;
    }
  }

  return true;
}


export default async function handler(req, res) {
  let { points, timePerRound } = req.body;

  if(!points || !validatePoints(points) || !timePerRound) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  timePerRound = parseInt(timePerRound);
  if(isNaN(timePerRound)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (timePerRound < 10) {
    return res.status(400).json({ error: 'Time per round should be at least 10 seconds' });
  }
  if(timePerRound > 300) {
    return res.status(400).json({ error: 'Time per round should be at most 300 seconds' });
  }

  // create a new game
  const uuid = createCode();
  const modifySecret = createUUID();
  console.log('Creating game with id:', uuid);
  client.set(uuid.toString(), JSON.stringify({id: uuid, s: 1, c: moment().utc().valueOf(), po: points, p: [], ms: modifySecret, rt: timePerRound}));
  res.status(200).json({ uuid, modifySecret });
}
