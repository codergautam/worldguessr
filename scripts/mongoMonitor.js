#!/usr/bin/env node
/**
 * MongoDB Real-Time Query Monitor
 * 
 * Shows every query as it happens with:
 * - Execution time (ms)
 * - Whether it used an index or did a COLLSCAN
 * - Query details
 * 
 * Usage:
 *   node scripts/mongoMonitor.js
 * 
 * Press Ctrl+C to stop (profiling will be restored to original level)
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

let originalProfilingLevel = 0;
let originalSlowMs = 100;
let db = null;
let isCleaningUp = false;

function formatMs(ms) {
  if (ms < 10) return `${c.green}${ms}ms${c.reset}`;
  if (ms < 100) return `${c.yellow}${ms}ms${c.reset}`;
  if (ms < 1000) return `${c.red}${ms}ms${c.reset}`;
  return `${c.bgRed}${c.white}${ms}ms${c.reset}`;
}

function formatPlan(planSummary) {
  if (!planSummary) return `${c.dim}unknown${c.reset}`;
  if (planSummary.includes('COLLSCAN')) {
    return `${c.bgRed}${c.white} COLLSCAN ${c.reset} ${c.red}NO INDEX${c.reset}`;
  }
  if (planSummary.includes('IXSCAN')) {
    return `${c.bgGreen}${c.white} IXSCAN ${c.reset} ${c.green}indexed${c.reset}`;
  }
  if (planSummary.includes('IDHACK')) {
    return `${c.bgGreen}${c.white} IDHACK ${c.reset} ${c.green}_id lookup${c.reset}`;
  }
  return `${c.cyan}${planSummary}${c.reset}`;
}

function formatOp(op) {
  const colors = {
    query: c.blue,
    find: c.blue,
    insert: c.green,
    update: c.yellow,
    delete: c.red,
    remove: c.red,
    command: c.magenta,
    getmore: c.dim,
    aggregate: c.cyan,
  };
  return `${colors[op] || c.white}${op.toUpperCase().padEnd(10)}${c.reset}`;
}

function truncate(str, len = 80) {
  if (!str) return '';
  const s = typeof str === 'string' ? str : JSON.stringify(str);
  return s.length > len ? s.substring(0, len) + '...' : s;
}

function formatQuery(entry) {
  const timestamp = new Date(entry.ts).toISOString().split('T')[1].replace('Z', '');
  const ns = entry.ns || 'unknown';
  const collection = ns.split('.').slice(1).join('.') || ns;
  const op = entry.op || 'unknown';
  const ms = entry.millis ?? 0;
  const plan = entry.planSummary || '';
  
  // Get query/command details
  let details = '';
  if (entry.command) {
    if (entry.command.filter) {
      details = `filter: ${truncate(entry.command.filter, 60)}`;
    } else if (entry.command.find) {
      details = `find: ${entry.command.find}`;
      if (entry.command.filter) details += ` filter: ${truncate(entry.command.filter, 40)}`;
    } else if (entry.command.aggregate) {
      details = `aggregate: ${entry.command.aggregate}`;
    } else if (entry.command.update) {
      details = `update: ${entry.command.update}`;
    } else if (entry.command.insert) {
      details = `insert: ${entry.command.insert}`;
    } else {
      const cmdName = Object.keys(entry.command)[0];
      details = `${cmdName}: ${truncate(entry.command[cmdName], 50)}`;
    }
  } else if (entry.query) {
    details = `query: ${truncate(entry.query, 60)}`;
  }

  // Docs examined vs returned (efficiency indicator)
  let efficiency = '';
  if (entry.docsExamined !== undefined && entry.nreturned !== undefined) {
    const ratio = entry.docsExamined > 0 ? (entry.nreturned / entry.docsExamined * 100).toFixed(0) : 100;
    if (entry.docsExamined > entry.nreturned * 10 && entry.docsExamined > 100) {
      efficiency = ` ${c.red}[examined ${entry.docsExamined} → returned ${entry.nreturned}]${c.reset}`;
    }
  }

  console.log(
    `${c.dim}${timestamp}${c.reset} ` +
    `${formatMs(ms).padEnd(20)} ` +
    `${formatOp(op)} ` +
    `${c.bright}${collection.padEnd(20)}${c.reset} ` +
    `${formatPlan(plan).padEnd(40)} ` +
    `${c.dim}${details}${c.reset}${efficiency}`
  );
}

async function getProfilingStatus() {
  try {
    const result = await db.command({ profile: -1 });
    return { level: result.was, slowMs: result.slowms };
  } catch (err) {
    console.error(`${c.red}Failed to get profiling status: ${err.message}${c.reset}`);
    return { level: 0, slowMs: 100 };
  }
}

async function setProfilingLevel(level, slowMs = 0) {
  try {
    await db.command({ profile: level, slowms: slowMs });
    return true;
  } catch (err) {
    console.error(`${c.red}Failed to set profiling level: ${err.message}${c.reset}`);
    return false;
  }
}

async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  
  console.log(`\n${c.yellow}Cleaning up...${c.reset}`);
  
  if (db) {
    // Restore original profiling level
    console.log(`${c.blue}Restoring profiling level to ${originalProfilingLevel} (slowms: ${originalSlowMs})${c.reset}`);
    await setProfilingLevel(originalProfilingLevel, originalSlowMs);
  }
  
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  
  console.log(`${c.green}Cleanup complete. Goodbye!${c.reset}`);
  process.exit(0);
}

// Handle various exit signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);
process.on('uncaughtException', async (err) => {
  console.error(`${c.red}Uncaught exception: ${err.message}${c.reset}`);
  await cleanup();
});

async function tailProfiler() {
  const profilerCollection = db.collection('system.profile');
  
  // Get the latest timestamp to start tailing from
  const latest = await profilerCollection.findOne({}, { sort: { ts: -1 } });
  let lastTs = latest?.ts || new Date();
  
  console.log(`${c.green}Monitoring queries in real-time...${c.reset}`);
  console.log(`${c.dim}Press Ctrl+C to stop${c.reset}\n`);
  
  // Print header
  console.log(
    `${c.bright}${'TIME'.padEnd(15)} ` +
    `${'MS'.padEnd(8)} ` +
    `${'OP'.padEnd(10)} ` +
    `${'COLLECTION'.padEnd(20)} ` +
    `${'INDEX STATUS'.padEnd(30)} ` +
    `DETAILS${c.reset}`
  );
  console.log(`${c.dim}${'-'.repeat(120)}${c.reset}`);
  
  // Poll for new entries
  while (true) {
    try {
      const newEntries = await profilerCollection
        .find({ ts: { $gt: lastTs } })
        .sort({ ts: 1 })
        .toArray();
      
      for (const entry of newEntries) {
        // Skip the profiler's own queries
        if (entry.ns?.includes('system.profile')) continue;
        
        formatQuery(entry);
        lastTs = entry.ts;
      }
      
      // Small delay to prevent hammering the database
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      if (err.message.includes('interrupted')) break;
      console.error(`${c.red}Error polling profiler: ${err.message}${c.reset}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  const mongoUri = process.env.MONGODB || process.env.MONGODB_URI || process.env.MONGO_URL;
  
  if (!mongoUri) {
    console.error(`${c.red}No MongoDB connection string found!${c.reset}`);
    console.log('Set MONGODB, MONGODB_URI, or MONGO_URL in your .env file');
    process.exit(1);
  }
  
  console.log(`\n${c.bright}${c.cyan}╔═══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bright}${c.cyan}║         MongoDB Real-Time Query Monitor                   ║${c.reset}`);
  console.log(`${c.bright}${c.cyan}╚═══════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  console.log(`${c.blue}Connecting to MongoDB...${c.reset}`);
  
  try {
    await mongoose.connect(mongoUri);
    db = mongoose.connection.db;
    console.log(`${c.green}Connected!${c.reset}\n`);
    
    // Save original profiling level
    const originalStatus = await getProfilingStatus();
    originalProfilingLevel = originalStatus.level;
    originalSlowMs = originalStatus.slowMs;
    
    console.log(`${c.blue}Original profiling: level ${originalProfilingLevel}, slowms ${originalSlowMs}${c.reset}`);
    
    // Enable full profiling (level 2 = all queries)
    console.log(`${c.yellow}Enabling full profiling (level 2, slowms 0)...${c.reset}`);
    const success = await setProfilingLevel(2, 0);
    
    if (!success) {
      console.error(`${c.red}Failed to enable profiling. Make sure you have admin privileges.${c.reset}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log(`${c.green}Profiling enabled!${c.reset}`);
    console.log(`${c.yellow}NOTE: Profiling will be restored to original level on exit.${c.reset}\n`);
    
    // Start tailing the profiler
    await tailProfiler();
    
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    await cleanup();
  }
}

main();
