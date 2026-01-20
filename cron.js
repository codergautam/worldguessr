import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import User from './models/User.js';
import UserStats from './models/UserStats.js';
import DailyLeaderboard from './models/DailyLeaderboard.js';
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

// ============================================================================
// DAILY LEADERBOARD PRE-COMPUTATION
// Computes and caches top 50k users every 15 minutes instead of on-demand
// ============================================================================

const LEADERBOARD_UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes
const LEADERBOARD_TTL_DAYS = 30; // Keep leaderboards for 30 days

const computeDailyLeaderboards = async () => {
  if (!dbEnabled) {
    console.log('[SKIP] Daily leaderboard computation skipped - database not connected');
    return;
  }

  console.log('[LEADERBOARD] Starting daily leaderboard computation...');
  const startTime = Date.now();

  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    // Get start of day (midnight UTC) for consistent date keys
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);

    // Compute both XP and ELO leaderboards in parallel
    const [xpLeaderboard, eloLeaderboard] = await Promise.all([
      computeLeaderboardForMode('xp', dayAgo),
      computeLeaderboardForMode('elo', dayAgo)
    ]);

    // Save both leaderboards to database
    const expiresAt = new Date(now.getTime() + (LEADERBOARD_TTL_DAYS * 24 * 60 * 60 * 1000));

    await Promise.all([
      DailyLeaderboard.findOneAndUpdate(
        { date: todayMidnight, mode: 'xp' },
        {
          date: todayMidnight,
          mode: 'xp',
          leaderboard: xpLeaderboard.leaderboard,
          totalActiveUsers: xpLeaderboard.totalActiveUsers,
          computedAt: now,
          expiresAt: expiresAt
        },
        { upsert: true, new: true }
      ),
      DailyLeaderboard.findOneAndUpdate(
        { date: todayMidnight, mode: 'elo' },
        {
          date: todayMidnight,
          mode: 'elo',
          leaderboard: eloLeaderboard.leaderboard,
          totalActiveUsers: eloLeaderboard.totalActiveUsers,
          computedAt: now,
          expiresAt: expiresAt
        },
        { upsert: true, new: true }
      )
    ]);

    const duration = Date.now() - startTime;
    console.log(`[LEADERBOARD] ✅ Daily leaderboards computed in ${duration}ms`);
    console.log(`[LEADERBOARD] XP: ${xpLeaderboard.leaderboard.length} users, ${xpLeaderboard.totalActiveUsers} total active`);
    console.log(`[LEADERBOARD] ELO: ${eloLeaderboard.leaderboard.length} users, ${eloLeaderboard.totalActiveUsers} total active`);
  } catch (error) {
    console.error('[LEADERBOARD] Error computing daily leaderboards:', error);
  }
};

// Helper function to compute leaderboard for a specific mode (xp or elo)
const computeLeaderboardForMode = async (mode, dayAgo) => {
  const field = mode === 'xp' ? 'totalXp' : 'elo';

  // Optimized aggregation pipeline with query timeout
  const pipeline = [
    {
      $match: {
        timestamp: { $gte: dayAgo }
      }
    },
    { $sort: { userId: 1, timestamp: -1 } },
    {
      $group: {
        _id: '$userId',
        latestTotalXp: { $first: '$totalXp' },
        latestElo: { $first: '$elo' },
        oldestTotalXp: { $last: '$totalXp' },
        oldestElo: { $last: '$elo' }
      }
    },
    {
      $project: {
        userId: '$_id',
        xpDelta: { $subtract: ['$latestTotalXp', '$oldestTotalXp'] },
        eloDelta: { $subtract: ['$latestElo', '$oldestElo'] },
        currentXp: '$latestTotalXp',
        currentElo: '$latestElo'
      }
    },
    {
      $match: {
        [mode === 'xp' ? 'xpDelta' : 'eloDelta']: { $gt: 0 }
      }
    },
    {
      $sort: {
        [mode === 'xp' ? 'xpDelta' : 'eloDelta']: -1
      }
    },
    { $limit: 50000 }
  ];

  // Execute aggregation with maxTimeMS to prevent hanging
  const userDeltas = await UserStats.aggregate(pipeline).option({ maxTimeMS: 30000 }); // 30 second timeout

  const totalActiveUsers = userDeltas.length;

  // Get user details for top 50k
  const userIds = userDeltas.map(u => u.userId);
  const users = await User.find({
    _id: { $in: userIds }
  }).select('_id username countryCode supporter').lean().maxTimeMS(30000);

  // Create user lookup map
  const userMap = new Map();
  users.forEach(user => {
    userMap.set(user._id.toString(), user);
  });

  // Build final leaderboard with user details
  const leaderboard = userDeltas.map((delta, index) => {
    const user = userMap.get(delta.userId.toString());
    return {
      userId: delta.userId.toString(),
      username: user?.username || 'Unknown',
      delta: mode === 'xp' ? delta.xpDelta : delta.eloDelta,
      currentValue: mode === 'xp' ? delta.currentXp : delta.currentElo,
      rank: index + 1,
      countryCode: user?.countryCode || null,
      supporter: user?.supporter || false
    };
  });

  return { leaderboard, totalActiveUsers };
};

// Start the daily leaderboard computation timer
const startDailyLeaderboardTimer = () => {
  console.log(`[LEADERBOARD] Daily leaderboard computation timer started - updates every ${LEADERBOARD_UPDATE_INTERVAL / 1000 / 60} minutes`);

  // Run immediately on startup
  computeDailyLeaderboards();

  // Then run every 15 minutes
  setInterval(computeDailyLeaderboards, LEADERBOARD_UPDATE_INTERVAL);
};

// Start the timer
startDailyLeaderboardTimer();

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

    // Shuffle the served locations for randomness
    shuffle(served);

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