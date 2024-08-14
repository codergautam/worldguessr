import mapConst from "@/components/maps/mapConst";
import parseMapData from "@/components/utils/parseMapData";
import generateSlug from "@/components/utils/slugGenerator";
import Map from "@/models/Map";
import User from "@/models/User";

let mapCache = {
  popular: {
    data: [],
    timeStamp: 0,
    persist: 7200000
  },
  recent: {
    data: [],
    timeStamp: 0,
    persist: 1800000
  }
}

function sendableMap(map, user) {
  return {
    created_at: Date.now() - map.created_at.getTime(),
    slug: map.slug,
    name: map.name,
    hearts: map.hearts,
    plays: map.plays,
    description_short: map.description_short,
    created_by_name: user.username ?? map.created_by,
    id: map._id
  }
}

export default async function handler(req, res) {

  // only allow post
  if(req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { secret } = req.body;
  let user;

  if(secret) {
  user = await User.findOne({
    secret: secret
  });

  if(!user) {
    return res.status(404).json({ message: 'User not found' });
  }
}

  let response = {};
  // sections
  // [reviewQueue (if staff), myMaps (if exists), recent, popular  ]

  if(user?.staff) {
    // reviewQueue
    console.log('staff queue');
    let queueMaps = await Map.find({
      in_review: true
    })

    console.log(queueMaps);

    let queueMapsSendable = await Promise.all(queueMaps.map(async (map) => {
      const owner = await User.findById(map.created_by);
      return sendableMap(map, owner);
    }));

    // oldest to newest
    queueMapsSendable.sort((a,b) => b.created_at - a.created_at)
    response.reviewQueue = queueMapsSendable;
  }

  // owned maps
  // find maps made by user
  if(user) {
  let myMaps = await Map.find({
    created_by: user._id.toString()
  });
  myMaps = myMaps.map((map) => sendableMap(map,user))
  myMaps.sort((a,b) => a.created_at - b.created_at)
  if(myMaps.length > 0) response.myMaps = myMaps;
}

  const discovery =  ["recent","popular"]
  for(const method of discovery) {
    if(mapCache[method].data.length > 0 && Date.now() - mapCache[method].timeStamp < mapCache[method].persist) {
      // retrieve from cache
      response[method] = mapCache[method].data;
    } else {
      // retrieve from db
      let maps = [];
      const limit = 20; // 20 map limit on each section
      if(method === "recent") {
       maps = await Map.find({ accepted: true }).sort({ created_at: -1 }).limit(limit);
      } else if(method === "popular") {
       maps = await Map.find({ accepted: true }).sort({ hearts: -1 }).limit(limit);
      }

      let sendableMaps = await Promise.all(maps.map(async (map) => {
        const owner = await User.findById(map.created_by);
        return sendableMap(map, owner);
      }));

      response[method] = sendableMaps;
      mapCache[method].data = sendableMaps;
      mapCache[method].timeStamp = Date.now();
    }
  }

  res.status(200).json(response);
}