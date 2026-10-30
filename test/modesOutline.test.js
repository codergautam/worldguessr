// shared/modes/outline.js over the repo's own genBorders.json (the Shapes
// file itself is built from Natural Earth, but the cluster rules are the same
// and genBorders is what the test suite has offline).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { polygonsOf, primaryCluster, clusterShare, clusterBounds, outlinePath } from '../shared/modes/outline.js';

const borders = JSON.parse(fs.readFileSync(new URL('../public/genBorders.json', import.meta.url), 'utf8'));
const by = new Map();
for (const f of borders.features) {
  const code = f.properties?.code;
  if (!code) continue;
  if (!by.has(code)) by.set(code, []);
  by.get(code).push(f);
}
const names = (code) => by.get(code).map((f) => f.properties.name);

describe('primaryCluster', () => {
  it('keeps France with Corsica and drops Kerguelen', () => {
    expect(names('FR')).toContain('Kerguelen Islands');
    const { polygons } = polygonsOf(by.get('FR'));
    const cluster = primaryCluster(polygons);
    // Mainland + Corsica, nothing in the southern Indian Ocean.
    expect(cluster.length).toBeGreaterThanOrEqual(2);
    expect(cluster.every((p) => p.bbox.minY > 40)).toBe(true);
  });

  it('keeps the contiguous US and drops Alaska, Hawaii and Wake', () => {
    const { polygons, shifted } = polygonsOf(by.get('US'));
    expect(shifted).toBe(true); // Aleutians cross the antimeridian
    const cluster = primaryCluster(polygons);
    for (const p of cluster) {
      expect(p.bbox.minY).toBeGreaterThan(24);
      expect(p.bbox.maxY).toBeLessThan(50);
    }
    expect(clusterShare(by.get('US'))).toBeGreaterThan(0.7);
  });

  it('keeps Great Britain together', () => {
    const { polygons } = polygonsOf(by.get('GB'));
    const cluster = primaryCluster(polygons);
    expect(cluster.length).toBeGreaterThanOrEqual(3); // England+Wales, Scotland islands, Northern Ireland
    expect(cluster.every((p) => p.bbox.minY > 49)).toBe(true); // no Chagos
  });
});

describe('clusterBounds', () => {
  it('returns [-180, 180] longitudes and flags antimeridian crossings', () => {
    const fj = clusterBounds(by.get('FJ'));
    expect(fj.crossesAntimeridian).toBe(true);
    expect(fj.minLng).toBeLessThanOrEqual(180);
    expect(fj.maxLng).toBeGreaterThanOrEqual(-180);
    const it = clusterBounds(by.get('IT'));
    expect(it.crossesAntimeridian).toBe(false);
    expect(it.minLng).toBeGreaterThan(6);
    expect(it.maxLng).toBeLessThan(19);
  });
});

describe('outlinePath', () => {
  it('fits the longer side to size and keeps a plausible aspect ratio', () => {
    const it = outlinePath(by.get('IT'), { size: 100 });
    expect(it.d.startsWith('M')).toBe(true);
    expect(Math.max(it.width, it.height)).toBe(100);
    // Italy is taller than wide, roughly 1.3:1 in Mercator.
    expect(it.height).toBeGreaterThan(it.width);
    expect(it.height / it.width).toBeLessThan(2);
    const cl = outlinePath(by.get('CL'), { size: 100 });
    expect(cl.height / cl.width).toBeGreaterThan(3); // Chile is a strip
  });

  it('is deterministic and simplification shrinks the path', () => {
    const a = outlinePath(by.get('CH'), { size: 100 });
    const b = outlinePath(by.get('CH'), { size: 100 });
    expect(a).toEqual(b);
    const s = outlinePath(by.get('CH'), { size: 100, tolerance: 0.5 });
    expect(s.d.length).toBeLessThan(a.d.length / 2);
    expect(s.d.split('Z').length).toBe(a.d.split('Z').length); // same ring count
  });

  it('never spans more than half the world even across the antimeridian', () => {
    for (const code of ['RU', 'FJ', 'US', 'NZ']) {
      const { polygons, shifted } = polygonsOf(by.get(code));
      const cluster = primaryCluster(polygons);
      const minX = Math.min(...cluster.map((p) => p.bbox.minX));
      const maxX = Math.max(...cluster.map((p) => p.bbox.maxX));
      expect(maxX - minX, `${code} shifted=${shifted}`).toBeLessThan(180);
    }
  });
});
