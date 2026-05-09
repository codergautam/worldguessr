/*
                    _     _
__      _____  _ __| | __| | __ _ _   _  ___  ___ ___ _ __
\ \ /\ / / _ \| '__| |/ _` |/ _` | | | |/ _ \/ __/ __| '__|
 \ V  V / (_) | |  | | (_| | (_| | |_| |  __/\__ \__ \ |
  \_/\_/ \___/|_|  |_|\__,_|\__, |\__,_|\___||___/___/_|  API
                            |___/
A game by Gautam

https://github.com/codergautam/worldguessr
*/

import fs from 'fs';
import { config } from 'dotenv';
const __dirname = import.meta.dirname;

config();

// Simple memory log, printed every 10s. Shows the split between JS heap and
// off-heap (ext/buf), plus a per-tick delta. If heap grows but ext/buf don't,
// the leak is in JS. If ext/buf grow, the leak is in buffers/native.
let __lastHeapMb = 0;
setInterval(() => {
  const mem = process.memoryUsage();
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const extMb = Math.round((mem.external || 0) / 1024 / 1024);
  const bufMb = Math.round((mem.arrayBuffers || 0) / 1024 / 1024);
  const delta = __lastHeapMb ? heapMb - __lastHeapMb : 0;
  __lastHeapMb = heapMb;
  const sign = delta >= 0 ? '+' : '';
  console.log(`[MEM] heap=${heapMb}MB (${sign}${delta}) rss=${rssMb}MB ext=${extMb}MB buf=${bufMb}MB`);
}, 10000);

import mongoose from 'mongoose';
import cachegoose from 'recachegoose';
import { registerStat as __registerCacheStat } from './serverUtils/statRegistry.js';

cachegoose(mongoose, {
  engine: "memory"
});

// recachegoose exposes the Cache instance on `init._cache`; reach through it
// to the lru-cache backing the memory engine and report its item count.
__registerCacheStat('recachegoose.itemCount', () => {
  try {
    if (!cachegoose?._cache) return 'no _cache (cachegoose not initialised)';
    if (!cachegoose._cache._cache) return 'no _cache._cache (Cacheman missing)';
    const engine = cachegoose._cache._cache._engine;
    if (!engine) return 'no _engine (memory store missing)';
    const lru = engine.client;
    if (!lru) return 'no engine.client (lru missing)';
    if (typeof lru.itemCount === 'number') return lru.itemCount;
    if (typeof lru.size === 'number') return lru.size;
    if (typeof lru.length === 'number') return lru.length;
    if (typeof lru.keys === 'function') {
      const k = lru.keys();
      return Array.isArray(k) ? k.length : `keys=${typeof k}`;
    }
    return `unknown lru shape: ${Object.keys(lru).join(',')}`;
  } catch (e) {
    return `error: ${e?.message || e}`;
  }
});

import findLatLongRandom from './components/findLatLongServer.js';
import path from 'path';
import MapModel from './models/Map.js';
import bodyParser from 'body-parser';
import countries from './public/countries.json' with { type: "json" };

// colors
import colors from 'colors';
import shuffle from './utils/shuffle.js';

// express
import express from 'express';
var app = express();

// disable cors
import cors from 'cors';
import cityGen from './serverUtils/cityGen.js';
import { registerCacheBusRoute } from './serverUtils/cacheBus.js';
import { registerStat, getAllStats } from './serverUtils/statRegistry.js';
import User from './models/User.js';
function currentDate() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
}
app.use(cors());
app.use(bodyParser.json({limit: '30mb'}));
app.use(bodyParser.urlencoded({limit: '30mb', extended: true, parameterLimit: 50000}));

// Request timing middleware - log slow requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 100) { // Log requests over 100ms
      console.log(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});

// Loud, grep-friendly logger for serious issues that warrant investigation.
// Search logs for "!!!" or any tag below to find every incident.
function logCritical(tag, details) {
  const ts = new Date().toISOString();
  console.error('\n=========================================================');
  console.error(`[${ts}] !!! ${tag} !!!`);
  if (details && typeof details === 'object') {
    for (const [k, v] of Object.entries(details)) {
      if (v instanceof Error) {
        console.error(`  ${k}: ${v.message}`);
        if (v.stack) console.error(v.stack);
      } else {
        console.error(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      }
    }
  } else if (details !== undefined) {
    console.error(details);
  }
  console.error('=========================================================\n');
}

// Setup  /api routes
const apiFolder = path.join(__dirname, 'api');
function loadFolder(folder, subdir = '') {
  fs.readdirSync(folder).forEach(file => {
    const filePath = path.join(folder, file);
    if(fs.lstatSync(filePath).isDirectory()) {
      loadFolder(filePath, subdir + file + '/');
      return;
    }
    if(!file.endsWith('.js')) {
      return;
    }

    const routePath = './api/' + subdir + file.split('.')[0]+'.js';
    const webPath = '/api/' + subdir + file.split('.')[0];
    import(routePath).then(module => {
      app.all(webPath, (req, res) => {
        Promise.resolve(module.default(req, res)).catch((err) => {
          logCritical('API HANDLER CRASH', {
            path: webPath,
            method: req.method,
            error: err,
          });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Server error' });
          }
        });
      });
    });
  });
}

