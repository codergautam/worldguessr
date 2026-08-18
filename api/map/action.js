// import mapConst from "@/components/maps/mapConst";
// import parseMapData from "@/components/utils/parseMapData";
// import generateSlug from "@/components/utils/slugGenerator";
// import Map from "@/models/Map";
// import User from "@/models/User";

// import countries from '@/public/countries.json';
// import officialCountryMaps from '@/public/officialCountryMaps.json';
import mongoose from 'mongoose';
import mapConst from '../../components/maps/mapConst.js';
import parseMapData, { matchShortMapsLink, isResolvedMapsUrl } from '../../components/utils/parseMapData.js';
import generateSlug from '../../components/utils/slugGenerator.js';
import Map from '../../models/Map.js';
import User from '../../models/User.js';
import { Filter} from 'bad-words';
const filter = new Filter();
import countries from '../../public/countries.json' with { type: "json" };
import officialCountryMaps from '../../public/officialCountryMaps.json' with { type: "json" };
import { clearMapCaches } from '../../serverUtils/mapCache.js';

// Function to convert latitude and longitude to Cartesian coordinates
function latLngToCartesian(lat, lng) {
  const R = 6371; // Earth radius in km
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  const x = R * Math.cos(phi) * Math.cos(theta);
  const y = R * Math.cos(phi) * Math.sin(theta);
  const z = R * Math.sin(phi);
  return { x, y, z };
}

// Function to calculate the distance between two Cartesian coordinates
function calculateDistance(cart1, cart2) {
  const dx = cart1.x - cart2.x;
  const dy = cart1.y - cart2.y;
  const dz = cart1.z - cart2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


// Short-link expansion budget. Each link costs one outbound request to
// Google at publish time. Bulk files from generators carry real coordinates,
// so a submission needing more expansions than this is misuse, not a map.
const MAX_SHORT_LINKS = 500;
const SHORT_LINK_CONCURRENCY = 5;
const SHORT_LINK_TIMEOUT_MS = 5000;

// Successful resolutions, keyed by short link. Every request here leaves
// from ONE server IP, so Google throttling is a real risk; a resubmit after
// any later validation error (name taken, too few locations, ...) would
// otherwise re-resolve the exact same links. Successes only: a short link's
// destination never changes, while a failure may be transient throttling.
// `Map` in this file is the mongoose MODEL (models/Map.js) — it shadows the
// global container. Runtime maps must go through globalThis.
const JsMap = globalThis.Map;

const RESOLVED_CACHE_MAX = 5000;
const resolvedShortLinks = new JsMap();
function cacheResolved(url, target) {
  if (resolvedShortLinks.size >= RESOLVED_CACHE_MAX) {
    // Map iterates in insertion order, so this evicts the oldest entry.
    resolvedShortLinks.delete(resolvedShortLinks.keys().next().value);
  }
  resolvedShortLinks.set(url, target);
}

// Resolve one maps.app.goo.gl / goo.gl/maps link to its full /maps/@lat,lng
// URL via the Location header. redirect:'manual' is deliberate: the target
// is parsed as a STRING and never fetched, so the server only ever contacts
// the two Google hosts pinned by matchShortMapsLink.
// Returns { target, throttled }: target null on any failure, throttled true
// when the failure looks like Google rate limiting (429 or the /sorry
// interstitial) rather than a dead link.
async function resolveShortMapsLink(url) {
  const cached = resolvedShortLinks.get(url);
  if (cached) return { target: cached, throttled: false };
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
    });
    let target = res.headers.get('location') || '';
    if (res.status === 429 || target.includes('google.com/sorry')) {
      return { target: null, throttled: true };
    }
    // EU consent interstitial: the real destination rides in ?continue=
    if (target.startsWith('https://consent.google.com')) {
      try { target = new URL(target).searchParams.get('continue') || ''; } catch (e) { target = ''; }
    }
    if (isResolvedMapsUrl(target)) {
      cacheResolved(url, target);
      return { target, throttled: false };
    }
    return { target: null, throttled: false };
  } catch (e) {
    return { target: null, throttled: false };
  }
}

