import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import User from './models/User.js';
import UserStats from './models/UserStats.js';
import UserStatsService from './components/utils/userStatsService.js';
var app = express();
import cors from 'cors';
app.use(cors());

import express from 'express';
import countries from './public/countries.json' with { type: "json" };
import fs from 'fs';
import path from 'path';

import mainWorld from './public/world-main.json' with { type: "json" };
import arbitraryWorld from './data/world-arbitrary.json' with { type: "json" };
import pinpointableWorld from './data/world-pinpointable.json' with { type: "json" };

console.log("Locations in mainWorld", mainWorld.length);
console.log("Locations in arbitraryWorld", arbitraryWorld.length);
console.log("Locations in pinpointableWorld", pinpointableWorld.length);
configDotenv();

console.log('[INFO] Starting cron.js...');

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
    console.log('━'.repeat(60));

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

// ============================================================================
// COUNTRY LOCATIONS SYSTEM - Uses pre-processed JSON files with embedded country codes
// No runtime geo lookups needed - just shuffling and rotation for freshness
// ============================================================================

const SERVE_SIZE = 2000; // How many locations to serve per request
const SHUFFLE_INTERVAL = 30 * 1000; // Reshuffle every 30 seconds for freshness

// Get override countries (countries with manual map overrides)
const overrideCountries = [];
const mapOverridesDir = path.join(process.cwd(), 'public', 'mapOverrides');
const mapOverrideFiles = fs.readdirSync(mapOverridesDir).filter(file => file.endsWith('.json'));
for (const file of mapOverrideFiles) {
  overrideCountries.push(file.split('.')[0]);
}
console.log(`[INIT] Found override for countries: ${overrideCountries.join(', ')}`);

// Master pools - ALL locations grouped by country (never modified after init)
const countryPools = {};
// Served locations - rotating window into the pools
let countryLocations = {};
// Current offset per country for rotation
const countryOffsets = {};

// Fisher-Yates shuffle (in-place, fast)
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Initialize country pools from both JSON files
const initializeCountryPools = () => {
  console.log('[INIT] Building country location pools from JSON files...');
  const startTime = Date.now();

  // Combine all locations
  const allLocations = [...mainWorld, ...arbitraryWorld, ...pinpointableWorld];

  // Group by country
  for (const loc of allLocations) {
    const { lat, lng, country } = loc;
    if (!country) continue;
    if (overrideCountries.includes(country)) continue; // Skip overridden countries

    if (!countryPools[country]) {
      countryPools[country] = [];
    }
    countryPools[country].push({ lat, long: lng, country });
  }

  // Shuffle each pool and initialize offsets
  const countryCounts = {};
  for (const country of Object.keys(countryPools)) {
    shuffle(countryPools[country]);
    countryOffsets[country] = 0;
    countryCounts[country] = countryPools[country].length;
  }

  // Initialize served locations (first window)
  refreshCountryLocations();

  const duration = Date.now() - startTime;
  const totalLocs = Object.values(countryPools).reduce((sum, arr) => sum + arr.length, 0);
  const countryCount = Object.keys(countryPools).length;

  // Filter to only include countries in countries.json
  const validCountries = new Set(countries);
  const filteredCountryCounts = Object.fromEntries(
    Object.entries(countryCounts).filter(([country]) => validCountries.has(country))
  );

  // Log stats
  const sorted = Object.entries(filteredCountryCounts).sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10).map(([c, n]) => `${c}:${n}`).join(', ');
  const bottom5 = sorted.slice(-5).map(([c, n]) => `${c}:${n}`).join(', ');

  console.log('━'.repeat(60));
  console.log(`[INIT] ✅ Built pools: ${totalLocs.toLocaleString()} locations across ${countryCount} countries in ${duration}ms`);
  console.log(`[INIT] Most locations: ${top10}`);
  console.log(`[INIT] Least locations: ${bottom5}`);
  console.log('━'.repeat(60));
  console.log('[INIT] Total available locations per country (from countries.json):');
  sorted.forEach(([country, count]) => {
    console.log(`[INIT]   ${country}: ${count.toLocaleString()} locations`);
  });
  console.log('━'.repeat(60));
};

