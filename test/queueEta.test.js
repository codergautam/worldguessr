import { describe, it, expect } from 'vitest';
import {
  BUCKET_CAP,
  MAX_WAIT_MS,
  QUERY_PLAN,
  createEtaStore,
  recordSample,
  collectSamples,
  sweepSamples,
  kmCurve,
  quantileAt,
  estimateWait,
  bootstrapEstimate,
  roughTier,
  bucketSeconds,
  nextShownEta,
  snapshotStore,
  restoreStore,
  STRICT_INFLATION,
} from '../ws/queueEta.js';

const NOW = 1_770_000_000_000; // fixed clock; every test passes `now` explicitly

/** Fill a store with `n` matched samples at one rating, all just now. */
const fill = (store, rating, n, waitMs = 5000, at = NOW, censored = false) => {
  for (let i = 0; i < n; i++) recordSample(store, { rating, waitMs, at, censored });
  return store;
};

/** Spread waits so the KM curve actually has distinct steps to walk. */
const fillSpread = (store, rating, waits, at = NOW) => {
  for (const w of waits) recordSample(store, { rating, waitMs: w, at });
  return store;
};

describe('recordSample', () => {
  it('rejects unusable input rather than poisoning a band', () => {
    const s = createEtaStore();
    expect(recordSample(s, { rating: NaN, waitMs: 100, at: NOW })).toBe(false);
    expect(recordSample(s, { rating: 1000, waitMs: NaN, at: NOW })).toBe(false);
    expect(recordSample(s, { rating: 1000, waitMs: 100, at: NaN })).toBe(false);
    expect(recordSample(s, { rating: 1000, waitMs: -1, at: NOW })).toBe(false);
    expect(s.buckets.size).toBe(0);
  });

  it('clamps a zombie queue entry so it cannot move a band tail', () => {
    const s = createEtaStore();
    recordSample(s, { rating: 1000, waitMs: 99 * 60 * 60 * 1000, at: NOW });
    expect(collectSamples(s, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 })[0].waitMs)
      .toBe(MAX_WAIT_MS);
  });

  it('shards on exact bucket boundaries', () => {
    const s = createEtaStore();
    recordSample(s, { rating: 1499, waitMs: 1, at: NOW });
    recordSample(s, { rating: 1500, waitMs: 1, at: NOW });
    expect([...s.buckets.keys()].sort((a, b) => a - b)).toEqual([14, 15]);
  });

  it('wraps at BUCKET_CAP keeping the newest samples', () => {
    const s = createEtaStore();
    for (let i = 0; i < BUCKET_CAP + 50; i++) {
      recordSample(s, { rating: 1000, waitMs: i, at: NOW });
    }
    const got = collectSamples(s, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 });
    expect(got.length).toBe(BUCKET_CAP);
    // The first 50 (waitMs 0..49) were overwritten.
    expect(Math.min(...got.map((x) => x.waitMs))).toBe(50);
  });

  // ── LOAD-BEARING ────────────────────────────────────────────────────────
  // The whole reason the ring is sharded per rating bucket. A single global
  // FIFO would be ~99% low-rating samples at production volume and would evict
  // the rare high-rating observations first — starving the only band anyone
  // needs an estimate for.
  it('traffic in one band never evicts another band', () => {
    const s = createEtaStore();
    fill(s, 1500, 5, 300000);
    fill(s, 1000, 10000, 3000);
    const top = collectSamples(s, { rating: 1500, band: 150, now: NOW, maxAgeMs: 3600e3 });
    expect(top.length).toBe(5);
    expect(top.every((x) => x.waitMs === 300000)).toBe(true);
  });
});

