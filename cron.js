import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import User from './models/User.js';
import UserStats from './models/UserStats.js';
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

  console.log('[INFO] Starting ULTRA-FAST weekly UserStats update for ~2M users...');

  try {
    const startTime = Date.now();

    // STEP 1: Get ALL users sorted by XP and ELO (this is the key optimization!)
    console.log('[FETCH] Starting parallel user fetch...');
    const fetchStart = Date.now();
    
    const [usersByXp, usersByElo] = await Promise.all([
      User.find({ banned: { $ne: true } })
        .select('_id totalXp elo')
        .sort({ totalXp: -1 })
        .lean(),
      User.find({ banned: { $ne: true } })
        .select('_id elo')
        .sort({ elo: -1 })
        .lean()
    ]);

    const fetchTime = Date.now() - fetchStart;
    console.log(`[FETCH] ✅ Fetched ${usersByXp.length} users in ${fetchTime}ms (${(fetchTime/usersByXp.length).toFixed(2)}ms/user)`);

    // STEP 2: Create rank lookup maps (O(n) instead of O(n²))
    console.log('[RANK] Creating rank lookup maps...');
    const rankStart = Date.now();
    
    const xpRankMap = new Map();
    const eloRankMap = new Map();

    usersByXp.forEach((user, index) => {
      xpRankMap.set(user._id.toString(), index + 1);
    });

    usersByElo.forEach((user, index) => {
      eloRankMap.set(user._id.toString(), index + 1);
    });

    const rankTime = Date.now() - rankStart;
    console.log(`[RANK] ✅ Created rank maps in ${rankTime}ms (${(rankTime/usersByXp.length).toFixed(3)}ms/user)`);
    console.log(`[SETUP] Total setup time: ${fetchTime + rankTime}ms`);
    console.log('━'.repeat(60));
    console.log('[BULK] Starting bulk insert phase...');

    // STEP 3: Bulk insert with pre-calculated ranks
    const batchSize = 5000; // HUGE batches
    let totalUpdated = 0;

    for (let i = 0; i < usersByXp.length; i += batchSize) {
      const batch = usersByXp.slice(i, i + batchSize);
      
      // Create documents for bulk insert
      const documents = batch.map(user => ({
        userId: user._id,
        timestamp: new Date(),
        totalXp: user.totalXp || 0,
        xpRank: xpRankMap.get(user._id.toString()),
        elo: user.elo || 1000,
        eloRank: eloRankMap.get(user._id.toString()),
        triggerEvent: 'weekly_update',
        gameId: null
      }));

      // Bulk insert - MUCH faster than individual creates
      try {
        await UserStats.insertMany(documents, { ordered: false });
        totalUpdated += documents.length;
      } catch (error) {
        console.error(`[ERROR] Bulk insert error for batch ${i}-${i + batch.length}:`, error.message);
        // Continue with next batch
      }

      // Progress update with detailed stats
      if ((i + batchSize) % 50000 === 0 || i + batchSize >= usersByXp.length) {
        const now = Date.now();
        const elapsedMs = now - startTime;
        const processed = Math.min(i + batchSize, usersByXp.length);
        const remaining = usersByXp.length - processed;
        
        // Calculate rates and estimates
        const usersPerMs = processed / elapsedMs;
        const usersPerSec = (usersPerMs * 1000).toFixed(0);
        const msPerUser = (elapsedMs / processed).toFixed(2);
        const progressPct = ((processed / usersByXp.length) * 100).toFixed(1);
        
        // Time estimates
        const elapsedMin = (elapsedMs / 1000 / 60).toFixed(1);
        const etaMs = remaining / usersPerMs;
        const etaMin = (etaMs / 1000 / 60).toFixed(1);
        const totalEtaMin = (elapsedMs + etaMs) / 1000 / 60;
        
        console.log(`[PROGRESS] ${processed}/${usersByXp.length} users (${progressPct}%)`);
        console.log(`[SPEED] ${usersPerSec}/sec | ${msPerUser}ms/user | Batch: ${documents.length} users`);
        console.log(`[TIME] Elapsed: ${elapsedMin}m | ETA: ${etaMin}m | Total: ${totalEtaMin.toFixed(1)}m`);
        console.log(`[MEMORY] ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap used`);
        console.log('─'.repeat(60));
      }
    }

    const totalTimeMs = Date.now() - startTime;
    const totalTimeSec = (totalTimeMs / 1000).toFixed(1);
    const totalTimeMin = (totalTimeMs / 1000 / 60).toFixed(1);
    const avgRate = (totalUpdated / totalTimeMs * 1000).toFixed(0);
    const msPerUser = (totalTimeMs / totalUpdated).toFixed(2);
    
    console.log('━'.repeat(60));
    console.log(`[COMPLETE] 🚀 ULTRA-FAST update completed!`);
    console.log(`[STATS] ${totalUpdated} users updated in ${totalTimeMs}ms (${totalTimeSec}s, ${totalTimeMin}m)`);
    console.log(`[PERFORMANCE] ${avgRate} users/sec | ${msPerUser}ms/user`);
    console.log(`[EFFICIENCY] ${((totalUpdated/2000000)*100).toFixed(1)}% of 2M users processed`);
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('[ERROR] Weekly UserStats update failed:', error);
  }
};

// Set up weekly timer that runs every 7 days
const startWeeklyUserStatsTimer = () => {
  console.log('[INFO] UserStats weekly update timer started - next update in 7 days');
   updateAllUserStats();
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