// One-shot backfill: populate Map.locationsCnt for every doc that doesn't
// have it yet. Uses a server-side aggregation update so nothing travels
// over the wire — Mongo computes `$size` on the existing `data` array and
// writes it to `locationsCnt` in a single query.
//
// Usage (from project root):
//   node scripts/backfillLocationsCnt.js
//
// Idempotent — re-running is safe. It only touches docs missing the field.

import 'dotenv/config';
import mongoose from 'mongoose';
import Map from '../models/Map.js';

if (!process.env.MONGODB) {
  console.error('MONGODB env var not set');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB);
console.log('[backfill] connected');

const toFill = await Map.countDocuments({ locationsCnt: { $exists: false } });
console.log(`[backfill] ${toFill} docs missing locationsCnt`);

if (toFill === 0) {
  console.log('[backfill] nothing to do');
  await mongoose.disconnect();
  process.exit(0);
}

const start = Date.now();
const result = await Map.updateMany(
  { locationsCnt: { $exists: false } },
  [{ $set: { locationsCnt: { $size: { $ifNull: ['$data', []] } } } }]
);
const ms = Date.now() - start;
console.log(`[backfill] matched=${result.matchedCount} modified=${result.modifiedCount} in ${ms}ms`);

await mongoose.disconnect();
console.log('[backfill] done');
process.exit(0);
