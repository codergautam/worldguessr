import Clue from '@/models/Clue';

let clueCountCache = {
  count: 0,
  timestamp: 0
};

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const currentTime = Date.now();

      // Check if the cached value is valid (1 hour = 3600000 milliseconds)
      if (currentTime - clueCountCache.timestamp < 3600000) {
        return res.status(200).json({ count: clueCountCache.count });
      }

      // Fetch clue count from the database
      const count = await Clue.countDocuments();

      // Update the cache
      clueCountCache = {
        count,
        timestamp: currentTime
      };

      res.status(200).json({ count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error fetching clue count' });
    }
  } else {
    // Handle any non-GET requests
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default handler;