// Replace every short-link entry in the submitted data with its resolved
// full URL. Identical links resolve ONCE and fan out to all their indexes.
// Returns { data, tooMany, failed, throttled }:
//  - tooMany: unique-link count when over MAX_SHORT_LINKS, else 0
//  - failed:  short links that did not resolve — the caller must FAIL CLOSED
//             on these, or the map silently publishes with missing locations
//  - throttled: true when at least one failure was Google rate limiting
// Exported for tests, like duelCounterIncs in api/eloRank.js.
export async function expandShortMapsLinks(data) {
  if (!Array.isArray(data)) return { data, tooMany: 0, failed: [], throttled: false };

  // url -> [entry indexes]
  const targets = new JsMap();
  data.forEach((entry, i) => {
    if (typeof entry !== 'string') return;
    let s = entry.trim();
    // The file-upload path JSON-stringifies each entry, so a short link can
    // arrive wrapped in quotes.
    if (s.startsWith('"')) { try { s = JSON.parse(s); } catch (e) { return; } }
    const short = matchShortMapsLink(s);
    if (short) {
      if (!targets.has(short)) targets.set(short, []);
      targets.get(short).push(i);
    }
  });

  if (targets.size === 0) return { data, tooMany: 0, failed: [], throttled: false };
  if (targets.size > MAX_SHORT_LINKS) return { data, tooMany: targets.size, failed: [], throttled: false };

  const urls = [...targets.keys()];
  const out = [...data];
  const failed = [];
  let sawThrottle = false;
  let next = 0;
  // Plain shared-cursor pool: no await sits between the bounds check and the
  // increment, so two workers can never claim the same url.
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const { target, throttled } = await resolveShortMapsLink(url);
      if (throttled) sawThrottle = true;
      if (!target) failed.push(url);
      for (const i of targets.get(url)) out[i] = target;
    }
  };
  await Promise.all(Array.from({ length: Math.min(SHORT_LINK_CONCURRENCY, urls.length) }, worker));
  return { data: out, tooMany: 0, failed, throttled: sawThrottle };
}

