import sendableMap from "../../components/utils/sendableMap.js";
import Map from "../../models/Map.js";
import User from "../../models/User.js";
import officialCountryMaps from '../../public/officialCountryMaps.json' with { type: "json" };

let mapCache = {
  popular: {
    data: [],
    timeStamp: 0,
    persist: 9600000
  },
  recent: {
    data: [],
    timeStamp: 0,
    persist: 2400000
  },
  spotlight: {
    data: [],
    timeStamp: 0,
    persist: 4800000
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
    console.time('findUser');
    user = await User.findOne({ secret: secret });
    console.timeEnd('findUser');
    if(typeof secret !== 'string') {
      return res.status(400).json({ message: 'Invalid input' });
    }
    if(!user) {
      return res.status(404).json({ message: 'User not found' });
    }
  }

  let hearted_maps = user ? user.hearted_maps :  null;
  let response = {};
  // sections
  // [reviewQueue (if staff), myMaps (if exists), likedMaps, officialCountryMaps, recent, popular  ]

  // if(user?.staff) {
  //   // reviewQueue
  //   console.time('findReviewQueue');
  //   // let queueMaps = await Map.find({ in_review: true });
  //   let queueMaps = [];
  //   console.timeEnd('findReviewQueue');

  //   console.time('findReviewQueueOwner');
  //   let queueMapsSendable = await Promise.all(queueMaps.map(async (map) => {
  //     let owner;
  //     if(!map.map_creator_name) {
  //     owner = await User.findById(map.created_by);
  //     // save map creator name
  //     console.log('updating map creator name', map._id, owner.username, map.name);
  //     map.map_creator_name = owner.username;
  //     await map.save();
  //     } else {
  //       owner = { username: map.map_creator_name };
  //     }

  //     const isCreator = map.created_by === user._id.toString();
  //     return sendableMap(map, owner, hearted_maps?hearted_maps.has(map._id.toString()):false, true, isCreator);
  //   }));
  //   console.timeEnd('findReviewQueueOwner');

  //   // oldest to newest
  //   queueMapsSendable.sort((a,b) => b.created_at - a.created_at);
  //   response.reviewQueue = queueMapsSendable;
  // }

  // owned maps
  // find maps made by user
  if(user) {
    // created_at, slug, name, hearts,plays, description_short, map_creator_name, _id, in_review, official, accepted, reject_reason, resubmittable, locationsCnt
    console.time('findMyMaps');
    let myMaps = await Map.find({ created_by: user._id.toString() }).select({
      created_at: 1,
      slug: 1,
      name: 1,
      hearts: 1,
      plays: 1,
      description_short: 1,
      map_creator_name: 1,
      in_review: 1,
      official: 1,
      accepted: 1,
      reject_reason: 1,
      resubmittable: 1,
      // count # of data to get locations
      locationsCnt:  { $size: "$data" }
    }).lean();
    myMaps = myMaps.map((map) => sendableMap(map, user, hearted_maps?hearted_maps.has(map._id.toString()):false, user.staff, true));
    myMaps.sort((a,b) => a.created_at - b.created_at);
    if(myMaps.length > 0) response.myMaps = myMaps;
    // likedMaps
    // find maps liked by user
    const likedMaps = user.hearted_maps ? await Map.find({ _id: { $in: Array.from(user.hearted_maps.keys()) } }) : [];
    let likedMapsSendable = await Promise.all(likedMaps.map(async (map) => {
      let owner;
      if(!map.map_creator_name) {
      owner = await User.findById(map.created_by);
      // save map creator name
      console.log('updating map creator name', map._id, owner.username, map.name);
      map.map_creator_name = owner.username;
      await map.save();

      } else {
        owner = { username: map.map_creator_name };
      }
      return sendableMap(map, owner, true, user.staff, map.created_by === user._id.toString());
    }));
    likedMapsSendable.sort((a,b) => b.created_at - a.created_at);
    if(likedMapsSendable.length > 0) response.likedMaps = likedMapsSendable;

  }

  response.countryMaps = Object.values(officialCountryMaps).map((map) => ({
    ...map,
    created_by_name: 'WorldGuessr',
    official: true,
    countryMap: map.countryCode,
    description_short: map.shortDescription,
  })).sort((b,a)=>a.maxDist - b.maxDist);

  const discovery =  ["spotlight","popular","recent"];
  for(const method of discovery) {
    if(mapCache[method].data.length > 0 && Date.now() - mapCache[method].timeStamp < mapCache[method].persist) {
      // retrieve from cache
      response[method] = mapCache[method].data;
      // check hearted maps
      response[method].map((map) => {
        map.hearted = hearted_maps?hearted_maps.has(map.id.toString()):false;
        return map;
      });

      // for spotlight randomize the order
      if(method === "spotlight") {
        response[method] = response[method].sort(() => Math.random() - 0.5);
      }
    } else {
      // retrieve from db
      let maps = [];
      if(method === "recent") {
        console.time('findRecentMaps');
        maps = await Map.find({ accepted: true }).sort({ created_at: -1 }).limit(100);
        console.timeEnd('findRecentMaps');
      } else if(method === "popular") {
        console.time('findPopularMaps');
        maps = await Map.find({ accepted: true })        .select({
          locationsCnt: { $size: "$data" },
          created_at: 1,
          slug: 1,
          name: 1,
          hearts: 1,
          plays: 1,
          description_short: 1,
          map_creator_name: 1,
          in_review: 1,
          official: 1,
          accepted: 1,
          reject_reason: 1,
          resubmittable: 1
      });

      // sort and limit to 100
      maps = maps.sort((a,b) => b.hearts - a.hearts).slice(0,100);

        console.timeEnd('findPopularMaps');
      } else if(method === "spotlight") {
        maps = await Map.find({ accepted: true, spotlight: true }).limit(100).allowDiskUse(true);
        console.log('spotlight maps', maps.length);
      }

      let sendableMaps = await Promise.all(maps.map(async (map) => {
        let owner;
        if(!map.map_creator_name && map.data) {
         owner = await User.findById(map.created_by);
          // save map creator name
          console.log('updating map creator name', map._id, owner.username, map.name);
          map.map_creator_name = owner.username;
          await map.save();
        } else {
          owner = { username: map.map_creator_name };
        }
        return sendableMap(map, owner,hearted_maps?hearted_maps.has(map._id.toString()):false);
      }));

      response[method] = sendableMaps;
      // if spotlight, randomize the order
      if(method === "spotlight") {
        response[method] = response[method].sort(() => Math.random() - 0.5);
      }

      mapCache[method].data = sendableMaps;
      // dont store hearted maps in cache
      mapCache[method].data = sendableMaps.map((map) => {
        return {
          ...map,
          hearted: false
        }
      });
      mapCache[method].timeStamp = Date.now();
    }
  }

  res.status(200).json(response);
}

export const config = {
  api: {
    responseLimit: false,
  },
}
