import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import User from './models/User.js';
import UserStatsService from './components/utils/userStatsService.js';
var app = express();
import cors from 'cors';
app.use(cors());
import lookup from "coordinate_to_country"

import express from 'express';
import countries from './public/countries.json' with { type: "json" };
import findLatLongRandom from './components/findLatLongServer.js';
import cityGen from './serverUtils/cityGen.js';
import fs from 'fs';
import path from 'path';

import mainWorld from './public/world-main.json' with { type: "json" };
configDotenv();

let dbEnabled = false;
if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set");
  dbEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
      dbEnabled = true;
    } catch (error) {
      console.error('[ERROR] Database connection failed!', error.message);
      console.log(error);
      dbEnabled = false;
    }
  }
}

// Weekly UserStats update functionality
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const updateAllUserStats = async () => {
  if (!dbEnabled) {
    console.log('[SKIP] UserStats update skipped - database not connected');
    return;
  }

  console.log('[INFO] Starting weekly UserStats update...');
  
  try {
    const batchSize = 100;
    let skip = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    while (true) {
      const users = await User.find({ banned: { $ne: true } })
        .select('_id username totalXp elo')
        .skip(skip)
        .limit(batchSize)
        .lean();

      if (users.length === 0) {
        break; // No more users
      }

      console.log(`[INFO] Processing UserStats batch: ${users.length} users (offset ${skip})`);

      for (const user of users) {
        try {
          const result = await UserStatsService.recordGameStats(user._id, null, {
            triggerEvent: 'weekly_update'
          });

          if (result) {
            totalUpdated++;
          } else {
            totalErrors++;
          }
        } catch (error) {
          console.error(`[ERROR] Failed to update UserStats for user ${user.username || user._id}:`, error.message);
          totalErrors++;
        }
      }

      skip += batchSize;
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[INFO] Weekly UserStats update completed: ${totalUpdated} updated, ${totalErrors} errors`);
    
  } catch (error) {
    console.error('[ERROR] Weekly UserStats update failed:', error);
  }
};

// Set up weekly timer that runs every 7 days
const startWeeklyUserStatsTimer = () => {
  console.log('[INFO] UserStats weekly update timer started - next update in 7 days');
  
  const runUpdateAndRestart = async () => {
    await updateAllUserStats();
    // Restart the timer for another 7 days
    setTimeout(runUpdateAndRestart, WEEK_IN_MS);
  };
  
  // Start the timer
  setTimeout(runUpdateAndRestart, WEEK_IN_MS);
};

// Start the weekly timer
startWeeklyUserStatsTimer();

let countryLocations = {};
const locationCnt = 2000;
const batchSize = 10;

const overrideCountries = [];
// get all file names of files in ./public/mapOverrides
const mapOverridesDir = path.join(process.cwd(), 'public', 'mapOverrides');
const mapOverrideFiles = fs.readdirSync(mapOverridesDir).filter(file => file.endsWith('.json'));

for (const file of mapOverrideFiles) {
  overrideCountries.push(file.split('.')[0]);
}

console.log(`Found override for countries: ${overrideCountries.join(', ')}`);

for (const country of countries) {
  if(overrideCountries.includes(country)) {
    // Skip countries with manual overrides
    console.log(`Skipping ${country} due to manual override`);
    continue;
  }
  countryLocations[country] = [];
}

const generateBalancedLocations = async () => {
  while (true) {
    const batchPromises = [];

    // Loop through each country and start generating one batch for each
    for (const country of countries) {
      if(!countryLocations[country]) {
        continue;
      }

      for (let i = 0; i < batchSize; i++) {
      const startTime = Date.now(); // Start time for each country
      const locationPromise = new Promise((resolve, reject) => {
        findLatLongRandom({ location: country }, cityGen, lookup)
          .then((latLong) => {
            const endTime = Date.now(); // End time after fetching location
            const duration = endTime - startTime; // Duration calculation

            resolve({ country: latLong.country, latLong });

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
        try {
          if(countryLocations[country]) {
        countryLocations[country].unshift(latLong);
        if (countryLocations[country].length > locationCnt) {
          countryLocations[country].pop();
        }
      }
      } catch (error) {
        console.error('Error updating country locations', error, country, latLong);
      }
      }



    } catch (error) {
      console.error('Error generating locations', error);
    }

    // Delay before starting the next round of generation
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

// Start generating balanced locations for all countries
generateBalancedLocations();


let allCountriesCache = [];
let lastAllCountriesCacheUpdate = 0;

app.get('/allCountries.json', (req, res) => {
  if(Date.now() - lastAllCountriesCacheUpdate > 60 * 1000) {
    // old world
    // let locations = [];
    // const totalCountries = countries.length;
    // const locsPerCountry = locationCnt / totalCountries;
    // for (const country of countries) {
    //   const locs = countryLocations[country];
    //   const randomLocations = locs.sort(() => Math.random() - 0.5).slice(0, locsPerCountry);
    //   locations.push(...randomLocations);
    // }
    // locations = locations.sort(() => Math.random() - 0.5);
    // allCountriesCache = locations;
    // lastAllCountriesCacheUpdate = Date.now();
    // return res.json({ ready: locations.length>0, locations });

    // new world
    // pick 2k locations randomly from mainWorld, calculate country based on lat/long
    // prevent duplicates
    const totalLocs = mainWorld.length;
    const neededLocs = 2000;
    const indexes = new Set();
    while (indexes.size < neededLocs) {
      indexes.add(Math.floor(Math.random() * totalLocs));
    }
    const locations = [];
    for (const index of indexes) {
      try {
      const { lat, lng } = mainWorld[index];
      const country = lookup(lat, lng, true)[0];
      locations.push({ lat, long: lng, country });
      } catch (error) {
        locations.push({ lat, long: lng });
        console.error('Error looking up country', error, index);
      }
    }

    allCountriesCache = locations;

    lastAllCountriesCacheUpdate = Date.now();
    return res.json({ ready: locations.length>0, locations });
  } else {
    return res.json({ ready: allCountriesCache.length>0, locations: allCountriesCache });
  }
});

app.get('/countryLocations/:country', (req, res) => {
  const country = req.params.country;
  if (!countryLocations[country]) {
    return res.status(404).json({ message: 'Country not found' });
  }
  return res.json({ ready:
    countryLocations[country].length > 0,
     locations: countryLocations[country] });
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


// listen 3003
app.get('/', (req, res) => {
  res.status(200).send('WorldGuessr Utils');
});

app.listen(3003, () => {
  console.log('WorldGuessr Utils listening on port 3003');
});