async function validateMap(name, data, description_short, description_long, edit=false, mapId=null) {

  if(!name || !data || !description_short) {
    return 'Missing name, data, or description_short';
  }

  name = name.trim();
  description_short = description_short.trim();
  description_long = description_long ? description_long.trim() : '';

  // name cannot include crazygamesdue to a url detection bug
  if(name.toLowerCase().includes('crazygames')) {
    return 'Name cannot include "CrazyGames"';
  }

  // validate name
  if(typeof name !== 'string' || name.length < mapConst.MIN_NAME_LENGTH  || name.length > mapConst.MAX_NAME_LENGTH) {
    // return res.status(400).json({ message: `Name must be between ${mapConst.MIN_NAME_LENGTH} and ${mapConst.MAX_NAME_LENGTH} characters` });
    return `Name must be between ${mapConst.MIN_NAME_LENGTH} and ${mapConst.MAX_NAME_LENGTH} characters`;
  }

  // validate short description
  if(typeof description_short !== 'string' || description_short.length < mapConst.MIN_SHORT_DESCRIPTION_LENGTH || description_short.length > mapConst.MAX_SHORT_DESCRIPTION_LENGTH) {
    // return res.status(400).json({ message: `Short description must be between ${mapConst.MIN_SHORT_DESCRIPTION_LENGTH} and ${mapConst.MAX_SHORT_DESCRIPTION_LENGTH} characters` });
    return `Short description must be between ${mapConst.MIN_SHORT_DESCRIPTION_LENGTH} and ${mapConst.MAX_SHORT_DESCRIPTION_LENGTH} characters`;
  }

  // validate long description (only if provided)
  if(typeof description_long !== 'string' || description_long.length > mapConst.MAX_LONG_DESCRIPTION_LENGTH) {
    return `Long description must be under ${mapConst.MAX_LONG_DESCRIPTION_LENGTH} characters`;
  }

  // if long description is provided, it must meet minimum length
  if(description_long.length > 0 && description_long.length < mapConst.MIN_LONG_DESCRIPTION_LENGTH) {
    return `Long description must be at least ${mapConst.MIN_LONG_DESCRIPTION_LENGTH} characters or left empty`;
  }

  // make sure short and long descriptions are different (only if long description is provided)
  if(description_long.length > 0 && description_short === description_long) {
    // return res.status(400).json({ message: 'Short and long descriptions must be different' });
    return 'Short and long descriptions must be different';
  }

  const slug = generateSlug(name);
  if(!slug) {
    return 'Name must contain at least one Latin letter or number';
  }
  if(slug === 'all' || countries.includes(slug.toUpperCase()) || Object.values(officialCountryMaps).find(map => map.slug === slug)) {
    // return res.status(400).json({ message: 'Please choose a different name' });
    return 'Please choose a different name';
  }
  if(slug.toLowerCase().includes('crazygames') ) {
    return 'Name cannot include "CrazyGames"';
  }

  // validate data
  // Expand Google Maps share short links into full /maps/@lat,lng URLs
  // first: the coordinates only exist behind Google's redirect, so the
  // parser below can never read them from the short form.
  const expanded = await expandShortMapsLinks(data);
  if (expanded.tooMany) {
    return `Too many Google Maps short links (${expanded.tooMany}). At most ${MAX_SHORT_LINKS} per map: please paste full Street View URLs instead`;
  }
  if (expanded.throttled) {
    return 'Google is rate limiting link resolution right now. Wait a few minutes and publish again';
  }
  if (expanded.failed.length > 0) {
    // FAIL CLOSED: publishing anyway would silently shrink the map to the
    // links that happened to resolve. A link that stays dead here is an
    // unplayable location the creator should remove.
    return `Could not resolve ${expanded.failed.length} Google Maps short link(s), for example: ${expanded.failed[0]}. Remove or replace them and publish again`;
  }
  // parseMapData PRESERVES unresolved short links as strings (for this very
  // resolver); only object entries carry coordinates, so anything else is
  // invalid past this point. The filter also shields the cartesian math
  // below from string entries when `data` arrived in a nested/JSON shape
  // the expander doesn't walk.
  const locationsData = (parseMapData(expanded.data) || []).filter((loc) => loc && typeof loc === 'object');
  if(locationsData.length < mapConst.MIN_LOCATIONS) {
    // return res.status(400).json({ message: 'Need at least ' + mapConst.MIN_LOCATIONS + ' valid locations (got ' + (locationsData?.length ?? 0)+ ')' });
    return 'Need at least ' + mapConst.MIN_LOCATIONS + ' valid locations (got ' + (locationsData?.length ?? 0)+ ')';
  }
  if(locationsData.length > mapConst.MAX_LOCATIONS) {
    return `To make a map with more than ${mapConst.MAX_LOCATIONS} locations, please contact us at support@worldguessr.com`
  }

  // Mongo hard-caps documents at 16MB and all locations live in one map doc.
  // Without this guard an oversized save dies inside the driver
  // (BSONObjectTooLarge) and the creator gets a blank "Server error" 500.
  // 15MB threshold leaves room for the rest of the doc + update envelope.
  const bsonBytes = mongoose.mongo.BSON.serialize({ data: locationsData }).length;
  if (bsonBytes > 15 * 1024 * 1024) {
    return `This map is too large to store (${(bsonBytes / 1024 / 1024).toFixed(1)}MB of location data, limit 15MB). Reduce the number of locations, or contact us at support@worldguessr.com`;
  }

  // Convert all locations to Cartesian coordinates
  const cartesianLocations = locationsData.map(loc => latLngToCartesian(loc.lat, loc.lng));

  // Sort by x-coordinate (you can choose any dimension)
  cartesianLocations.sort((a, b) => a.x - b.x);

  // Find the maximum distance between the first and last sorted locations
  const maxDist = calculateDistance(cartesianLocations[0], cartesianLocations[cartesianLocations.length - 1]);

  // make sure slug or name is not already taken
  const existing = await Map.findOne({ slug: slug });
  if(existing && (edit ? existing._id.toString() != mapId : true)) {
    return 'Name already taken';
  }
  const existingName = await Map.findOne({ name: name });
  if(existingName && (edit ? existingName._id.toString() != mapId : true)) {
    return 'Name already taken';
  }

  return { slug, locationsData, maxDist };
}

