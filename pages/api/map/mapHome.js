import mapConst from "@/components/maps/mapConst";
import parseMapData from "@/components/utils/parseMapData";
import generateSlug from "@/components/utils/slugGenerator";
import Map from "@/models/Map";
import User from "@/models/User";

let popularMapsCache = {
  data: [],
  timeStamp: 0,
  persist: 7200000
}
let recentMapsCache = {
  data: [],
  timeStamp: 0,
  persist: 1800000
}
let trendingMapsCache = {
  data: [],
  timeStamp: 0,
  persist: 3600000
}

function sendableMap(map) {
  return {
    created_at: Date.now() - map.created_at.getTime(),
    slug: map.slug,
    name: map.name,
    hearts: map.hearts,
    plays: map.plays,
    description_short: map.description_short,
    created_by: map.created_by,
    id: map._id
  }
}

export default async function handler(req, res) {

  // only allow get
  if(req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { secret } = req.body;

  if(!secret) {
    return res.status(400).json({ message: 'Missing action or secret' });
  }

  // get user from secret
  const user = await User.findOne({
    secret: secret
  });
  // find maps made by user
  let ownedMaps = await Map.find({
    created_by: user._id
  });
  ownedMaps.sort((a,b) => b.created_at.getTime() - a.created_at.getTime())

  if(!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  let response = {};
  // sections
  // [reviewQueue (if staff), myMaps (if exists), trendingMaps, recentMaps, popularMaps  ]
  if(user.staff) {
    // reviewQueue
    let queueMaps = await Map.find({
      in_review: true
    })
    queueMaps.sort((a,b) => b.created_at.getTime() - a.created_at.getTime())
    queueMaps = queueMaps.map(sendableMap);

  }
}