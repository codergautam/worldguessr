
import sendableMap from "../../components/utils/sendableMap.js";
import Map from "../../models/Map.js";
import User from "../../models/User.js";

export default async function searchMaps(req, res) {
  // only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { query, secret } = req.body;
  console.log("searchMaps", query, secret);

  return res.status(429).json({ message: 'Temporarily not available' });

  // secret must be string
  if (secret && typeof secret !== 'string') {
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

  // Validate the search query
  if (!query || query.length < 3) {
    return res.status(400).json({ message: 'Search query must be at least 3 characters long' });
  }

  // sanitize query
  query = query.replace(/[^a-zA-Z0-9\s]/g, '');

  try {
    // Find maps that match the search query in either name, short description, or author name
    // let maps = await Map.find({
    //   accepted: true,
    //   $or: [
    //     { name: { $regex: query, $options: 'i' } },
    //     { description_short: { $regex: query, $options: 'i' } },
    //     { created_by_name: { $regex: query, $options: 'i' } }
    //   ]
    // }).sort({ hearts: -1 }).limit(50).cache(10000);

    let maps = await Map.find({
      accepted: true,
      $text: { $search: query }
    }).sort({ hearts: -1 }).limit(50).cache(10000);


    // Convert maps to sendable format
    let sendableMaps = await Promise.all(maps.map(async (map) => {

      let owner;
      if(!map.map_creator_name) {
      owner = await User.findById(map.created_by);
      // if owner is not found, set to null
      if(!owner) {
        owner = null;
      }
      // save map creator name
      map.map_creator_name = owner.username;
      await map.save();
      } else{
        owner = { username: map.map_creator_name };
      }

      return sendableMap(map, owner, hearted_maps?hearted_maps.has(map._id.toString()):false, user?.staff, map.created_by === user?._id.toString());
    }));

    res.status(200).json(sendableMaps);
  } catch (error) {
    console.error('Error searching maps:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
