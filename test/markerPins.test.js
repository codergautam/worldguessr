import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SHOP_CATALOG } from '../shared/shop/catalog.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANVAS = { width: 150, height: 163 };
const MAX_PIN_BYTES = 64 * 1024;

const PINS = [
  { web: 'public/src-v2.png', mobile: 'mobile/assets/pins/src.png' },
  { web: 'public/src2-v2.png' },
  { web: 'public/dest-v2.png' },
  { web: 'public/pins/neonorange.png', mobile: 'mobile/assets/pins/neonorange.png' },
  { web: 'public/pins/neonpink.png', mobile: 'mobile/assets/pins/neonpink.png' },
  { web: 'public/pins/sky.png', mobile: 'mobile/assets/pins/sky.png' },
  { web: 'public/pins/emerald.png', mobile: 'mobile/assets/pins/emerald.png' },
  { web: 'public/pins/rainbow.png', mobile: 'mobile/assets/pins/rainbow.png' },
];

const PREVIEWS = ['src-v2', 'neonorange', 'neonpink', 'sky', 'emerald', 'rainbow'];

async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minY = info.height;
  let maxY = -1;
  const bottomXs = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 0) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  for (let x = 0; x < info.width; x += 1) {
    const alpha = data[(maxY * info.width + x) * info.channels + 3];
    if (alpha > 0) bottomXs.push(x);
  }

  return { minY, maxY, bottomXs };
}

describe('marker pin assets', () => {
  it.each(PINS)('$web uses the shared canvas and anchors at bottom-center', async ({ web }) => {
    const file = path.join(ROOT, web);
    const metadata = await sharp(file).metadata();
    const bounds = await alphaBounds(file);

    expect(metadata).toMatchObject({ format: 'png', width: CANVAS.width, height: CANVAS.height, hasAlpha: true });
    expect(statSync(file).size).toBeLessThanOrEqual(MAX_PIN_BYTES);
    expect(bounds.minY).toBeGreaterThan(0);
    expect(bounds.maxY).toBe(CANVAS.height - 1);
    expect(Math.min(...bounds.bottomXs)).toBeLessThanOrEqual(75);
    expect(Math.max(...bounds.bottomXs)).toBeGreaterThanOrEqual(74);
  });

  it.each(PINS.filter(({ mobile }) => mobile))('$mobile is byte-identical to $web', ({ web, mobile }) => {
    expect(readFileSync(path.join(ROOT, mobile))).toEqual(readFileSync(path.join(ROOT, web)));
  });

  it.each(PREVIEWS)('%s preview sizes are exact at 1x and 2x', async (name) => {
    const x1 = await sharp(path.join(ROOT, `public/pins/previews/${name}.png`)).metadata();
    const x2 = await sharp(path.join(ROOT, `public/pins/previews/${name}@2x.png`)).metadata();
    expect(x1).toMatchObject({ width: 76, height: 90 });
    expect(x2).toMatchObject({ width: 152, height: 180 });
  });

  it('catalogue exposes the five replacement skins and retires removed skins', () => {
    const markers = SHOP_CATALOG.filter(({ type }) => type === 'marker');
    expect(markers.map(({ sku, price }) => ({ sku, price }))).toEqual([
      { sku: 'marker_neon_orange_pin', price: 100 },
      { sku: 'marker_neon_pink_pin', price: 100 },
      { sku: 'marker_emerald_pin', price: 150 },
      { sku: 'marker_sky_pin', price: 300 },
      { sku: 'marker_rainbow_pin', price: 500 },
    ]);
    expect(existsSync(path.join(ROOT, 'public/pins/gold.png'))).toBe(false);
  });
});
