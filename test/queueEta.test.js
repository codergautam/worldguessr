import { describe, expect, it } from 'vitest';
import {
  BUCKET_CAP,
  MAX_AGE_MS,
  MIN_MATCHES,
  QUERY_PLAN,
  RECENCY_HALF_LIFE_MS,
  bootstrapEstimate,
  bucketSeconds,
  createEtaStore,
  estimateWait,
  nextShownEta,
  recordSample,
  restoreStore,
  snapshotStore,
  sweepSamples,
  weightedQuantile,
} from '../ws/queueEta.js';

const NOW = 1_770_000_000_000;

function addMatch(store, {
  id, rating = 1000, waitMs = 10_000, at = NOW, strict = false, players = 1
}) {
  for (let i = 0; i < players; i++) {
    recordSample(store, { rating, waitMs, at, strict, matchId: id });
  }
}

describe('rolling bucket estimator', () => {
  it('has one one-hour p80 query and no fallback ladder', () => {
    expect(QUERY_PLAN).toEqual([{ bucketWidth: 100, ageMs: 3_600_000, q: 0.8 }]);
  });

  it('requires five distinct completed games', () => {
    const store = createEtaStore();
    for (let i = 0; i < MIN_MATCHES - 1; i++) addMatch(store, { id: `g${i}` });
    expect(estimateWait(store, { rating: 1000, now: NOW })).toMatchObject({
      status: 'unknown', nMatches: 4,
    });
    addMatch(store, { id: 'g4' });
    expect(estimateWait(store, { rating: 1000, now: NOW })).toMatchObject({
      status: 'ok', nMatches: 5,
    });
  });

  it('does not count both players from one match as two games', () => {
    const store = createEtaStore();
    for (let i = 0; i < 4; i++) addMatch(store, { id: `g${i}`, players: 2 });
    expect(estimateWait(store, { rating: 1000, now: NOW }).status).toBe('unknown');
  });

  it('uses only the exact 100-ELO bucket', () => {
    const store = createEtaStore();
    for (let i = 0; i < 5; i++) addMatch(store, { id: `low${i}`, rating: 999, waitMs: 5_000 });
    for (let i = 0; i < 5; i++) addMatch(store, { id: `high${i}`, rating: 1000, waitMs: 90_000 });
    expect(estimateWait(store, { rating: 999, now: NOW }).totalMs).toBe(5_000);
    expect(estimateWait(store, { rating: 1000, now: NOW }).totalMs).toBe(90_000);
  });

  it('ignores games older than one hour', () => {
    const store = createEtaStore();
    for (let i = 0; i < 5; i++) {
      addMatch(store, { id: `old${i}`, waitMs: 300_000, at: NOW - MAX_AGE_MS - 1 });
      addMatch(store, { id: `new${i}`, waitMs: 20_000 });
    }
    expect(estimateWait(store, { rating: 1000, now: NOW }).totalMs).toBe(20_000);
  });

  it('keeps strict and normal queues separate', () => {
    const store = createEtaStore();
    for (let i = 0; i < 5; i++) {
      addMatch(store, { id: `normal${i}`, waitMs: 10_000 });
      addMatch(store, { id: `strict${i}`, waitMs: 120_000, strict: true });
    }
    expect(estimateWait(store, { rating: 1000, now: NOW }).totalMs).toBe(10_000);
    expect(estimateWait(store, { rating: 1000, now: NOW, strict: true }).totalMs).toBe(120_000);
  });

  it('uses nearest-rank p80 when observations are equally recent', () => {
    const store = createEtaStore();
    [10, 20, 30, 40, 50].forEach((seconds, i) => {
      addMatch(store, { id: `g${i}`, waitMs: seconds * 1000 });
    });
    expect(estimateWait(store, { rating: 1000, now: NOW }).totalMs).toBe(40_000);
  });

  it('weights recent games more heavily than older games', () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      samples.push({ waitMs: 10_000, at: NOW - 55 * 60_000 });
    }
    for (let i = 0; i < 5; i++) samples.push({ waitMs: 120_000, at: NOW });

    // Unweighted p80 would still be 10s. Recency weighting correctly follows
    // the fresh slowdown and makes the 120s observations dominate.
    expect(weightedQuantile(samples, 0.8, NOW)).toBe(120_000);
    expect(RECENCY_HALF_LIFE_MS).toBe(15 * 60_000);
  });
});

