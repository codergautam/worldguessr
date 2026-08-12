// Drives the REAL sanitizeProgression against real UserStats rows.
import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import UserStats from './models/UserStats.js';
import { sanitizeProgression } from './api/userProgression.js';
import { MIGRATION_AT } from './components/utils/ratingFlags.js';
import { normalizeConversionTable } from './components/utils/ratingConversion.js';
import fs from 'fs/promises';

await mongoose.connect(process.env.MONGODB);
const table = normalizeConversionTable(JSON.parse(await fs.readFile('data/elo-conversion-map.json', 'utf8')));
console.log('MIGRATION_AT =', MIGRATION_AT.toISOString());
console.log('table loaded  =', !!table, table ? `(old ${table.minOld}..${table.maxOld})` : '');

const u = await User.findOne({ username: process.argv[2] || 'codergautam' }, { _id: 1, username: 1, elo: 1, elo_s0: 1 }).lean();
console.log(`\nuser ${u.username}: live elo=${u.elo} (elo_s0=${u.elo_s0})\n`);

const rows = await UserStats.find({ userId: u._id }).sort({ timestamp: -1 }).limit(8).lean();
const raw = rows.map(r => ({ timestamp: r.timestamp, elo: r.elo, eloChange: r.eloChange, totalXp: r.totalXp }));

for (const cutoff of [new Date('2026-08-07T21:36:00.000Z'), MIGRATION_AT]) {
  const out = sanitizeProgression(raw, false, { table, cutoffMs: cutoff.getTime() });
  console.log(`--- cutoff ${cutoff.toISOString()} ---`);
  out.forEach((p, i) => console.log(
    `  ${new Date(p.timestamp).toISOString()}  stored=${String(raw[i].elo).padStart(6)}  ->  shown=${String(p.elo).padStart(6)}  change=${p.eloChange}`
  ));
  console.log('');
}
await mongoose.disconnect();