describe('collectSamples', () => {
  it('filters on exact rating, not on shard edges', () => {
    const s = createEtaStore();
    for (const r of [1349, 1350, 1500, 1650, 1651]) {
      recordSample(s, { rating: r, waitMs: r, at: NOW });
    }
    const got = collectSamples(s, { rating: 1500, band: 150, now: NOW, maxAgeMs: 3600e3 });
    expect(got.map((x) => x.waitMs).sort((a, b) => a - b)).toEqual([1350, 1500, 1650]);
  });

  it('drops samples outside the age window', () => {
    const s = createEtaStore();
    recordSample(s, { rating: 1000, waitMs: 1, at: NOW - 10 * 3600e3 });
    recordSample(s, { rating: 1000, waitMs: 2, at: NOW - 1000 });
    const got = collectSamples(s, { rating: 1000, band: 150, now: NOW, maxAgeMs: 2 * 3600e3 });
    expect(got.map((x) => x.waitMs)).toEqual([2]);
  });
});

describe('sweepSamples', () => {
  it('reclaims stale samples and drops emptied buckets', () => {
    const s = createEtaStore();
    fill(s, 1000, 5, 1000, NOW - 10 * 3600e3);
    fill(s, 1500, 3, 1000, NOW);
    expect(sweepSamples(s, NOW, 2 * 3600e3)).toBe(5);
    expect(s.buckets.has(10)).toBe(false);
    expect(s.buckets.has(15)).toBe(true);
  });

  it('leaves the write cursor safe to reuse after a rebuild', () => {
    const s = createEtaStore();
    fill(s, 1000, 5, 1000, NOW - 10 * 3600e3);
    fill(s, 1000, 3, 2000, NOW);
    sweepSamples(s, NOW, 2 * 3600e3);
    recordSample(s, { rating: 1000, waitMs: 3000, at: NOW });
    const got = collectSamples(s, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 });
    expect(got.length).toBe(4); // 3 survivors + the new one, nothing overwritten
  });
});

describe('kmCurve', () => {
  it('gives the plain median when nothing is censored', () => {
    const curve = kmCurve([10, 20, 30, 40, 50].map((waitMs) => ({ waitMs })));
    expect(quantileAt(curve, 0.5)).toBe(30);
    expect(curve.nEvents).toBe(5);
  });

  it('a censored observation removes an at-risk unit without dropping survival', () => {
    const withCensor = kmCurve([
      { waitMs: 10 }, { waitMs: 20, censored: true }, { waitMs: 30 }, { waitMs: 40 },
    ]);
    // 3 events, and the censored one is not one of them.
    expect(withCensor.nEvents).toBe(3);
    expect(withCensor.nTotal).toBe(4);
    // Survival after the first event is 3/4, not 2/3 — the censored unit was
    // still at risk at t=10.
    expect(withCensor.points[0].s).toBeCloseTo(0.75, 6);
  });

  it('keeps a censored observation at risk for an event at the same time', () => {
    const curve = kmCurve([
      { waitMs: 10, censored: true }, { waitMs: 10 }, { waitMs: 20 },
    ]);
    expect(curve.points[0].s).toBeCloseTo(2 / 3, 6);
  });

  it('reports zero events when every observation is censored', () => {
    const curve = kmCurve([10, 20, 30].map((waitMs) => ({ waitMs, censored: true })));
    expect(curve.nEvents).toBe(0);
    expect(curve.points).toEqual([]);
  });

  it('does not let people who gave up read as fast matches', () => {
    // The bias KM exists to prevent. Five real matches around 100-140, and five
    // players who bailed after ~10. Treating a bail as if it were a match (the
    // tempting shortcut) collapses the median to the bail time; KM keeps it
    // where the actual matches are, because a bail says "waited at least 10",
    // not "matched at 10".
    const events = [100, 110, 120, 130, 140].map((waitMs) => ({ waitMs }));
    const bails = [10, 11, 12, 13, 14];

    const asIfMatched = quantileAt(kmCurve([...events, ...bails.map((waitMs) => ({ waitMs }))]), 0.5);
    const correct = quantileAt(kmCurve([...events, ...bails.map((waitMs) => ({ waitMs, censored: true }))]), 0.5);

    expect(asIfMatched).toBeLessThan(20);
    expect(correct).toBe(120);
  });
});

