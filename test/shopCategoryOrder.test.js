import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER } from '../shared/shop/categoryOrder.js';
import { SHOP_CATALOG } from '../shared/shop/catalog.js';

describe('shop category order', () => {
  it('shows pins, then backgrounds, then glows on every storefront', () => {
    expect(CATEGORY_ORDER).toEqual([
      'marker',
      'background',
      'glow',
      'emote',
      'pass',
    ]);
  });

  it('contains each supported category exactly once', () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });

  it('serves catalogue blocks in the same order', () => {
    const catalogueOrder = [...new Set(SHOP_CATALOG.map((item) => item.type))];
    expect(catalogueOrder).toEqual(CATEGORY_ORDER);
  });
});
