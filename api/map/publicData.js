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
    await User.findOne({ secret }).select("secret staff").then((user) => {
      session.token = { secret, staff: user.staff };
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
    .select({ 'data': { $slice: 10 } }) // Slice the data to limit to 10 items
    .lean().cache(10000);

  if (!map) {
    return res.status(404).json({ message: 'Map not found' });
  }

  const authorId = map.created_by;
  const authorUser = await User.findById(authorId).lean();
  const authorSecret = authorUser?.secret;
  const staff = session?.token?.staff;

  const isCreatorOrStaff = session && (authorSecret === session?.token?.secret || staff);

  if (!map.accepted && !isCreatorOrStaff) {
    return res.status(404).json({ message: 'Map not accepted or no permission to view' });
  }

  map.created_by = authorUser?.username;
  map.created_at = msToTime(Date.now() - map.created_at);

  return res.json({
    mapData: map
  });
}