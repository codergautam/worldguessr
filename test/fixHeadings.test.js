import { describe, expect, it } from 'vitest';
import { angDiff, decide, norm, DEFAULT_TOL } from '../scripts/fixHeadings.js';

// These exist because the first version of scripts/fixHeadings.js shipped
// `180 - Math.abs(...)`, which is the SUPPLEMENT of the angular distance: it
// reads 0 for opposite bearings and 180 for identical ones. Every decision in
// decide() then inverted — it picked the farthest road direction, kept
// backwards headings and snapped correct ones. It reached 5,015 rows of
// world-extra.json.gz before it was caught. A metric that is silently upside
// down still produces plausible-looking output, so it gets pinned here.
describe('angDiff', () => {
  it('is zero for identical bearings', () => {
    expect(angDiff(0, 0)).toBe(0);
    expect(angDiff(137, 137)).toBe(0);
  });

  it('is 180 for opposite bearings', () => {
    expect(angDiff(0, 180)).toBe(180);
    expect(angDiff(45, 225)).toBe(180);
    expect(angDiff(280, 100)).toBe(180);
  });

  it('takes the short way around the compass', () => {
    expect(angDiff(350, 10)).toBe(20);
    expect(angDiff(10, 350)).toBe(20);
    expect(angDiff(359, 1)).toBe(2);
  });

  it('is symmetric and wraps out-of-range inputs', () => {
    expect(angDiff(90, 0)).toBe(angDiff(0, 90));
    expect(angDiff(370, 10)).toBe(0);
    expect(angDiff(-10, 10)).toBe(20);
  });

  it('never exceeds 180 or drops below 0', () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 11) {
        const d = angDiff(a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('decide', () => {
  // A normal two-way street: links point up and back down the road.
  const street = { centre: 90, links: [90, 270] };

  it('keeps a heading that already looks down the road', () => {
    expect(decide(85, street)).toEqual({ heading: null, reason: 'kept' });
    expect(decide(275, street)).toEqual({ heading: null, reason: 'kept' });
  });

  it('keeps a heading right at the tolerance edge and snaps past it', () => {
    expect(decide(90 + DEFAULT_TOL, street).reason).toBe('kept');
    expect(decide(90 + DEFAULT_TOL + 1, street).reason).toBe('snapped');
  });

  it('snaps a heading pointing off the road to the NEAREST road direction', () => {
    // 180 is 90 off both links; 170 leans towards the 270 link.
    expect(decide(200, street)).toEqual({ heading: 270, reason: 'snapped' });
    expect(decide(160, street)).toEqual({ heading: 90, reason: 'snapped' });
  });

  it('preserves which way down the street the original was facing', () => {
    // A backwards-facing aim stays backwards after the snap, it does not get
    // flipped to the drive direction.
    expect(decide(210, street).heading).toBe(270);
    expect(decide(325, street).heading).toBe(270);
  });

  it('fills a missing heading with the road direction closest to the drive direction', () => {
    expect(decide(null, street)).toEqual({ heading: 90, reason: 'filled' });
    expect(decide(null, { centre: 270, links: [90, 270] })).toEqual({ heading: 270, reason: 'filled' });
  });

  it('falls back to the image centre when the pano has no links', () => {
    expect(decide(null, { centre: 42, links: [] })).toEqual({ heading: 42, reason: 'filled' });
    expect(decide(300, { centre: 42, links: [] })).toEqual({ heading: 42, reason: 'snapped' });
    expect(decide(50, { centre: 42, links: [] })).toEqual({ heading: null, reason: 'kept' });
  });

  it('handles an intersection by choosing among every arm', () => {
    const cross = { centre: 0, links: [0, 90, 180, 270] };
    expect(decide(80, cross)).toEqual({ heading: null, reason: 'kept' });
    // 45 is 45 off both the 0 and 90 arms, past the 40 tolerance, so it snaps.
    expect(decide(46, cross)).toEqual({ heading: 90, reason: 'snapped' });
  });

  it('normalises what it writes into 0..360', () => {
    expect(decide(200, { centre: 0, links: [-30] }).heading).toBe(330);
    expect(norm(-90)).toBe(270);
    expect(norm(450)).toBe(90);
  });
});
