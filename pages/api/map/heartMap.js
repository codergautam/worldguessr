import Map from '@/models/Map';
import User from '@/models/User';

const HEART_COOLDOWN = 500;
let recentHearts = {}

async function handler(req, res) {
  if(!recentHearts) {
    recentHearts = {};
  }
  if (req.method === 'POST') {
    try {
      const { mapId, secret } = req.body;

      if (!mapId || !secret) {
        return res.status(400).json({ message: 'Missing values' });
      }

      // Find the user by secret
      const user = await User.findOne({ secret });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if(recentHearts[user._id] && Date.now() - recentHearts[user._id] < HEART_COOLDOWN) {
        return res.status(429).json({ message: 'yourTooFastForUs' });
      }

      if (!user.hearted_maps) {
        user.hearted_maps = new Map();
      }

      // Find the map by id
      const map = await Map.findById(mapId);
      if (!map) {
        return res.status(404).json({ message: 'Map not found' });
      }

      if (user.hearted_maps.has(mapId)) {
        // If the user has already hearted the map, remove the heart
        user.hearted_maps.delete(mapId);
        map.hearts--;
        if(map.hearts < 0) {
          map.hearts = 0;
        }
      } else {
        // If the user has not hearted the map, add the heart
        user.hearted_maps.set(mapId, true);
        map.hearts++;
      }

      //save in recentHearts
      recentHearts[user._id] = Date.now();

      await map.save();
      await user.save();

      res.status(200).json({ success: true, hearted: user.hearted_maps.has(mapId), hearts: map.hearts });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error toggling map heart' });
    }
  } else {
    // Handle any non-POST requests
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default handler;
