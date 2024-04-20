import createUUID from '@/components/createUUID';
import { createClient } from 'redis';

function validatePoints(points) {
  if(!Array.isArray(points)) {
    return false;
  }

  if(points.length > 100) {
    return false;
  }

  if(points.length < 2) {
    return false;
  }

  for(const point of points) {
    // should be [lat, lng]
    if(!Array.isArray(point) || point.length !== 2) {
      return false;
    }

    // lat should be between -90 and 90
    if(point[0] < -90 || point[0] > 90) {
      return false;
    }

    // lng should be between -180 and 180
    if(point[1] < -180 || point[1] > 180) {
      return false;
    }
  }

  return true;
}

const client = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
      host: process.env.REDIS_HOST,
      port: 14367
  }
});
await client.connect();
export default async function handler(req, res) {
  const { points } = req.body;

  if(!points || !validatePoints(points)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // create a new game
  const uuid = createUUID();
  client.set(uuid, JSON.stringify({id: uuid, state: "1", c: Date.now(), po: points, p: []}));
  res.status(200).json({ uuid });
}
