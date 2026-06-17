import { getServerSecret } from "../../components/auth/serverAuth.js";
import officialCountryMaps from "../../public/officialCountryMaps.json" with { type: "json" };
import Map from "../../models/Map.js";
import User from "../../models/User.js";
import msToTime from "../../components/msToTime.js";

export default async function handler(req, res) {
  const slug = req.query.slug;
  const secret = await getServerSecret(req);
  const session = {};
  if(secret) {
    await User.findOne({ secret }).select("secret staff hearted_maps").then((user) => {
      session.token = { secret, staff: user.staff };
      session.hearted_maps = user?.hearted_maps;
    });
  }

  // Check if map is an official country map
  const cntryMap = Object.values(officialCountryMaps).find(map => map.slug === slug);
  if (cntryMap) {
    return res.json({
      mapData: {
        ...cntryMap,
        description_short: cntryMap.shortDescription,
        description_long: cntryMap.longDescription,
        created_by: "WorldGuessr",
        in_review: false,
        rejected: false
      }
    });
  }

  // If map is not official, check user-created maps
  const map = await Map.findOne({ slug })
    .select({ 'data': { $slice: 5 } }) // Slice the data to limit to 5 items - REDUCED FROM 5000 TO REDUCE SERVER OVERHEAD
    .lean().cache(10000);

  if (!map) {
    return res.status(404).json({ message: 'Map not found' });
  }


  // if map.created_at is string, convert to Date
  if (typeof map.created_at === 'string') {
    map.created_at = new Date(map.created_at);
  }
  const locationcnt = map?.locationsCnt;

  const authorId = map.created_by;
  const authorUser = await User.findById(authorId).lean();
  const authorSecret = authorUser?.secret;
  const staff = session?.token?.staff;

  const isCreatorOrStaff = session && (authorSecret === session?.token?.secret || staff);

  if (!map.accepted && !isCreatorOrStaff) {
    return res.status(404).json({ message: 'Map not accepted or no permission to view' });
  }

  // Don't mutate the cached object - create a new response object
  const hearted = session.hearted_maps ? session.hearted_maps.has(map._id.toString()) : false;
  const responseData = {
    ...map,
    created_by: authorUser?.username,
    created_at: msToTime(Date.now() - map.created_at),
    locationcnt: locationcnt,
    hearted
  };

  return res.json({
    mapData: responseData
  });
}