describe('quantileAt', () => {
  it('returns null when the curve never descends to the target', () => {
    const curve = kmCurve([
      { waitMs: 10 }, ...Array.from({ length: 20 }, (_, i) => ({ waitMs: 20 + i, censored: true })),
    ]);
    expect(quantileAt(curve, 0.5)).toBe(null);
  });

  it('is monotone in q', () => {
    const curve = kmCurve([10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((waitMs) => ({ waitMs })));
    expect(quantileAt(curve, 0.5)).toBeLessThanOrEqual(quantileAt(curve, 0.75));
    expect(quantileAt(curve, 0.75)).toBeLessThanOrEqual(quantileAt(curve, 0.9));
  });
});

describe('estimateWait', () => {
  it('answers at the freshest plan step when the band is dense', () => {
    const s = createEtaStore();
    fillSpread(s, 1000, Array.from({ length: 40 }, (_, i) => (i + 1) * 1000));
    const est = estimateWait(s, { rating: 1000, now: NOW });
    expect(est.status).toBe('ok');
    expect(est.band).toBe(QUERY_PLAN[0].band);
    expect(est.ageMs).toBe(QUERY_PLAN[0].ageMs);
    expect(est.q).toBe(0.5);
  });

  it('falls through to an older, more conservative step when recent data is thin', () => {
    const s = createEtaStore();
    // Everything is 10 hours old: too stale for steps 0 and 1.
    fillSpread(s, 1000, Array.from({ length: 40 }, (_, i) => (i + 1) * 1000), NOW - 10 * 3600e3);
    const est = estimateWait(s, { rating: 1000, now: NOW });
    expect(est.status).toBe('ok');
    expect(est.ageMs).toBe(24 * 3600e3);
    expect(est.q).toBeGreaterThan(0.5); // stale data must read HIGH
  });

  it('always reports a long-threshold at or beyond the estimate', () => {
    const s = createEtaStore();
    fillSpread(s, 1000, Array.from({ length: 40 }, (_, i) => (i + 1) * 1000));
    const est = estimateWait(s, { rating: 1000, now: NOW });
    expect(est.longAfterMs).toBeGreaterThanOrEqual(est.totalMs);
  });

  it('is unknown on an empty store and for a non-finite rating', () => {
    expect(estimateWait(createEtaStore(), { rating: 1000, now: NOW }).status).toBe('unknown');
    expect(estimateWait(createEtaStore(), { rating: undefined, now: NOW }).status).toBe('unknown');
  });

  // ── LOAD-BEARING ────────────────────────────────────────────────────────
  // The rule the whole module is built around: WIDEN TIME, NEVER RATING.
  // Rating swings the wait ~120x in production; time of day only ~2x. Widening
  // the rating band on sparsity would hand a 1500-rated player the 1000-rated
  // pool's 3-second median — confidently wrong, in the direction that destroys
  // trust, exactly where this feature has to earn it.
  it('never answers a sparse high band with a dense low band', () => {
    const s = createEtaStore();
    fillSpread(s, 1000, Array.from({ length: 500 }, () => 3000));
    recordSample(s, { rating: 1500, waitMs: 400000, at: NOW });
    recordSample(s, { rating: 1500, waitMs: 380000, at: NOW });

    const est = estimateWait(s, { rating: 1500, now: NOW });
    expect(est.status).toBe('unknown');
  });

  it('the widest plan step still cannot reach across a 250-point gap', () => {
    const s = createEtaStore();
    fillSpread(s, 1000, Array.from({ length: 500 }, () => 3000), NOW - 5 * 86400e3);
    expect(estimateWait(s, { rating: 1500, now: NOW }).status).toBe('unknown');
  });
});

describe('bootstrapEstimate', () => {
  it('rises with rating and is pessimistic at the top', () => {
    expect(bootstrapEstimate(800).totalMs).toBe(15000);
    expect(bootstrapEstimate(1250).totalMs).toBe(60000);
    expect(bootstrapEstimate(1600).totalMs).toBe(360000);
    expect(bootstrapEstimate(800).totalMs).toBeLessThan(bootstrapEstimate(1600).totalMs);
  });

  it('stamps modelled:true so the wording can be downgraded downstream', () => {
    expect(bootstrapEstimate(800).modelled).toBe(true);
  });

  it('returns null rather than a number for a garbage rating', () => {
    expect(bootstrapEstimate(undefined)).toBe(null);
  });
});

describe('roughTier', () => {
  it('buckets on the minute boundaries', () => {
    expect(roughTier(15000)).toBe('short');
    expect(roughTier(60000)).toBe('short');
    expect(roughTier(60001)).toBe('mid');
    expect(roughTier(180000)).toBe('mid');
    expect(roughTier(180001)).toBe('long');
  });

  it('returns null for garbage', () => {
    expect(roughTier(NaN)).toBe(null);
  });
});

describe('bucketSeconds', () => {
  it('snaps to coarse human buckets', () => {
    expect(bucketSeconds(9000)).toBe(10);
    expect(bucketSeconds(30000)).toBe(30);
    expect(bucketSeconds(62000)).toBe(60);
    expect(bucketSeconds(200000)).toBe(180);
  });

  it('is monotone — a smaller wait never yields a bigger bucket', () => {
    let prev = 0;
    for (let s = 0; s <= 1800; s += 1) {
      const got = bucketSeconds(s * 1000);
      expect(got).toBeGreaterThanOrEqual(prev);
      prev = got;
    }
  });

  it('gives up past 30 minutes rather than printing a useless figure', () => {
    expect(bucketSeconds(1801 * 1000)).toBe(null);
    expect(bucketSeconds(NaN)).toBe(null);
  });
});

describe('nextShownEta', () => {
  const est = { status: 'ok', totalMs: 40000, longAfterMs: 120000 }; // 40s snaps to the 45s bucket

  it('formats seconds below two minutes and minutes above', () => {
    expect(nextShownEta(null, est, 0)).toMatchObject({ state: 'ok', value: 45, unit: 'sec' });
    expect(nextShownEta(null, { totalMs: 180000, longAfterMs: 600000 }, 0))
      .toMatchObject({ state: 'ok', value: 3, unit: 'min' });
  });

  // ── LOAD-BEARING ────────────────────────────────────────────────────────
  // USER RULING: the figure is the TOTAL typical wait for the band, measured
  // from queue join — not "how much longer for you". A conditional estimate
  // would legitimately RISE on a heavy-tailed distribution, and a number that
  // grows while a player watches it reads as broken however correct it is.
  // estimateWait takes no elapsed time at all; this pins the display half.
  it('does not move as the player waits — only the state may flip', () => {
    const at0 = nextShownEta(null, est, 0);
    const at30 = nextShownEta(at0, est, 30000);
    const at119 = nextShownEta(at30, est, 119000);
    expect(at30.value).toBe(at0.value);
    expect(at119.value).toBe(at0.value);
    expect(at119.state).toBe('ok');

    const past = nextShownEta(at119, est, 121000);
    expect(past.state).toBe('long');
    expect(past.value).toBe(null);
  });

  it('latches the figure even if the underlying band shifts mid-session', () => {
    const first = nextShownEta(null, est, 0);
    const shifted = nextShownEta(first, { status: 'ok', totalMs: 5000, longAfterMs: 120000 }, 5000);
    expect(shifted.value).toBe(45);
  });

  it('stays long once long — the prose never reverts to a figure', () => {
    const long = nextShownEta({ state: 'ok', value: 45, unit: 'sec', seconds: 45, longAfterMs: 60000 }, est, 61000);
    expect(long.state).toBe('long');
    expect(nextShownEta(long, est, 65000).state).toBe('long');
  });

  it('reports unknown rather than inventing a figure', () => {
    expect(nextShownEta(null, { status: 'unknown' }, 0))
      .toMatchObject({ state: 'unknown', value: null });
    expect(nextShownEta(null, null, 0)).toMatchObject({ state: 'unknown' });
  });

  it('falls to prose when the estimate is past the printable range', () => {
    expect(nextShownEta(null, { totalMs: 40 * 60 * 1000, longAfterMs: 80 * 60 * 1000 }, 0).state)
      .toBe('long');
  });

  // ── LOAD-BEARING ────────────────────────────────────────────────────────
  // A modelled prior must never be phrased like a measurement. This is the
  // regression the user hit: their very first game showed "Usually ~15s",
  // which reads as observed data and was in fact a hardcoded table entry.
  it('never emits a figure for a modelled estimate', () => {
    const shown = nextShownEta(null, bootstrapEstimate(500), 0);
    expect(shown.state).toBe('rough');
    expect(shown.value).toBe(null);
    expect(shown.unit).toBe(null);
    expect(shown.seconds).toBe(null);
    expect(shown.tier).toBe('short');
  });

  it('measured estimates never report rough', () => {
    expect(nextShownEta(null, est, 0).state).toBe('ok');
  });

  it('upgrades rough → ok when real samples arrive, and never the reverse', () => {
    const rough = nextShownEta(null, bootstrapEstimate(1500), 0);
    expect(rough.state).toBe('rough');
    // Real data lands mid-session: the vague band is replaced.
    const measured = nextShownEta(rough, est, 1000);
    expect(measured.state).toBe('ok');
    expect(measured.value).toBe(45);
    // ...and a later modelled read cannot decay it back to a guess.
    expect(nextShownEta(measured, bootstrapEstimate(1500), 2000).state).toBe('ok');
  });
});

describe('snapshotStore / restoreStore', () => {
  it('round-trips to an identical estimate', () => {
    const s = createEtaStore();
    fillSpread(s, 1000, Array.from({ length: 40 }, (_, i) => (i + 1) * 1000));
    const before = estimateWait(s, { rating: 1000, now: NOW });
    const after = estimateWait(restoreStore(snapshotStore(s, NOW), NOW, 7 * 86400e3), { rating: 1000, now: NOW });
    expect(after).toEqual(before);
  });

  it('drops samples that expired while the process was down', () => {
    const s = createEtaStore();
    fill(s, 1000, 5, 1000, NOW - 10 * 3600e3);
    const restored = restoreStore(snapshotStore(s, NOW), NOW, 2 * 3600e3);
    expect(collectSamples(restored, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 }).length).toBe(0);
  });

  it('degrades to an empty store on garbage rather than throwing at boot', () => {
    expect(restoreStore(null, NOW, 3600e3).buckets.size).toBe(0);
    expect(restoreStore({ v: 99 }, NOW, 3600e3).buckets.size).toBe(0);
    expect(restoreStore({ v: 1, buckets: [null, { r: 'nope' }] }, NOW, 3600e3).buckets.size).toBe(0);
  });
});