// Refresh served locations by rotating through pools
const refreshCountryLocations = () => {
  for (const country of Object.keys(countryPools)) {
    const pool = countryPools[country];
    if (pool.length === 0) continue;

    // Get current offset
    let offset = countryOffsets[country];

    // Build served array by rotating through pool
    const served = [];
    const count = Math.min(SERVE_SIZE, pool.length);

    for (let i = 0; i < count; i++) {
      served.push(pool[(offset + i) % pool.length]);
    }

    // Advance offset for next refresh (with some randomness)
    countryOffsets[country] = (offset + Math.floor(count / 4) + Math.floor(Math.random() * 50)) % pool.length;

    countryLocations[country] = served;
  }
};

// Initialize pools on startup
initializeCountryPools();

// Background shuffler - keeps locations fresh by rotating and reshuffling
const startCountryLocationShuffler = () => {
  console.log(`[SHUFFLER] Started - refreshing every ${SHUFFLE_INTERVAL / 1000}s`);

  setInterval(() => {
    const startTime = Date.now();

    // Occasionally reshuffle entire pools for variety (every 10 intervals)
    if (Math.random() < 0.1) {
      for (const pool of Object.values(countryPools)) {
        shuffle(pool);
      }
      console.log('[SHUFFLER] Full pool reshuffle');
    }

    // Refresh served locations
    refreshCountryLocations();

    const duration = Date.now() - startTime;
    console.log(`[SHUFFLER] Refreshed country locations in ${duration}ms`);
  }, SHUFFLE_INTERVAL);
};

startCountryLocationShuffler();


// ============================================================================
// ALL COUNTRIES (World Map) CACHE - Random sampling from mainWorld
// ============================================================================

let allCountriesCache = [];
let lastAllCountriesCacheUpdate = 0;
let isCacheUpdating = false;

// Background function to update allCountries cache
const updateAllCountriesCache = async () => {
  if (isCacheUpdating) {
    console.log('[CACHE] AllCountries cache update already in progress, skipping...');
    return;
  }

  isCacheUpdating = true;
  console.log('[CACHE] Starting allCountries cache update...');

  try {
    // Pick 2k locations randomly from mainWorld, prevent duplicates
    const totalLocs = mainWorld.length;
    const neededLocs = 2000;
    const indexes = new Set();

    while (indexes.size < neededLocs) {
      indexes.add(Math.floor(Math.random() * totalLocs));
    }

    const locations = [];
    for (const index of indexes) {
      try {
        const { lat, lng, country } = mainWorld[index];
        locations.push({ lat, long: lng, country });
      } catch (error) {
        locations.push({ lat, long: lng });
        console.error('Error looking up country', error, index);
      }
    }

    console.log(`[CACHE] Generated ${locations.length} locations from mainWorld which has ${totalLocs} total locations.`);
    allCountriesCache = locations;
    lastAllCountriesCacheUpdate = Date.now();
  } catch (error) {
    console.error('[CACHE] Error updating allCountries cache:', error);
  } finally {
    isCacheUpdating = false;
  }
};

// Background cache updater - runs every 60 seconds
const startAllCountriesCacheUpdater = () => {
  // Initial cache generation
  updateAllCountriesCache();

  // Set up recurring updates every 60 seconds
  setInterval(() => {
    updateAllCountriesCache();
  }, 60 * 1000);

  console.log('[CACHE] AllCountries cache updater started - updates every 60 seconds');
};

// Start the background cache updater
startAllCountriesCacheUpdater();

// Instant endpoint that just returns the latest cache
app.get('/allCountries.json', (req, res) => {
  // Always return the current cache instantly - no generation during request
  return res.json({
    ready: allCountriesCache.length > 0,
    locations: allCountriesCache.slice() // Return a copy to avoid mutation
  });
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

// Endpoint for /clueCountries.json (stub - clue locations not implemented in cron.js)
const clueLocations = []; // TODO: Implement clue locations if needed
app.get('/clueCountries.json', (req, res) => {
  if (clueLocations.length === 0) {
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