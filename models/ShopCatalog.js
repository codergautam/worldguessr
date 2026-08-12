import mongoose from 'mongoose';

// OVERRIDE LAYER ONLY. The real catalog — every sku, its name, its art and its
// base price — lives in code at shared/shop/catalog.js so it ships, reviews and
// rolls back with the client bundle. This collection exists purely so an item
// can be disabled, discounted, time-windowed or re-sorted without a deploy.
//
// A row here for an unknown sku is inert; a sku with no row here uses its code
// defaults. Never treat this collection as the list of purchasable items.
//
// PRICING: the effective price is resolved SERVER-SIDE at purchase time as
// `priceOverride ?? codePrice`. A client-sent price is never read — the client
// only sends a sku.
const shopCatalogSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  // null = use the price from shared/shop/catalog.js. 0 is a legitimate override
  // (a free giveaway), so callers must use ?? and never ||.
  priceOverride: {
    type: Number,
    default: null,
  },
  availableFrom: {
    type: Date,
    default: null,
  },
  availableUntil: {
    type: Date,
    default: null,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

shopCatalogSchema.index({ sku: 1 }, { unique: true });
// Shop listing read path: active items in display order.
shopCatalogSchema.index({ enabled: 1, sortOrder: 1 });

const ShopCatalog = mongoose.models.ShopCatalog || mongoose.model('ShopCatalog', shopCatalogSchema);

export default ShopCatalog;
