#!/usr/bin/env node
/**
 * Repair: raise every account whose elo sits at or below 0 to the MIN_ELO
 * floor (1).
 *
 * Why: 0 is falsy in JS, and the ranked pipeline gates on truthy elo —
 * matchmaking delta wiring (ws.js `p1.elo && p2.elo`), elo application and
 * the ranked save (Game.js `p1OldElo && p2OldElo`), and bot backfill
 * (`!player.elo`). An account parked at exactly 0 therefore plays ranked
 * duels that persist NOTHING for either side: no elo change, no game
 * history, no XP, no W/L counters. (First confirmed case: "lowestelo",
 * 2026-07-19.) Negative elo was reachable too — updateElo had no floor —
 * and while negative values are truthy and slipped through the gates, they
 * violate the same invariant.
 *
 * The floor is now enforced at every write path (eloSystem.js updateElo,
 * Game.js delta application, eloRank.js setElo, Player.js setElo, User
 * schema min). This script repairs the documents written before that.
 *
 * Idempotent: matches { elo: { $lte: 0 } } only, so a second run finds
 * nothing to do.
 *
 * Run:  node scripts/fixEloFloor.js            (dry run — list affected, no writes)
 *       node scripts/fixEloFloor.js --apply    (write repairs)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { MIN_ELO } from '../components/utils/eloSystem.js';

async function run({ apply }) {
  const affected = await User.find({ elo: { $lte: 0 } })
    .select('_id username elo duels_played duels_wins duels_losses')
    .lean();

  if (affected.length === 0) {
    console.log('No accounts with elo <= 0. Nothing to do.');
    return { affected: 0, applied: false };
  }

  console.log(`Found ${affected.length} account(s) with elo <= 0:\n`);
  for (const u of affected) {
    console.log(
      `  ${u.username ?? '(unnamed)'} [${u._id}]: elo=${u.elo}` +
      ` (played=${u.duels_played ?? 0}, W=${u.duels_wins ?? 0}, L=${u.duels_losses ?? 0})` +
      ` -> ${MIN_ELO}`
    );
  }

  if (!apply) {
    console.log('\nDry run — no writes. Re-run with --apply to repair.');
    return { affected: affected.length, applied: false };
  }

  const res = await User.updateMany(
    { elo: { $lte: 0 } },
    { $set: { elo: MIN_ELO } },
  );
  console.log(`\nRepaired ${res.modifiedCount} account(s) to elo=${MIN_ELO}.`);
  return { affected: affected.length, applied: true };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }
  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE)' : ' (dry run — no writes)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  await run({ apply });
  await mongoose.disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
