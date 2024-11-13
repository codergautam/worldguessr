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

app.use(cors());
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({limit: '5mb', extended: true, parameterLimit:50000}));

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
        console.log('Updating plays for', mapSlug, 'by', recentPlays[mapSlug]);
        await map.save();
      }
    }
  }
  recentPlays = {};
}

setInterval(updateRecentPlays, 60000);

let clueLocations = [];

let countryLocations = {};

const locationCnt = 2000;
const batchSize = 10;

for (const country of countries) {
  countryLocations[country] = [];
}

const generateBalancedLocations = async () => {
  while (true) {
    const batchPromises = [];

    // Loop through each country and start generating one batch for each
    for (const country of countries) {
      for (let i = 0; i < batchSize; i++) {
      const startTime = Date.now(); // Start time for each country
      const locationPromise = new Promise((resolve, reject) => {
        findLatLongRandom({ location: country }, cityGen, lookup)
          .then((latLong) => {
            const endTime = Date.now(); // End time after fetching location
            const duration = endTime - startTime; // Duration calculation
            resolve({ country, latLong });
          })
          .catch(reject);
      });

      batchPromises.push(locationPromise);
    }
    }

    try {
      // Await the results of generating locations for all countries in parallel
      const batchResults = await Promise.all(batchPromises);

      for (const { country, latLong } of batchResults) {
        // Update country-specific locations, ensuring a max of locationCnt
        countryLocations[country].unshift(latLong);
        if (countryLocations[country].length > locationCnt) {
          countryLocations[country].pop();
        }
      }


        // log average number of locatiosn per country
        const total = Object.values(countryLocations).reduce((acc, val) => acc + val.length, 0);
        console.log('Average locations per country:', total / countries.length);

    } catch (error) {
      console.error('Error generating locations', error);
    }

    // Delay before starting the next round of generation
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

// Start generating balanced locations for all countries
generateBalancedLocations();



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
  console.log('Generating clue locations', uniqueLatLongs.size);
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

app.get('/allCountries.json', (req, res) => {
  // if (allLocations.length !== locationCnt) {
  //   // send json {ready: false}
  //   return res.json({ ready: false });
  // } else {
  //   return res.json({ ready: true, locations: allLocations });
  // }
  // send 2000 random locations, evenly distributed across countries
  const locations = [];
  const totalCountries = countries.length;
  const locsPerCountry = locationCnt / totalCountries;
  console.log(locsPerCountry);
  for (const country of countries) {
    const locs = countryLocations[country];
    const randomLocations = locs.sort(() => Math.random() - 0.5).slice(0, locsPerCountry);
    locations.push(...randomLocations);
  }
  return res.json({ ready: true, locations });

});

// Endpoint for /clueCountries.json
app.get('/clueCountries.json', (req, res) => {
  if (clueLocations.length === 0) {
    // send json {ready: false}
    return res.json({ ready: false });
  } else {
    return res.json({ ready: true, locations: clueLocations.sort(() => Math.random() - 0.5) });
  }
});

app.get('/mapLocations/:slug', async (req, res) => {
  const slug = req.params.slug;
  console.time('mapLocations '+slug);
  const map = await MapModel.findOne({ slug }).cache(10000)
  console.timeEnd('mapLocations '+slug);
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