export default async function handler(req, res) {

  // only allow post
  if(req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { action, secret, name, data, description_short, description_long, mapId } = req.body;

  //secret must be string
  if(typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }
  if(!action || !secret) {
    return res.status(400).json({ message: 'Missing action or secret' });
  }

  // make sure name,short&long desc is appopriate
  if(filter.isProfane(name) || filter.isProfane(description_short) || filter.isProfane(description_long)) {
    return res.status(400).json({ message: 'Inappropriate content' });
  }


  // get user from secret
  const user = await User.findOne({ secret: secret });
  if(!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // prevent banned or force-name-changed users from creating/editing maps
  if(user.banned) {
    return res.status(403).json({ message: 'Your account is suspended. You cannot create or edit maps.' });
  }
  if(user.pendingNameChange) {
    return res.status(403).json({ message: 'You must change your name before you can create or edit maps.' });
  }

  // creating map
  if(action === 'create') {

    const validation = await validateMap(name, data, description_short, description_long);
    if(typeof validation === 'string') {
      return res.status(400).json({ message: validation });
    }

    // create map
    const map = await Map.create({
      slug: validation.slug,
      name,
      created_by: user._id,
      data: validation.locationsData,
      locationsCnt: validation.locationsData.length,
      description_short,
      description_long,
      maxDist: validation.maxDist,
      // in_review: user.instant_accept_maps ? false : true,
      // accepted: user.instant_accept_maps ? true : false,
      in_review: false,
      accepted: true,
      map_creator_name: user.username,
      lastUpdated: new Date()
    });

    // A prior 404 lookup (or a deleted map with the same name) may have cached
    // a stale/null doc under this slug — recreate-after-delete must be instant.
    clearMapCaches(validation.slug);

    return res.status(200).json({ message: 'Map created', map });
  } else if(action === 'edit') {
    if(!mapId) {
      return res.status(400).json({ message: 'Missing mapId' });
    }

    const map = await Map.findById(mapId);
    if(!map) {
      return res.status(404).json({ message: 'Map not found' });
    }
    if(!user.staff && map.created_by.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'You do not have permission to edit this map' });
    }

    const validation = await validateMap(name, data, description_short, description_long, true, mapId);
    if(typeof validation === 'string') {
      return res.status(400).json({ message: validation });
    }

    // map.slug = validation.slug;
    map.name = name;
    map.data = validation.locationsData;
    map.locationsCnt = validation.locationsData.length;
    map.description_short = description_short;
    map.description_long = description_long;
    // map.in_review= user.instant_accept_maps ? false : true;
    map.reject_reason = "";
    // map.accepted = !map.in_review;

    map.maxDist = validation.maxDist;
    map.lastUpdated = new Date();

    await map.save();

    // clear cache: game locations, map page doc, and Cloudflare's edge copy
    clearMapCaches(map.slug);

    return res.status(200).json({ message: 'Map edited', map });
  } else if(action === 'get') {
    if(!mapId) {
      return res.status(400).json({ message: 'Missing mapId' });
    }


    const map = await Map.findById(mapId);

    // make sure staff or owner
    if(!map || (!user.staff && map.created_by.toString() !== user._id.toString())) {
      return res.status(404).json({ message: 'Map not found' });
    }

    return res.status(200).json({ map });

  }

  return res.status(400).json({ message: 'Invalid action' });
}

export const config = {
  api: {
      bodyParser: {
          sizeLimit: '50mb'
      }
  }
}