// ===========================================================================
// STRICT MATCHMAKING IS A SEPARATE POPULATION
// ===========================================================================
// A strict player's eligible pool is a strict SUBSET of a non-strict player's
// at the same rating: everything below the Voyager floor is removed. So their
// true wait is always LONGER, and quoting them the blended band number is a
// guaranteed underestimate — the precise failure this file's header calls out
// as the one that destroys trust, aimed at the players who opted in on purpose.
//
// The fix is to partition the samples, never to widen the rating band (see the
// "WIDEN TIME, NEVER RATING" note at the top of ws/queueEta.js).

/** n matched samples at one rating, all the same wait, with a strict flag. */
function fillTagged(store, { rating, waitMs, n, strict = false, at = NOW }) {
  for (let i = 0; i < n; i++) {
    recordSample(store, { rating, waitMs, at, censored: false, strict });
  }
}

describe('queueEta — strict partition', () => {
  it('collectSamples never mixes the two populations', () => {
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 5000, n: 5, strict: false });
    fillTagged(store, { rating: 1000, waitMs: 90000, n: 3, strict: true });

    const loose = collectSamples(store, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 });
    const tight = collectSamples(store, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3, strict: true });

    expect(loose).toHaveLength(5);
    expect(tight).toHaveLength(3);
    expect(loose.every((x) => x.waitMs === 5000)).toBe(true);
    expect(tight.every((x) => x.waitMs === 90000)).toBe(true);
  });

  it('answers a strict player from strict history when there is enough of it', () => {
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 4000, n: 40, strict: false });
    fillTagged(store, { rating: 1000, waitMs: 120000, n: 40, strict: true });

    const est = estimateWait(store, { rating: 1000, now: NOW, strict: true });
    expect(est.status).toBe('ok');
    expect(est.strict).toBe(true);
    expect(est.modelled).toBeUndefined();   // measured, not derived
    expect(est.totalMs).toBeGreaterThan(60000);
  });

  it('a strict player is NEVER quoted the raw non-strict number', () => {
    // Only non-strict history exists. The estimator must not hand it over as-is.
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 6000, n: 40, strict: false });

    const loose = estimateWait(store, { rating: 1000, now: NOW, strict: false });
    const tight = estimateWait(store, { rating: 1000, now: NOW, strict: true });

    expect(loose.status).toBe('ok');
    expect(tight.status).toBe('ok');
    expect(tight.totalMs).toBeGreaterThan(loose.totalMs);
    expect(tight.totalMs).toBe(Math.round(loose.totalMs * STRICT_INFLATION));
  });

  it('marks the derived strict estimate as modelled so the client hedges the wording', () => {
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 6000, n: 40, strict: false });

    const tight = estimateWait(store, { rating: 1000, now: NOW, strict: true });
    expect(tight.modelled).toBe(true);
    expect(tight.derivedFrom).toBe('nonStrict');
    // nextShownEta downgrades a modelled estimate to a vague band, never a figure.
    expect(nextShownEta(null, tight, 0).state).toBe('rough');
  });

  it('a strict player\'s long waits do not inflate everyone else\'s estimate', () => {
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 3000, n: 40, strict: false });
    fillTagged(store, { rating: 1000, waitMs: 600000, n: 40, strict: true });

    const loose = estimateWait(store, { rating: 1000, now: NOW, strict: false });
    expect(loose.totalMs).toBeLessThan(10000);
  });

  it('bootstraps a strict player higher than a non-strict one at the same rating', () => {
    const loose = bootstrapEstimate(1200, false);
    const tight = bootstrapEstimate(1200, true);

    expect(tight.totalMs).toBe(loose.totalMs * STRICT_INFLATION);
    expect(tight.modelled).toBe(true);
    expect(tight.strict).toBe(true);
  });

  it('round-trips the strict flag through a snapshot', () => {
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 5000, n: 4, strict: false });
    fillTagged(store, { rating: 1000, waitMs: 90000, n: 4, strict: true });

    const restored = restoreStore(snapshotStore(store, NOW), NOW, 24 * 3600e3);
    expect(collectSamples(restored, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 })).toHaveLength(4);
    expect(collectSamples(restored, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3, strict: true })).toHaveLength(4);
  });

  it('reads a pre-strict snapshot as non-strict rather than losing it', () => {
    // Old snapshots have no `s` array. Those samples were taken when the strict
    // setting was unreachable, so non-strict is the CORRECT reading — and it
    // means no version bump and no cold start for the sparse high bands.
    const legacy = { v: 1, at: NOW, buckets: [{ b: 10, r: [1000, 1000], w: [5000, 6000], a: [0, 0], c: [0, 0] }] };
    const restored = restoreStore(legacy, NOW, 24 * 3600e3);

    expect(collectSamples(restored, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 })).toHaveLength(2);
    expect(collectSamples(restored, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3, strict: true })).toHaveLength(0);
  });

  it('defaults to the non-strict population when no flag is passed', () => {
    const store = createEtaStore();
    fillTagged(store, { rating: 1000, waitMs: 5000, n: 3, strict: false });
    expect(collectSamples(store, { rating: 1000, band: 150, now: NOW, maxAgeMs: 3600e3 })).toHaveLength(3);
  });
});
