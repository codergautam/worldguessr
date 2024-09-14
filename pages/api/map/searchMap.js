import mapConst from "@/components/maps/mapConst";
import parseMapData from "@/components/utils/parseMapData";
import sendableMap from "@/components/utils/sendableMap";
import generateSlug from "@/components/utils/slugGenerator";
import Map from "@/models/Map";
import User from "@/models/User";
import officialCountryMaps from '@/public/officialCountryMaps.json';

export default async function searchMaps(req, res) {
  // only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { query, secret } = req.body;

  // secret must be string
  if (typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }
  let user;

  if(secret) {
    user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
  }

  let hearted_maps = user ? user.hearted_maps : null;
  console.log('searching maps for query:', query);

  // Validate the search query
  if (!query || query.length < 3) {
    return res.status(400).json({ message: 'Search query must be at least 3 characters long' });
  }

  // sanitize query
  query = query.replace(/[^a-zA-Z0-9\s]/g, '');

  try {
    // Find maps that match the search query in either name, short description, or author name
    let maps = await Map.find({
      accepted: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description_short: { $regex: query, $options: 'i' } },
        { created_by_name: { $regex: query, $options: 'i' } }
      ]
    }).sort({ hearts: -1 }).limit(50);

    // Convert maps to sendable format
    let sendableMaps = await Promise.all(maps.map(async (map) => {
      const owner = await User.findById(map.created_by);
      return sendableMap(map, owner, hearted_maps?hearted_maps.has(map._id.toString()):false);
    }));

    res.status(200).json(sendableMaps);
  } catch (error) {
    console.error('Error searching maps:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
