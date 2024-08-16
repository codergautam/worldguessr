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

  const { query } = req.body;

  // Validate the search query
  if (!query || query.length < 3) {
    return res.status(400).json({ message: 'Search query must be at least 3 characters long' });
  }

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
      return sendableMap(map, owner);
    }));

    res.status(200).json(sendableMaps);
  } catch (error) {
    console.error('Error searching maps:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
