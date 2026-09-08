import sendableMap from "../../components/utils/sendableMap.js";
import Map from "../../models/Map.js";
import User from "../../models/User.js";
import officialCountryMaps from '../../public/officialCountryMaps.json' with { type: "json" };
import shuffle from "../../utils/shuffle.js";
import { registerStat } from '../../serverUtils/statRegistry.js';
import { cosmeticsForUserIds } from '../../serverUtils/userCosmetics.js';

/* Creator name-glows for a batch of maps: ONE query for the whole section,
 * never one per tile. A discovery section is up to 100 maps and this endpoint
 * is on the home screen's critical path.
 *
 * The result is baked into the section BEFORE it goes in mapCache below, which
 * is deliberate: the alternative is a 100-id $in on every single mapHome
 * request, which is a real cost paid on a hot path to shave hours off the
 * staleness of a decoration. The creator's NAME is already denormalised onto
 * the Map document and just as stale, so the glow ages with the name it sits
 * next to rather than out of step with it.
 */
async function creatorGlows(maps) {
  const cosmetics = await cosmeticsForUserIds(maps.map((m) => m.created_by));
  return (map) => ({
    username: map.map_creator_name,
    nameGlow: cosmetics.get(String(map.created_by))?.nameGlow || null,
  });
}

let mapCache = {
  popular: {
    data: [],
    timeStamp: 0,
    persist: 9600000
  },
  recent: {
    data: [],
    timeStamp: 0,
    persist: 4800000
  },
  spotlight: {
    data: [],
    timeStamp: 0,
    persist: 48000000
  }
}
registerStat('api/map/mapHome.mapCache.popular.data', () => mapCache.popular.data.length);
registerStat('api/map/mapHome.mapCache.recent.data', () => mapCache.recent.data.length);
registerStat('api/map/mapHome.mapCache.spotlight.data', () => mapCache.spotlight.data.length);

// The one field list every map list fetches — the wire shape is sendableMap,
// so nothing outside it is ever pulled, above all not `data` (the full
// location list: 65 KB average, 12.5 MB outliers). likedMaps adds
// description_long on top for the staff/creator branch of sendableMap.
const MAP_LIST_FIELDS = {
  locationsCnt: 1,
  created_at: 1,
  lastUpdated: 1,
  slug: 1,
  name: 1,
  hearts: 1,
  plays: 1,
  description_short: 1,
  map_creator_name: 1,
  // The join key for the creator's name glow. It going missing looks exactly
  // like "glows work everywhere except this section".
  created_by: 1,
  in_review: 1,
  official: 1,
  accepted: 1,
  reject_reason: 1,
  resubmittable: 1,
};

// Legacy orphan backfill: map_creator_name is `required` on the schema, so
// only pre-validation rows reach this. A creator that no longer resolves (a
// deleted account, or a created_by that is not an ObjectId and throws a
// CastError) must not take a section or the whole endpoint down: show a
// placeholder for that one map and leave the row alone so a later read can
// try again. updateOne, not save(): these are lean stubs under a projection.
async function backfillCreatorName(map) {
  // No creator id at all: Mongoose drops an undefined filter value, so
  // findById(undefined) becomes findOne({}) and returns an arbitrary user
  // whose name would then be written onto this map. Never look up a blank.
  if (!map.created_by) {
    map.map_creator_name = 'Unknown';
    return;
  }
  let owner = null;
  try {
    owner = await User.findById(map.created_by).select('username').lean();
  } catch (err) {
    console.warn('[mapHome] creator lookup failed for map', String(map._id), err?.message);
  }
  const name = owner?.username;
  if (!name) {
    map.map_creator_name = 'Unknown';
    return;
  }
  map.map_creator_name = name;
  try {
    await Map.updateOne({ _id: map._id }, { map_creator_name: name });
  } catch (err) {
    console.warn('[mapHome] creator backfill write failed for map', String(map._id), err?.message);
  }
}

// Rebuild one discovery section from the DB. Sort + limit happen IN THE
// DATABASE ({accepted,hearts}/{accepted,lastUpdated}/{accepted,spotlight}
// indexes, ~15ms) and the projection + lean keep hydration to 100 plain
// stubs. The old popular path hydrated all 71k accepted maps into full
// Mongoose documents and sorted them in JS — 3-8s of blocked event loop that
// froze the entire API every time the 80-minute cache expired.
async function rebuildDiscovery(method) {
  let query;
  if (method === "recent") {
    query = Map.find({ accepted: true }).sort({ lastUpdated: -1 });
  } else if (method === "popular") {
    query = Map.find({ accepted: true }).sort({ hearts: -1 });
  } else {
    query = Map.find({ accepted: true, spotlight: true }).allowDiskUse(true);
  }
  const maps = await query.select(MAP_LIST_FIELDS).limit(100).lean();

  const sectionCreator = await creatorGlows(maps);
  const sendableMaps = await Promise.all(maps.map(async (map) => {
    if (!map.map_creator_name) await backfillCreatorName(map);
    // hearted is stamped per request on a copy; the cache always holds false.
    return sendableMap(map, sectionCreator(map), false);
  }));

  mapCache[method].data = sendableMaps;
  mapCache[method].timeStamp = Date.now();
  return sendableMaps;
}

