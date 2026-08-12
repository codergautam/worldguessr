#!/usr/bin/env node
/**
 * DEV TESTING ONLY — hand an account Stamps so the shop can be exercised.
 *
 * Goes through grantStamps() under reason `admin_adjust`, so the ledger row is
 * written first and the balance moves second, exactly like every other credit.
 * Nothing here $incs User.stamps directly: a raw $inc would leave the economy
 * with currency that no ledger row explains, and cron.js's reconciliation sweep
 * reads the ledger, not the balance.
 *
 * The idempotency key carries a --tag (default a timestamp), so re-running the
 * same command with the same tag pays NOTHING (duplicate key). Pass a new --tag
 * to top up again.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * Usage (from project root):
 *   node scripts/devGrantStamps.js --user <email|username|_id> --amount 5000
 *   node scripts/devGrantStamps.js --user gautam --amount 5000 --apply
 *
 * Flags:
 *   --user N     email, username, or ObjectId. Required.
 *   --amount N   signed integer, |N| <= 100000 (admin_adjust ceiling). Default 5000.
 *   --tag S      idempotency suffix. Default: the current epoch ms.
 *   --apply      required to write.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { grantStamps } from '../serverUtils/stamps/grantStamps.js';
import { STAMPS_ENABLED } from '../serverUtils/stamps/config.js';

function flagValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function findUser(who) {
  const or = [{ email: who }, { username: who }];
  if (mongoose.Types.ObjectId.isValid(who)) or.push({ _id: who });
  return User.findOne({ $or: or }).select('_id username email stamps').lean();
}

async function main() {
  const who = flagValue('--user', null);
  const amount = Number(flagValue('--amount', 5000));
  const tag = flagValue('--tag', String(Date.now()));
  const apply = process.argv.includes('--apply');

  if (!who) {
    console.error('--user <email|username|_id> is required');
    process.exit(1);
  }
  if (!Number.isInteger(amount) || amount === 0) {
    console.error('--amount must be a non-zero integer');
    process.exit(1);
  }
  if (!process.env.MONGODB) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }
  if (!STAMPS_ENABLED) {
    console.error('STAMPS_ENABLED is off — grantStamps would short-circuit and pay nothing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB);
  console.log(`Connected to db "${mongoose.connection.name}"${apply ? ' (APPLY — THIS WRITES)' : ' (dry run)'}`);
  try {
    const user = await findUser(who);
    if (!user) {
      console.error(`No user matched "${who}"`);
      process.exit(1);
    }
    console.log(`${user.username} <${user.email}> ${user._id} — stamps ${user.stamps ?? 0} -> ${(user.stamps ?? 0) + amount}`);

    if (!apply) {
      console.log('\nDry run. Re-run with --apply to write.');
      return;
    }
    const res = await grantStamps(
      user._id,
      amount,
      'admin_adjust',
      `dev:grant:${user._id}:${tag}`,
      { note: 'dev testing grant', tag },
    );
    console.log(res.duplicate ? `Already granted under tag "${tag}" — nothing paid.` : `Applied. Balance: ${res.balance}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
