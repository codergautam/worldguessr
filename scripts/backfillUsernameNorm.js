// One-shot backfill: set User.usernameNorm on grandfathered accounts whose
// username the forum (Discourse) rewrites — leading/trailing underscores or
// underscore runs (~31k of 4.3M accounts as of 2026-07-22). New-name claims
// check this field (sparse index) so a future name can't silently collide
// with an old name at the forum level (e.g. "Revolt" vs existing "Revolt_").
//
// Usage (from project root):
//   node scripts/backfillUsernameNorm.js
//
// Idempotent — re-running is safe. It only touches docs matching the
// underscore pattern that don't have usernameNorm yet, in batches of 1000.

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { forumNormalize, isForumStable } from '../serverUtils/forumUsername.js';

if (!process.env.MONGODB) {
  console.error('MONGODB env var not set');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB);
console.log('[backfill] connected');

const filter = {
  username: { $regex: '^_|_$|__' },
  usernameNorm: { $exists: false },
};

const toFill = await User.countDocuments(filter);
console.log(`[backfill] ${toFill} forum-unstable usernames missing usernameNorm`);

let done = 0;
while (true) {
  const batch = await User.find(filter, { username: 1 }).limit(1000).lean();
  if (batch.length === 0) break;

  const ops = batch
    .filter((u) => u.username && !isForumStable(u.username))
    .map((u) => ({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: { usernameNorm: forumNormalize(u.username) } },
      },
    }));
  // Regex matches like "a_b" are already stable — mark them too so the
  // batching filter above doesn't refetch them forever
  const stable = batch.filter((u) => !u.username || isForumStable(u.username));
  if (stable.length > 0) {
    // shouldn't happen with this regex, but never loop on them
    console.warn(`[backfill] ${stable.length} matched docs are actually stable — skipping via marker`);
    ops.push(...stable.map((u) => ({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: { usernameNorm: forumNormalize(u.username || '') } },
      },
    })));
  }

  if (ops.length > 0) {
    await User.bulkWrite(ops, { ordered: false });
  }
  done += batch.length;
  console.log(`[backfill] ${done}/${toFill}`);
}

console.log('[backfill] complete');
await mongoose.disconnect();
process.exit(0);