let dbEnabled = true;

if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set".yellow);
  dbEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
    } catch (error) {
      console.error('[ERROR] Database connection failed!'.red, error.message);
      console.log(error);
      dbEnabled = false;
    }
  }
}


if(process.env.DISCORD_WEBHOOK) {
  console.log("[INFO] Discord Webhook Enabled");
}
if(!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
  console.log("[MISSING-ENV WARN] NEXT_PUBLIC_GOOGLE_CLIENT_ID env variable not set, please set it for multiplayer/auth!".yellow);
  dbEnabled = false;
}
if(!process.env.GOOGLE_CLIENT_SECRET) {
  console.log("[MISSING-ENV WARN] GOOGLE_CLIENT_SECRET env variable not set, please set it for multiplayer/auth!".yellow);
  dbEnabled = false;
}




const port = process.env.API_PORT || 3001;

let recentPlays = {}; // track the recent play gains of maps
registerStat('server.recentPlays', () => Object.keys(recentPlays).length);

async function updateRecentPlays() {
  if(!dbEnabled) return;
  
  // Grab and clear recentPlays atomically to avoid blocking
  const playsToUpdate = { ...recentPlays };
  recentPlays = {};
  
  const slugs = Object.keys(playsToUpdate).filter(slug => playsToUpdate[slug] > 0);
  if (slugs.length === 0) return;
  
  try {
    // Use bulkWrite for a single database round-trip instead of N sequential queries
    const bulkOps = slugs.map(slug => ({
      updateOne: {
        filter: { slug, accepted: true },
        update: { $inc: { plays: playsToUpdate[slug] } }
      }
    }));
    
    await MapModel.bulkWrite(bulkOps, { ordered: false });
  } catch (error) {
    console.error('[ERROR] updateRecentPlays failed:', error.message);
  }
}

setInterval(updateRecentPlays, 60000);


  app.get('/', (req, res) => {
    res.status(200).send('WorldGuessr API - by Gautam');
  });

// Current sizes of every in-memory collection that registered itself, plus
// process.memoryUsage(). Gated behind ENABLE_DEBUG_STATS=true — set the env
// var and restart to turn it back on. Default is 404 so the surface is
// closed in production.
app.get('/debug/stats', (req, res) => {
  if (process.env.ENABLE_DEBUG_STATS !== 'true') {
    return res.status(404).json({ message: 'Not found' });
  }
  const mem = process.memoryUsage();
  res.json({
    memoryMb: {
      heap: Math.round(mem.heapUsed / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      external: Math.round((mem.external || 0) / 1024 / 1024),
      arrayBuffers: Math.round((mem.arrayBuffers || 0) / 1024 / 1024),
    },
    uptimeSec: Math.round(process.uptime()),
    collections: getAllStats(),
  });
});

registerCacheBusRoute(app);

loadFolder(apiFolder);

registerStat('server.allCountriesCache', () => allCountriesCache.length);
let allCountriesCache = [{"lat":-19.879842659309492,"long":-43.670413454248006,"country":"BR"},{"lat":20.135314104756286,"long":-100.29356734837116,"country":"MX"},{"lat":33.78837496994207,"long":132.71083343539289,"country":"JP"},{"lat":40.06074748102191,"long":22.56026917707304,"country":"GR"},{"lat":51.15896475413572,"long":3.731268442956184,"country":"BE"},{"lat":-23.37329331485114,"long":-50.84053688318288,"country":"BR"},{"lat":6.716808364269906,"long":80.06299445255699,"country":"LK"},{"lat":-34.8959205019246,"long":138.63880284961732,"country":"AU"},{"lat":46.598084644501576,"long":2.6143392020731357,"country":"FR"},{"lat":43.61140651962714,"long":-72.97280304214556,"country":"US"},{"lat":40.24245072247337,"long":-77.17703276440484,"country":"US"},{"lat":48.724681302129596,"long":-1.1660591321220115,"country":"FR"},{"lat":16.747503749746688,"long":77.49598950987385,"country":"IN"},{"lat":62.354316574600325,"long":50.07729768499946,"country":"RU"},{"lat":57.75493145744408,"long":-3.911952457355695,"country":"GB"},{"lat":6.890809255286151,"long":80.5954600388597,"country":"LK"},{"lat":24.03912002891681,"long":-104.55724154156484,"country":"MX"},{"lat":7.538250279715096,"long":122.87253571338866,"country":"PH"},{"lat":38.33333838551845,"long":-85.65255971854496,"country":"US"},{"lat":19.490956234930476,"long":-99.12425237704893,"country":"MX"},{"lat":40.14866867132865,"long":-89.36513464791723,"country":"US"},{"lat":40.28630434134524,"long":-86.7353819418805,"country":"US"},{"lat":43.401995330505315,"long":-0.38877387612238756,"country":"FR"},{"lat":-28.230439186143318,"long":28.307282728397407,"country":"ZA"},{"lat":45.84009033077856,"long":-119.7000968144879,"country":"US"},{"lat":-42.809590374390055,"long":147.2981528652234,"country":"AU"},{"lat":40.88869028672737,"long":-72.68983284806949,"country":"US"},{"lat":39.29097934896099,"long":-75.63478178163903,"country":"US"},{"lat":5.312265515952477,"long":100.44163552817636,"country":"MY"},{"lat":42.602099730386264,"long":-88.70782443523038,"country":"US"}];

function updateTotalCache() {
  fetch('http://localhost:3003/allCountries.json')
  .then(response => response.json())
  .then(data => {
    if(data.ready && data.locations.length > 0) {
      allCountriesCache = data.locations;
      console.log('Updated allCountriesCache', currentDate(), allCountriesCache.length);
    }
  })
  .catch(error => {
    console.error('Error fetching allCountries.json', currentDate());
  });
}
setInterval(() => {
  updateTotalCache();
}, 60 * 1000);
setTimeout(() => {
  updateTotalCache();
}, 2000);

app.get('/allCountries.json', (req, res) => {
    // Cache for 10 minutes on Cloudflare and browser
    res.set('Cache-Control', 'public, max-age=600, s-maxage=600');
    res.json({ ready: true, locations: allCountriesCache });
});


let countryLocations = {};
registerStat('server.countryLocations', () => Object.keys(countryLocations).length);

let rawOverrides = {};

const mapOverridesDir = path.join(process.cwd(), 'data', 'mapOverrides');
const mapOverrideFiles = fs.readdirSync(mapOverridesDir).filter(file => file.endsWith('.json'));

for (const file of mapOverrideFiles) {
  rawOverrides[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(mapOverridesDir, file), 'utf8'));
}


