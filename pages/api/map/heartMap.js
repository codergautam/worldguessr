import Map from '@/models/Map';
import User from '@/models/User';

async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { mapId, state, secret } = req.body;

      if (!mapId || !secret) {
        return res.status(400).json({ message: 'Missing values' });
      }

      if (state !== true || state !== false) {
        return res.status(400).json({message: "State must be a boolean"})
      }

      // Find the user by secret
      const user = await User.findOne({ secret });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if(!user.hearted_maps) {
        user.hearted_maps = new Map();
      }

      // Find the map by id
      const map = await Map.findById(mapId);
      if (!map) {
        return res.status(404).json({ message: 'Map not found' });
      }

      if(user.hearted_maps.has(mapId)) {
        // this means the user has the map hearted right now
        if(state === true) {
          // no action needed
        } else if(state === false) {
          // remove the heart
          user.hearted_maps.delete(mapId)
          map.hearts--;
        }
      } else {
        if(state === true) {
          // add heart
          user.hearted_maps.set(mapId, true)
          map.hearts++;
        }
      }

      await map.save();
      await user.save();

      res.status(200).json({ success: true, hearted: user.hearted_maps.has(mapId), hearts: map.hearts });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error hearting map' });
    }
  } else {
    // Handle any non-POST requests
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default handler;
