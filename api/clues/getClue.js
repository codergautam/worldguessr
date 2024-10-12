import Clue from '@/models/Clue';
import User from '@/models/User';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { lat, lng } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Missing lat or lng query parameters' });
      }

      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: 'Invalid lat or lng values' });
      }

      // Fetch clues from the database
      const clues = await Clue.find({ lat: latitude, lng: longitude });

      if(!clues) {
        return res.status(200).json({ error: 'notfound' });
      }

      // Fetch user data and map to the clue results
      let cluesWithUsernames = await Promise.all(clues.map(async (clue) => {
        const user = await User.findById(clue.created_by);
        return {
          id: clue._id,
          cluetext: clue.clue,
          // rating is a decimal128, convert to number
          rating: clue.rating ? parseFloat(clue.rating.toString()) : 0,
          ratingcount: clue.ratingCnt,
          created_by_name: user ? user.username : 'Unknown',
          created_at: new Date() - clue.created_at.getTime(), // Convert to relative time in milliseconds
        };
      }));

      // sort by highest rating
      cluesWithUsernames.sort((a, b) => b.rating - a.rating);

      res.status(200).json(cluesWithUsernames);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error fetching clues' });
    }
  } else {
    // Handle any non-GET requests
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default handler;
