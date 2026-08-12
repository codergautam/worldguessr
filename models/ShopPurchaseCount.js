import mongoose from 'mongoose';

// ONE ROW PER SKU: how many times it has been bought. It feeds exactly one
// thing — the "1.2K bought" line under a shop card — and is never read to decide
// whether a purchase may happen, so it is allowed to run a few minutes behind
// (see the cache note in api/stampShop.js).
//
// WHY THIS IS NOT A FIELD ON ShopCatalog. That collection is the ADMIN OVERRIDE
// layer and its own header says what it is: "a sku with no row here uses its
// code defaults", "never treat this collection as the list of purchasable
// items". Upserting a counter onto it would grow it a row for every item in the
// shop and turn it into precisely the item table it warns against. It would also
// force a read cache onto a collection whose entire job — disable an item,
// discount it, time-window it — has to take effect the moment it is written.
//
// WHY NOT AGGREGATE THE LEDGER INSTEAD. StampLedger holds the same fact
// (reason:'purchase', meta.sku) and is the SOURCE OF TRUTH for it — this
// collection is a denormalisation of that, seeded by
// scripts/backfillShopPurchaseCounts.js. But the ledger grows forever on
// purpose (every ranked win writes a row) and carries no index whose PREFIX is
// `reason`, so the group-by is a full collection scan. One $inc here is O(1) and
// the whole read is ~35 documents.
//
// IT COUNTS BUYS, NOT OWNERS. Nothing decrements it: a refund leaves the number
// alone, and the repeatable ad-free pass counts every purchase rather than every
// holder. "How many times this was bought" is exactly what the card claims.
const shopPurchaseCountSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
});

// The whole access pattern: upsert-by-sku on a buy, read the lot on a catalogue
// call. Unique so two first-ever purchases of the same sku cannot race two rows
// into existence (api/stampShop.js retries the loser onto the winner's row).
shopPurchaseCountSchema.index({ sku: 1 }, { unique: true });

const ShopPurchaseCount = mongoose.models.ShopPurchaseCount || mongoose.model('ShopPurchaseCount', shopPurchaseCountSchema);

export default ShopPurchaseCount;
