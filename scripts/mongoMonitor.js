#!/usr/bin/env node
/**
 * MongoDB Health & Performance Monitor
 * 
 * Monitors:
 * - Server health and connection stats
 * - Memory usage
 * - Current operations
 * - Slow queries (queries taking > threshold ms)
 * - Unindexed queries (COLLSCAN operations)
 * 
 * Usage:
 *   node scripts/mongoMonitor.js              # Run once
 *   node scripts/mongoMonitor.js --watch      # Run continuously (every 30s)
 *   node scripts/mongoMonitor.js --watch 10   # Run continuously (every 10s)
 *   node scripts/mongoMonitor.js --profile    # Enable profiling for slow queries
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// Configuration
const SLOW_QUERY_THRESHOLD_MS = 100; // Log queries slower than this
const DEFAULT_WATCH_INTERVAL_SEC = 30;

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, label, message) {
  const timestamp = new Date().toISOString();
  console.log(`${colors.bright}[${timestamp}]${colors.reset} ${color}[${label}]${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan} ${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

async function getServerStatus(db) {
  try {
    const status = await db.admin().command({ serverStatus: 1 });
    return status;
  } catch (err) {
    log(colors.red, 'ERROR', `Failed to get server status: ${err.message}`);
    return null;
  }
}

async function getCurrentOps(db) {
  try {
    const ops = await db.admin().command({ currentOp: 1, active: true });
    return ops.inprog || [];
  } catch (err) {
    log(colors.yellow, 'WARN', `Failed to get current ops (may need admin privileges): ${err.message}`);
    return [];
  }
}

async function getProfilingStatus(db) {
  try {
    const result = await db.command({ profile: -1 });
    return result;
  } catch (err) {
    log(colors.yellow, 'WARN', `Failed to get profiling status: ${err.message}`);
    return null;
  }
}

async function enableProfiling(db, level = 1, slowMs = SLOW_QUERY_THRESHOLD_MS) {
  try {
    // level 0 = off, 1 = slow queries only, 2 = all queries
    await db.command({ profile: level, slowms: slowMs });
    log(colors.green, 'PROFILE', `Profiling enabled (level ${level}, slowms: ${slowMs}ms)`);
    return true;
  } catch (err) {
    log(colors.red, 'ERROR', `Failed to enable profiling: ${err.message}`);
    return false;
  }
}

async function getSlowQueries(db, limit = 20) {
  try {
    const profilerCollection = db.collection('system.profile');
    
    // Get recent slow queries
    const slowQueries = await profilerCollection
      .find({
        millis: { $gte: SLOW_QUERY_THRESHOLD_MS }
      })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();
    
    return slowQueries;
  } catch (err) {
    log(colors.yellow, 'WARN', `Failed to get slow queries: ${err.message}`);
    return [];
  }
}

async function getUnindexedQueries(db, limit = 20) {
  try {
    const profilerCollection = db.collection('system.profile');
    
    // Find queries that did a collection scan (COLLSCAN = no index used)
    const unindexedQueries = await profilerCollection
      .find({
        $or: [
          { 'planSummary': 'COLLSCAN' },
          { 'planSummary': { $regex: /COLLSCAN/ } }
        ]
      })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();
    
    return unindexedQueries;
  } catch (err) {
    log(colors.yellow, 'WARN', `Failed to get unindexed queries: ${err.message}`);
    return [];
  }
}

async function getCollectionStats(db) {
  try {
    const collections = await db.listCollections().toArray();
    const stats = [];
    
    for (const coll of collections) {
      if (coll.name.startsWith('system.')) continue;
      try {
        const collStats = await db.command({ collStats: coll.name });
        stats.push({
          name: coll.name,
          count: collStats.count,
          size: collStats.size,
          avgObjSize: collStats.avgObjSize,
          indexCount: collStats.nindexes,
          totalIndexSize: collStats.totalIndexSize
        });
      } catch (e) {
        // Skip collections we can't access
      }
    }
    
    return stats.sort((a, b) => b.size - a.size);
  } catch (err) {
    log(colors.yellow, 'WARN', `Failed to get collection stats: ${err.message}`);
    return [];
  }
}

async function checkIndexUsage(db) {
  try {
    const collections = await db.listCollections().toArray();
    const indexStats = [];
    
    for (const coll of collections) {
      if (coll.name.startsWith('system.')) continue;
      try {
        const stats = await db.collection(coll.name).aggregate([
          { $indexStats: {} }
        ]).toArray();
        
        for (const idx of stats) {
          indexStats.push({
            collection: coll.name,
            indexName: idx.name,
            accesses: idx.accesses?.ops || 0,
            since: idx.accesses?.since
          });
        }
      } catch (e) {
        // Skip collections we can't access
      }
    }
    
    return indexStats;
  } catch (err) {
    log(colors.yellow, 'WARN', `Failed to get index usage stats: ${err.message}`);
    return [];
  }
}

function printServerHealth(status) {
  if (!status) return;
  
  logSection('SERVER HEALTH');
  
  // Basic info
  console.log(`  Host:          ${status.host}`);
  console.log(`  Version:       ${status.version}`);
  console.log(`  Uptime:        ${formatUptime(status.uptime)}`);
  console.log(`  Process:       ${status.process}`);
  
  // Connections
  if (status.connections) {
    const conn = status.connections;
    const connPercent = ((conn.current / conn.available) * 100).toFixed(1);
    const connColor = connPercent > 80 ? colors.red : connPercent > 50 ? colors.yellow : colors.green;
    console.log(`\n  ${colors.bright}Connections:${colors.reset}`);
    console.log(`    Current:     ${conn.current}`);
    console.log(`    Available:   ${conn.available}`);
    console.log(`    Usage:       ${connColor}${connPercent}%${colors.reset}`);
  }
  
  // Memory
  if (status.mem) {
    console.log(`\n  ${colors.bright}Memory:${colors.reset}`);
    console.log(`    Resident:    ${status.mem.resident} MB`);
    console.log(`    Virtual:     ${status.mem.virtual} MB`);
  }
  
  // Operations
  if (status.opcounters) {
    const ops = status.opcounters;
    console.log(`\n  ${colors.bright}Operations (total):${colors.reset}`);
    console.log(`    Insert:      ${ops.insert?.toLocaleString()}`);
    console.log(`    Query:       ${ops.query?.toLocaleString()}`);
    console.log(`    Update:      ${ops.update?.toLocaleString()}`);
    console.log(`    Delete:      ${ops.delete?.toLocaleString()}`);
    console.log(`    GetMore:     ${ops.getmore?.toLocaleString()}`);
    console.log(`    Command:     ${ops.command?.toLocaleString()}`);
  }
  
  // Network
  if (status.network) {
    console.log(`\n  ${colors.bright}Network:${colors.reset}`);
    console.log(`    Bytes In:    ${formatBytes(status.network.bytesIn)}`);
    console.log(`    Bytes Out:   ${formatBytes(status.network.bytesOut)}`);
    console.log(`    Requests:    ${status.network.numRequests?.toLocaleString()}`);
  }
}

function printCurrentOps(ops) {
  logSection('ACTIVE OPERATIONS');
  
  const longRunningOps = ops.filter(op => 
    op.secs_running > 5 && 
    op.op !== 'none' &&
    !op.desc?.includes('conn')
  );
  
  if (longRunningOps.length === 0) {
    log(colors.green, 'OK', 'No long-running operations (>5s)');
    return;
  }
  
  log(colors.yellow, 'WARN', `${longRunningOps.length} long-running operations found:`);
  
  for (const op of longRunningOps) {
    console.log(`\n  ${colors.yellow}Operation:${colors.reset} ${op.op}`);
    console.log(`    Running for: ${op.secs_running}s`);
    console.log(`    Namespace:   ${op.ns || 'N/A'}`);
    if (op.command) {
      console.log(`    Command:     ${JSON.stringify(op.command).substring(0, 100)}...`);
    }
    if (op.planSummary) {
      console.log(`    Plan:        ${op.planSummary}`);
    }
  }
}

function printSlowQueries(queries) {
  logSection(`SLOW QUERIES (>${SLOW_QUERY_THRESHOLD_MS}ms)`);
  
  if (queries.length === 0) {
    log(colors.green, 'OK', 'No slow queries found in profiler');
    console.log(`  ${colors.yellow}Note: Run with --profile to enable profiling${colors.reset}`);
    return;
  }
  
  log(colors.yellow, 'WARN', `${queries.length} slow queries found:`);
  
  for (const q of queries.slice(0, 10)) {
    const timeColor = q.millis > 1000 ? colors.red : colors.yellow;
    console.log(`\n  ${timeColor}[${q.millis}ms]${colors.reset} ${q.ns}`);
    console.log(`    Time:     ${q.ts}`);
    console.log(`    Op:       ${q.op}`);
    if (q.command) {
      const cmdStr = JSON.stringify(q.command);
      console.log(`    Command:  ${cmdStr.substring(0, 150)}${cmdStr.length > 150 ? '...' : ''}`);
    }
    if (q.planSummary) {
      const planColor = q.planSummary.includes('COLLSCAN') ? colors.red : colors.green;
      console.log(`    Plan:     ${planColor}${q.planSummary}${colors.reset}`);
    }
    if (q.docsExamined !== undefined) {
      console.log(`    Docs examined: ${q.docsExamined}, returned: ${q.nreturned || 0}`);
    }
  }
}

function printUnindexedQueries(queries) {
  logSection('UNINDEXED QUERIES (COLLSCAN)');
  
  if (queries.length === 0) {
    log(colors.green, 'OK', 'No unindexed queries found in profiler');
    return;
  }
  
  log(colors.red, 'ALERT', `${queries.length} unindexed queries found (full collection scans):`);
  
  // Group by namespace
  const byNs = {};
  for (const q of queries) {
    if (!byNs[q.ns]) byNs[q.ns] = [];
    byNs[q.ns].push(q);
  }
  
  for (const [ns, nsQueries] of Object.entries(byNs)) {
    console.log(`\n  ${colors.red}Collection: ${ns}${colors.reset} (${nsQueries.length} queries)`);
    
    for (const q of nsQueries.slice(0, 5)) {
      console.log(`    [${q.millis}ms] ${q.op}`);
      if (q.command?.filter) {
        console.log(`      Filter: ${JSON.stringify(q.command.filter).substring(0, 100)}`);
      } else if (q.query) {
        console.log(`      Query: ${JSON.stringify(q.query).substring(0, 100)}`);
      }
    }
  }
  
  console.log(`\n  ${colors.yellow}Recommendation: Add indexes for frequently queried fields${colors.reset}`);
}

function printCollectionStats(stats) {
  logSection('COLLECTION STATISTICS');
  
  if (stats.length === 0) {
    log(colors.yellow, 'WARN', 'No collection stats available');
    return;
  }
  
  console.log(`  ${'Collection'.padEnd(25)} ${'Docs'.padStart(12)} ${'Size'.padStart(12)} ${'Indexes'.padStart(8)}`);
  console.log(`  ${'-'.repeat(25)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(8)}`);
  
  for (const coll of stats.slice(0, 15)) {
    console.log(`  ${coll.name.padEnd(25)} ${coll.count?.toLocaleString().padStart(12)} ${formatBytes(coll.size).padStart(12)} ${coll.indexCount?.toString().padStart(8)}`);
  }
}

function printUnusedIndexes(indexStats) {
  logSection('INDEX USAGE ANALYSIS');
  
  if (indexStats.length === 0) {
    log(colors.yellow, 'WARN', 'No index stats available');
    return;
  }
  
  const unusedIndexes = indexStats.filter(idx => 
    idx.accesses === 0 && 
    idx.indexName !== '_id_'
  );
  
  if (unusedIndexes.length === 0) {
    log(colors.green, 'OK', 'All indexes have been used');
    return;
  }
  
  log(colors.yellow, 'WARN', `${unusedIndexes.length} potentially unused indexes:`);
  
  for (const idx of unusedIndexes) {
    console.log(`  ${colors.yellow}${idx.collection}.${idx.indexName}${colors.reset}`);
    console.log(`    Accesses: 0 since ${idx.since}`);
  }
  
  console.log(`\n  ${colors.yellow}Note: Index may be unused if server recently restarted${colors.reset}`);
}

async function runMonitor(enableProfile = false) {
  const mongoUri = process.env.MONGODB || process.env.MONGODB_URI || process.env.MONGO_URL;
  
  if (!mongoUri) {
    log(colors.red, 'ERROR', 'No MongoDB connection string found!');
    console.log('  Set MONGODB, MONGODB_URI, or MONGO_URL in your .env file');
    process.exit(1);
  }
  
  log(colors.blue, 'CONNECT', 'Connecting to MongoDB...');
  
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    log(colors.green, 'CONNECT', 'Connected successfully');
    
    // Enable profiling if requested
    if (enableProfile) {
      const profileStatus = await getProfilingStatus(db);
      if (profileStatus && profileStatus.was === 0) {
        await enableProfiling(db, 1, SLOW_QUERY_THRESHOLD_MS);
      } else if (profileStatus) {
        log(colors.blue, 'PROFILE', `Profiling already enabled (level ${profileStatus.was}, slowms: ${profileStatus.slowms}ms)`);
      }
    }
    
    // Gather all data
    const [serverStatus, currentOps, slowQueries, unindexedQueries, collectionStats, indexStats] = await Promise.all([
      getServerStatus(db),
      getCurrentOps(db),
      getSlowQueries(db),
      getUnindexedQueries(db),
      getCollectionStats(db),
      checkIndexUsage(db)
    ]);
    
    // Print reports
    printServerHealth(serverStatus);
    printCurrentOps(currentOps);
    printCollectionStats(collectionStats);
    printSlowQueries(slowQueries);
    printUnindexedQueries(unindexedQueries);
    printUnusedIndexes(indexStats);
    
    logSection('MONITOR COMPLETE');
    
  } catch (err) {
    log(colors.red, 'ERROR', `Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch');
  const enableProfile = args.includes('--profile');
  
  // Get watch interval
  let watchInterval = DEFAULT_WATCH_INTERVAL_SEC;
  const watchIdx = args.indexOf('--watch');
  if (watchIdx !== -1 && args[watchIdx + 1] && !args[watchIdx + 1].startsWith('--')) {
    watchInterval = parseInt(args[watchIdx + 1], 10) || DEFAULT_WATCH_INTERVAL_SEC;
  }
  
  console.log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║         MongoDB Health & Performance Monitor           ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  if (watchMode) {
    log(colors.blue, 'MODE', `Watch mode enabled (interval: ${watchInterval}s)`);
    log(colors.blue, 'INFO', 'Press Ctrl+C to stop\n');
    
    // Run immediately, then on interval
    await runMonitor(enableProfile);
    
    setInterval(async () => {
      console.clear();
      await runMonitor(false); // Don't re-enable profiling on each run
    }, watchInterval * 1000);
  } else {
    await runMonitor(enableProfile);
    await mongoose.disconnect();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