// One rebuild per section at a time, shared across requests. Concurrent cache
// misses used to EACH run the full rebuild — every request landing during the
// window repeated the work and blocked the loop again.
function rebuildDiscoveryShared(method) {
  if (!mapCache[method].inflight) {
    mapCache[method].inflight = rebuildDiscovery(method).finally(() => {
      mapCache[method].inflight = null;
    });
  }
  return mapCache[method].inflight;
}

export default async function handler(req, res) {
  const timings = {};
  const startTotal = Date.now();

  // Allow GET for anonymous requests (cacheable by Cloudflare)
  const isAnon = req.query.anon === 'true';
  
  if(req.method === 'GET' && isAnon) {
    // Anonymous GET request - cacheable, no user lookup
  } else if(req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { secret, inCG } = req.body || {};

  let user;

  // Skip user lookup for anonymous requests
  if(secret && !isAnon) {
    // Prevent NoSQL injection - validate secret type BEFORE the query
    if(typeof secret !== 'string') {
      return res.status(400).json({ message: 'Invalid input' });
    }
    const startUser = Date.now();
    user = await User.findOne({ secret: secret });
    timings.userLookup = Date.now() - startUser;
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
    const startMyMaps = Date.now();
    // created_at, slug, name, hearts,plays, description_short, map_creator_name, _id, in_review, official, accepted, reject_reason, resubmittable, locationsCnt
    let myMaps = await Map.find({ created_by: user._id.toString() }).select({
      created_at: 1,
      lastUpdated: 1,
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
      locationsCnt: 1,
    }).lean();
    // Creator is the requesting user — no lookup, the glow is already in hand.
    const me = { username: user.username, nameGlow: user.cosmetics?.equipped?.nameGlow || null };
    myMaps = myMaps.map((map) => sendableMap(map, me, hearted_maps?hearted_maps.has(map._id.toString()):false, user.staff, true));
    myMaps.sort((a,b) => a.created_at - b.created_at);
    if(myMaps.length > 0) response.myMaps = myMaps;
    timings.myMaps = Date.now() - startMyMaps;

    // likedMaps
    // find maps liked by user
    const startLikedMaps = Date.now();
    // Projection + lean: heavy hearters (900+ maps) pulled full documents —
    // data included — for 3.5s responses and tens of MB of hydration.
    // description_long rides along for the staff/creator branch of sendableMap.
    const likedMaps = user.hearted_maps
      ? await Map.find({ _id: { $in: Array.from(user.hearted_maps.keys()) } })
          .select({ ...MAP_LIST_FIELDS, description_long: 1 })
          .lean()
      : [];
    const likedCreator = await creatorGlows(likedMaps);
    let likedMapsSendable = await Promise.all(likedMaps.map(async (map) => {
      if(!map.map_creator_name) await backfillCreatorName(map);
      return sendableMap(map, likedCreator(map), true, user.staff, map.created_by === user._id.toString());
    }));
    likedMapsSendable.sort((a,b) => b.created_at - a.created_at);
    if(likedMapsSendable.length > 0) response.likedMaps = likedMapsSendable;
    timings.likedMaps = Date.now() - startLikedMaps;
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
    const startMethod = Date.now();
    const entry = mapCache[method];
    const fresh = entry.data.length > 0 && Date.now() - entry.timeStamp < entry.persist;
    if(!fresh) {
      if(entry.data.length > 0) {
        // Stale but servable: kick the (shared) rebuild off and serve the old
        // list. Nobody waits on a refresh of a discovery shelf — the old code
        // made every request during a rebuild pay for its own copy of it.
        rebuildDiscoveryShared(method).catch((e) => console.error(`[mapHome] ${method} rebuild failed`, e));
        timings[method + '_staleServe'] = true;
      } else {
        // Cold start: nothing to serve yet, so this request awaits the shared
        // rebuild. A failed rebuild leaves THIS section empty on this
        // response and lets the next request retry; it must not 500 the
        // whole endpoint (myMaps, likedMaps and the other shelves).
        try {
          await rebuildDiscoveryShared(method);
        } catch (e) {
          console.error(`[mapHome] ${method} rebuild failed`, e);
        }
      }
    }
    // Per-request COPY of the cached section. The cache is shared state:
    // stamping hearted onto the cached objects let concurrent requests for
    // different users overwrite each other mid-flight (user A rendered user
    // B's hearts whenever their handlers interleaved on an await).
    let section = mapCache[method].data.map((map) => ({
      ...map,
      hearted: hearted_maps ? hearted_maps.has(map.id.toString()) : false,
    }));
    // for spotlight randomize the order
    if(method === "spotlight") {
      section = shuffle(section);
    }
    response[method] = section;
    timings[method] = Date.now() - startMethod;
    timings[method + '_cached'] = fresh;
  }

  timings.total = Date.now() - startTotal;
  
  // Measure JSON serialization time
  const serializeStart = Date.now();
  const jsonResponse = JSON.stringify(response);
  timings.serialize = Date.now() - serializeStart;
  timings.responseSize = jsonResponse.length;
  
  console.log('[mapHome] Timings (ms):', JSON.stringify(timings));

  // Track when response actually finishes sending
  const sendStart = Date.now();
  res.on('finish', () => {
    const sendTime = Date.now() - sendStart;
    if (sendTime > 100) {
      console.log(`[mapHome] SLOW SEND: ${sendTime}ms for ${jsonResponse.length} bytes`);
    }
  });

  res.status(200).type('application/json').send(jsonResponse);
}

export const config = {
  api: {
    responseLimit: false,
  },
}