describe('store and snapshot', () => {
  it('rejects malformed samples and clamps extreme waits', () => {
    const store = createEtaStore();
    expect(recordSample(store, { rating: NaN, waitMs: 1, at: NOW })).toBe(false);
    expect(recordSample(store, { rating: 1000, waitMs: -1, at: NOW })).toBe(false);
  });

  it('keeps the newest observations after a ring wraps', () => {
    const store = createEtaStore();
    for (let i = 0; i < BUCKET_CAP + 1; i++) {
      recordSample(store, { rating: 1000, waitMs: i, at: NOW + i, matchId: `g${i}` });
    }
    const snapshot = snapshotStore(store, NOW + BUCKET_CAP + 1);
    expect(snapshot.buckets[0].w).not.toContain(0);
    expect(snapshot.buckets[0].w).toContain(BUCKET_CAP);
  });

  it('sweeps expired observations', () => {
    const store = createEtaStore();
    addMatch(store, { id: 'old', at: NOW - MAX_AGE_MS - 1 });
    addMatch(store, { id: 'new' });
    expect(sweepSamples(store, NOW)).toBe(1);
  });

  it('ages snapshots while the process is down', () => {
    const store = createEtaStore();
    for (let i = 0; i < 5; i++) addMatch(store, { id: `g${i}` });
    const snapshot = snapshotStore(store, NOW);
    const restored = restoreStore(snapshot, NOW + MAX_AGE_MS + 1);
    expect(estimateWait(restored, { rating: 1000, now: NOW + MAX_AGE_MS + 1 }).status)
      .toBe('unknown');
  });

  it('round-trips an estimate', () => {
    const store = createEtaStore();
    for (let i = 0; i < 5; i++) addMatch(store, { id: `g${i}`, waitMs: (i + 1) * 10_000 });
    const before = estimateWait(store, { rating: 1000, now: NOW });
    const restored = restoreStore(snapshotStore(store, NOW), NOW);
    expect(estimateWait(restored, { rating: 1000, now: NOW })).toEqual(before);
  });

  it('rejects old or corrupt snapshot formats', () => {
    expect(restoreStore(null, NOW).buckets.size).toBe(0);
    expect(restoreStore({ v: 1, at: NOW, buckets: [] }, NOW).buckets.size).toBe(0);
    expect(restoreStore({ v: 2, buckets: [] }, NOW).buckets.size).toBe(0);
  });
});

describe('display', () => {
  it('rounds p80 upward', () => {
    expect(bucketSeconds(40_001)).toBe(45);
    expect(bucketSeconds(62_000)).toBe(90);
  });

  it('falls back to rough wording instead of showing a modelled number', () => {
    expect(nextShownEta(null, bootstrapEstimate(1000), 0)).toMatchObject({
      state: 'rough', value: null, tier: 'short',
    });
  });

  it('latches a numeric quote and changes to long immediately after it is exceeded', () => {
    const estimate = { status: 'ok', totalMs: 40_000 };
    const shown = nextShownEta(null, estimate, 0);
    expect(shown).toMatchObject({ state: 'ok', seconds: 45 });
    expect(nextShownEta(shown, estimate, 45_000).state).toBe('ok');
    expect(nextShownEta(shown, estimate, 45_001).state).toBe('long');
  });

  it('never moves a numeric quote while the player waits', () => {
    const shown = nextShownEta(null, { totalMs: 40_000 }, 0);
    expect(nextShownEta(shown, { totalMs: 10_000 }, 20_000)).toEqual(shown);
  });
});
