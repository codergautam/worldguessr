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
import lookup from "coordinate_to_country"
const __dirname = import.meta.dirname;

config();

import mongoose from 'mongoose';
import cachegoose from 'recachegoose';

cachegoose(mongoose, {
  engine: "memory"
});

import Clue from './models/Clue.js';
import findLatLongRandom from './components/findLatLongServer.js';
import path from 'path';
import MapModel from './models/Map.js';
import bodyParser from 'body-parser';
import countries from './public/countries.json' with { type: "json" };

// colors
import colors from 'colors';

// express
import express from 'express';
var app = express();

// disable cors
import cors from 'cors';
import cityGen from './serverUtils/cityGen.js';
import User from './models/User.js';
function currentDate() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
}
app.use(cors());
app.use(bodyParser.json({limit: '30mb'}));
app.use(bodyParser.urlencoded({limit: '30mb', extended: true, parameterLimit: 50000}));

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
      app.all(webPath, ( req, res ) => {
        module.default(req, res);
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

async function updateRecentPlays() {
  if(!dbEnabled) return;
  for(const mapSlug of Object.keys(recentPlays)) {
    if(recentPlays[mapSlug] > 0) {

      const map = await MapModel.findOne({ slug: mapSlug });
      if(map && map.accepted) {
        map.plays += recentPlays[mapSlug];
        await map.save();
      }
    }
  }
  recentPlays = {};
}

setInterval(updateRecentPlays, 60000);

let clueLocations = [];


// clue locations
// get all clues
const generateClueLocations = async () => {
  if(!dbEnabled) return;
  const clues = await Clue.find({});
  // remove duplicate latlong
  const uniqueClues = [];
  let uniqueLatLongs = new Set();
  for(const clue of clues) {
    const latLong = `${clue.lat},${clue.lng}`;
    if(!uniqueLatLongs.has(latLong)) {
      uniqueLatLongs.add(latLong);
      uniqueClues.push(clue);
    }
  }

  // shuffle
  uniqueLatLongs = new Set([...uniqueLatLongs].sort(() => Math.random() - 0.5));
  // populate clueLocations
  // ex format: {"lat":17.90240017665545,"long":102.7868538747363,"country":"TH"}
  clueLocations = [];
  for(const clue of uniqueClues) {
    const country = lookup(clue.lat, clue.lng, true)[0];
    clueLocations.push({
      lat: clue.lat,
      lng: clue.lng,
      country
    });
  }
}

generateClueLocations();
setTimeout(() => {
  generateClueLocations();
}, 20000);

  app.get('/', (req, res) => {
    res.status(200).send('WorldGuessr API - by Gautam');
  });

loadFolder(apiFolder);

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
    console.error('Error fetching allCountries.json', error, currentDate());
  });
}
setInterval(() => {
  updateTotalCache();
}, 60 * 1000);
setTimeout(() => {
  updateTotalCache();
}, 2000);

app.get('/allCountries.json', (req, res) => {

    res.json({ ready: true, locations: allCountriesCache });

});


let countryLocations = {};

let rawOverrides = {};

const mapOverridesDir = path.join(process.cwd(), 'public', 'mapOverrides');
const mapOverrideFiles = fs.readdirSync(mapOverridesDir).filter(file => file.endsWith('.json'));

for (const file of mapOverrideFiles) {
  rawOverrides[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(mapOverridesDir, file), 'utf8'));
}


for (const country of countries) {
  countryLocations[country] = [];
}
app.get('/countryLocations/:country', (req, res) => {


  if(!countryLocations[req.params.country]) {
    return res.status(404).json({ message: 'Country not found' });
  }

  if(countryLocations[req.params.country].cacheUpdate && Date.now() - countryLocations[req.params.country].cacheUpdate < 60 * 1000) {

    return res.json({ ready: countryLocations[req.params.country].locations.length>0, locations: countryLocations[req.params.country].locations });
  } else {

    if( rawOverrides[req.params.country]) {
      countryLocations[req.params.country].locations = rawOverrides[req.params.country].customCoordinates.sort(() => Math.random() - 0.5).slice(0, 1000).map(loc => {
        return {
          lat: loc.lat,
          long: loc.lng,
          country: req.params.country
        }
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
  const map = await MapModel.findOne({ slug }).cache(10000)
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

// listen at port 3001 or process.env.API_PORT
app.listen(port, () => {
  console.log(`[INFO] API Server running on port ${port}`);
});