for (const country of countries) {
  countryLocations[country] = [];
}
app.get('/countryLocations/:country', (req, res) => {
  // Cache for 10 minutes on Cloudflare and browser
  res.set('Cache-Control', 'public, max-age=600, s-maxage=600');

  if(!countryLocations[req.params.country]) {
    return res.status(404).json({ message: 'Country not found' });
  }

  if(countryLocations[req.params.country].cacheUpdate && Date.now() - countryLocations[req.params.country].cacheUpdate < 60 * 1000) {
    return res.json({ ready: countryLocations[req.params.country].locations.length>0, locations: countryLocations[req.params.country].locations });
  } else {

    if( rawOverrides[req.params.country]) {
      countryLocations[req.params.country].locations = shuffle(rawOverrides[req.params.country].customCoordinates).slice(0, 1000).map(loc => {
        const entry = {
          lat: loc.lat,
          long: loc.lng,
          country: req.params.country
        };
        if (loc.heading !== undefined && loc.heading !== null) entry.heading = loc.heading;
        if (loc.pitch !== undefined && loc.pitch !== null) entry.pitch = loc.pitch;
        if (loc.panoId) entry.panoId = loc.panoId;
        return entry;
      });

      countryLocations[req.params.country].cacheUpdate = Date.now();
      return res.json({ ready: countryLocations[req.params.country].locations.length>0, locations: countryLocations[req.params.country].locations });
    } else {
fetch('http://localhost:3003/countryLocations/'+req.params.country)
  .then(response => response.json())
  .then(data => {
    if(data.ready && data.locations.length > 0) {
      countryLocations[req.params.country].locations = data.locations;
      countryLocations[req.params.country].cacheUpdate = Date.now();
    }
    res.json(data);
  })
  .catch(error => {
    console.error('Error fetching countryLocations', error, currentDate());
    res.status(500).json({ ready: false, message: 'Error fetching countryLocations' });
  });
}
}
});

app.get('/mapLocations/:slug', async (req, res) => {
  const slug = req.params.slug;
  const map = await MapModel.findOne({ slug }).cache('mapLocations_'+slug, 10000)
  if (!map) {
    return res.status(404).json({ message: 'Map not found' });
  }
  res.json({
    ready: true,
    locations: map.data,
    name: map.name,
    official: map.official,
    maxDist: map.maxDist
  });
});

app.post('/mapPlay/:slug', async (req, res) => {
  const slug = req.params.slug;
  recentPlays[slug] = (recentPlays[slug] || 0) + 1;
  res.send('ok');
});

// Safety net: log unhandled promise rejections instead of crashing. The route
// loader above wraps every /api/* handler, so this should rarely fire — when
// it does, treat the log as a real bug and add try/catch at the source.
process.on('unhandledRejection', (reason) => {
  logCritical('UNHANDLED PROMISE REJECTION', { reason });
});
// Uncaught synchronous exceptions leave V8 in an undefined state per Node
// docs — let PM2 restart us cleanly instead of soldiering on.
process.on('uncaughtException', (err) => {
  logCritical('UNCAUGHT EXCEPTION (PROCESS WILL EXIT)', { error: err });
  process.exit(1);
});

// listen at port 3001 or process.env.API_PORT
app.listen(port, () => {
  console.log(`[INFO] API Server running on port ${port}`);
});
