// One-shot backfill for models/ShopPurchaseCount: seed every sku's `count` from
// StampLedger, which is where each purchase has been recorded all along.
//
// Usage (from project root):
//   node scripts/backfillShopPurchaseCounts.js
//
// RUN THIS ONCE BEFORE THE BUY-COUNT UI GOES LIVE. Without it every card reads
// zero — the live counter in api/stampShop.js only knows about buys made after
// it shipped, and the shop's history predates it.
//
// Idempotent: it $sets an ABSOLUTE figure computed from the ledger, so a second
// run lands on the same number instead of doubling it. Safe to re-run any time
// drift is suspected (see the two blind spots below); the counters simply
// resynchronise with the ledger.
//
// It also creates a count:0 row for every catalogue sku that has never been
// bought. Nothing depends on those rows existing — a missing row already reads
// as 0 — but pre-creating them closes the only window in which two first-ever
// purchases of one sku can race the unique index.
//
// TWO KINDS OF BUY IT CANNOT SEE, both deliberate:
//   1. An admin priceOverride of 0 delivers the item WITHOUT writing a ledger
//      row at all (the free branch in api/stampShop.js — grantStamps refuses a
//      zero delta), so a giveaway is invisible here. The live counter does count
//      it, which means a re-run can move a giveaway sku's number DOWN.
//   2. applied:false rows are counted as not-bought, matching the live counter,
//      which only bumps once grantStamps reports the debit applied.
// Both are rounding error on a vanity number, and neither justifies a second
// source of truth for "how many times was this bought".

import 'dotenv/config';
import mongoose from 'mongoose';
import StampLedger from '../models/StampLedger.js';
import ShopPurchaseCount from '../models/ShopPurchaseCount.js';
import { SHOP_CATALOG } from '../shared/shop/catalog.js';

if (!process.env.MONGODB) {
  console.error('MONGODB env var not set');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB);
console.log('[backfill] connected');

const start = Date.now();

// The whole history of the shop, grouped server-side. This is the expensive
// query the live read exists to avoid — it runs once, here, not per shop open.
const grouped = await StampLedger.aggregate([
  { $match: { reason: 'purchase', applied: true, 'meta.sku': { $type: 'string' } } },
  { $group: { _id: '$meta.sku', count: { $sum: 1 } } },
]);

const counted = new Map(grouped.map((row) => [row._id, row.count]));
console.log(`[backfill] ledger holds purchases for ${counted.size} sku(s)`);

const ops = [];

// Skus with a history: set the absolute figure. $set, never $inc — that is what
// makes re-running this safe.
for (const [sku, count] of counted) {
  ops.push({
    updateOne: {
      filter: { sku },
      update: { $set: { count } },
      upsert: true,
    },
  });
}

// Everything else in the catalogue: a zero row, created only if absent.
// $setOnInsert, so a sku that IS in the map above (and therefore already
// updated) can never be knocked back to zero by this pass.
const unsold = SHOP_CATALOG.filter((item) => !counted.has(item.sku));
for (const item of unsold) {
  ops.push({
    updateOne: {
      filter: { sku: item.sku },
      update: { $setOnInsert: { count: 0 } },
      upsert: true,
    },
  });
}

if (ops.length === 0) {
  console.log('[backfill] nothing to do');
  await mongoose.disconnect();
  process.exit(0);
}

const result = await ShopPurchaseCount.bulkWrite(ops, { ordered: false });
const ms = Date.now() - start;
console.log(`[backfill] upserted=${result.upsertedCount} modified=${result.modifiedCount} (${unsold.length} catalogue sku(s) with no sales) in ${ms}ms`);

// The five loudest rows, so a human can sanity-check the numbers before the UI
// starts showing them to two million people.
const top = [...counted.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [sku, count] of top) console.log(`[backfill]   ${sku}: ${count}`);

await mongoose.disconnect();
console.log('[backfill] done');
process.exit(0);
