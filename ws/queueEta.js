// Ranked 1v1 queue wait estimator. PURE — plain data in, plain data out.
//
// IMPORT SAFETY IS THE POINT OF THIS FILE, same rule as ws/matchmakingV2.js:
// zero imports, no process, no clock of its own (every `now` is injected). That
// purity is the only reason the survival arithmetic below can be unit tested at
// all, and the arithmetic is exactly the kind of thing that must be pinned by
// tests rather than eyeballed in production.
//
// ws.js owns the store object and the Mongo round trip; this file owns the
// statistics and the presentation rounding.
//
// ---------------------------------------------------------------------------
// WHAT THE NUMBER MEANS
// ---------------------------------------------------------------------------
// The estimate is the TOTAL typical wait for a rating band, measured from the
// moment you joined the queue. It is NOT "how much longer for you". USER RULING,
// and it is also the better statistic:
//
//   A remaining-time estimate has to be conditioned on how long you have
//   already waited, and because the wait distribution has a heavy right tail a
//   conditional estimate legitimately RISES the longer you sit there. A number
//   that grows while the player stares at it reads as broken however correct it
//   is. A total is a stable fact about the queue that the elapsed timer counts
//   up toward, so the player can place themselves against it at a glance.
//
// Elapsed time is used for exactly one thing: crossing `longAfterMs` flips the
// display to "taking longer than usual". It never moves the number.
//
// ---------------------------------------------------------------------------
// WIDEN TIME, NEVER RATING
// ---------------------------------------------------------------------------
// The single most important rule here, and the one that is tempting to get
// backwards. Measured against production, rating swings the wait ~120x (median
// ~3s site-wide, ~59s at 1400+, ~6min for the top three accounts) while time of
// day swings it only ~2x. So when a band is too sparse to answer, reach further
// back in TIME and only grudgingly wider in RATING.
//
// Widening the rating band on sparsity is the natural instinct and it is the
// one thing that must not happen: at rating 1450 the sparse band IS the band,
// and widening pulls in the ~1000 pool whose median is 3 seconds. The estimator
// would then tell its most demanding user "~10s" when the truth is minutes —
// confidently wrong, in the direction that destroys trust, exactly where the
// feature exists to build it.

// ---------------------------------------------------------------------------
// 1. Tuning
// ---------------------------------------------------------------------------

export const BUCKET_WIDTH = 100;             // rating points per shard
export const BUCKET_CAP = 192;               // ring capacity PER shard
export const MAX_WAIT_MS = 30 * 60 * 1000;   // clamp; one zombie can't move a tail
export const MIN_EVENTS = 6;                 // uncensored matches a step must have
export const MIN_SAMPLES = 10;               // total, censored included
export const LONG_QUANTILE = 0.9;            // "taking longer than usual" threshold
export const LONG_FALLBACK_MULT = 2;         // ...when p90 is undefined

/**
 * How much longer a STRICT player waits than a non-strict one at the same
 * rating, used only when there is not enough strict history to measure.
 *
 * MODELLED, NOT MEASURED, and deliberately pessimistic in the same spirit as
 * BOOTSTRAP_SEC. Strict removes everything below the Voyager cutoff from the
 * eligible pool, which is roughly the bottom 85% of the ladder. For a player
 * near the floor that is most of their reachable opponents; higher up the
 * window rarely reached that far down anyway, so the true multiplier falls off
 * with rating. 2x is a flat, conservative stand-in.
 *
 * REPLACE THIS WITH THE REAL RATIO once the strict population has accumulated
 * its own samples — at that point estimateWait answers from measured history and
 * this constant only covers the sparse tail.
 */
export const STRICT_INFLATION = 2;

/**
 * Ordered fallback ladder. TIME widens first and far; RATING widens last and
 * barely. `q` rises with staleness so an old answer reads HIGH, never low —
 * a slightly pessimistic number is useful, an optimistic one is a lie.
 */
export const QUERY_PLAN = [
  { band: 150, ageMs: 2 * 3600e3, q: 0.50 },
  { band: 150, ageMs: 6 * 3600e3, q: 0.55 },
  { band: 150, ageMs: 24 * 3600e3, q: 0.65 },
  { band: 250, ageMs: 24 * 3600e3, q: 0.70 },
  { band: 250, ageMs: 7 * 86400e3, q: 0.75 },
];

/**
 * Cold-start prior, as [ratingCeiling, seconds] pairs.
 *
 * MODELLED, NOT MEASURED. Derived from a simulation of the shipped
 * chooseDuelPairs against production arrival rates (20.6 ranked queue entries
 * per minute at peak) and the post-conversion rating distribution. The values
 * are the simulated p90, i.e. deliberately pessimistic: a bootstrap number must
 * read high, because the alternative to a slightly-too-large estimate is no
 * estimate at all on the day this ships.
 *
 * Used ONLY when the live ladder returns nothing, and superseded the moment a
 * band reaches MIN_EVENTS. Delete this table once the store has a week of real
 * history behind it.
 */
export const BOOTSTRAP_SEC = [
  [1100, 15],
  [1200, 30],
  [1300, 60],
  [1400, 90],
  [1500, 150],
  [Infinity, 360],
];

// ---------------------------------------------------------------------------
// 2. Sample store
// ---------------------------------------------------------------------------
//
// SHARDED BY RATING BUCKET, NOT ONE GLOBAL RING. This is not a micro
// optimisation, it is the difference between the feature working and not
// working. A single FIFO would be ~99% low-rating samples at production
// volumes, and the rare 1450+ observations — the only ones anybody needs an
// estimate for — would be the first thing evicted. Per-bucket rings mean the
// 1500 band keeps its last BUCKET_CAP samples no matter how much traffic the
// 1000 band generates. ~40 buckets x 192 samples is well under a megabyte.

/** @returns {{buckets: Map<number, {items: Array, next: number}>}} */
export function createEtaStore() {
  return { buckets: new Map() };
}

function bucketIndex(rating) {
  return Math.floor(rating / BUCKET_WIDTH);
}

/**
 * Record one observed wait.
 *
 * `censored: true` means the player left the queue after waiting this long
 * WITHOUT being matched — the true wait is unknown but greater. kmCurve knows
 * what to do with that; see the note there for why it matters.
 *
 * `strict` marks a sample observed by a player with strict matchmaking ON. It
 * is stored, not bucketed, so the shard layout is unchanged — see
 * collectSamples for why the two populations must never be mixed.
 *
 * @returns {boolean} false when the sample was rejected as unusable.
 */
export function recordSample(store, { rating, waitMs, at, censored = false, strict = false } = {}) {
  if (!store?.buckets) return false;
  if (!Number.isFinite(rating) || !Number.isFinite(waitMs) || !Number.isFinite(at)) return false;
  if (waitMs < 0) return false;

  // A socket that never closes cleanly sits in the queue until the 30s
  // disconnect purge reaps it. Without this clamp one such zombie drags a whole
  // band's tail and every player in it sees an inflated estimate.
  const wait = Math.min(waitMs, MAX_WAIT_MS);
  const idx = bucketIndex(rating);

  let ring = store.buckets.get(idx);
  if (!ring) {
    ring = { items: [], next: 0 };
    store.buckets.set(idx, ring);
  }

  const sample = { rating, waitMs: wait, at, censored: !!censored, strict: !!strict };
  if (ring.items.length < BUCKET_CAP) ring.items.push(sample);
  else ring.items[ring.next] = sample;
  ring.next = (ring.next + 1) % BUCKET_CAP;

  return true;
}

/**
 * Samples within `band` rating points and `maxAgeMs` of `now`.
 *
 * The rating filter is on the EXACT stored rating, not on bucket edges: a
 * bucket is a storage shard, not a query unit, so a 150-point band around 1500
 * must include 1350 and exclude 1349 regardless of where the shard boundaries
 * happen to fall.
 *
 * STRICT AND NON-STRICT ARE SEPARATE POPULATIONS AND ARE NEVER MIXED.
 * A strict player's eligible pool is a strict SUBSET of a non-strict player's at
 * the same rating (everything below the Voyager floor is removed), so their true
 * wait is always longer. Quote them the blended number and it is guaranteed too
 * low — the exact failure this file's header calls out as the one that destroys
 * trust. The filter runs both ways: a strict player's long waits must not
 * inflate everyone else's estimate either.
 *
 * A sample with no `strict` field (anything restored from a snapshot written
 * before this existed) reads as non-strict, which is the safe default: the
 * setting was unreachable when those samples were taken.
 */
export function collectSamples(store, { rating, band, now, maxAgeMs, strict = false } = {}) {
  const out = [];
  if (!store?.buckets || !Number.isFinite(rating)) return out;

  const lo = bucketIndex(rating - band);
  const hi = bucketIndex(rating + band);
  const oldest = now - maxAgeMs;

  for (let i = lo; i <= hi; i++) {
    const ring = store.buckets.get(i);
    if (!ring) continue;
    for (const s of ring.items) {
      if (!s) continue;
      if (Math.abs(s.rating - rating) > band) continue;
      if (s.at < oldest) continue;
      if (!!s.strict !== !!strict) continue;
      out.push({ waitMs: s.waitMs, censored: s.censored });
    }
  }
  return out;
}

/**
 * Drop samples older than `maxAgeMs`. Memory reclaim ONLY — collectSamples does
 * the authoritative age filter, so correctness never depends on this running.
 * Safe on any cadence.
 */
export function sweepSamples(store, now, maxAgeMs) {
  if (!store?.buckets) return 0;
  const oldest = now - maxAgeMs;
  let removed = 0;

  for (const [idx, ring] of store.buckets) {
    const kept = ring.items.filter((s) => s && s.at >= oldest);
    removed += ring.items.length - kept.length;
    if (kept.length === 0) {
      store.buckets.delete(idx);
      continue;
    }
    // Rebuilding resets the write cursor: `next` indexes into the OLD array and
    // would otherwise overwrite a live sample on the next record.
    ring.items = kept;
    ring.next = kept.length % BUCKET_CAP;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 3. Survival estimate
// ---------------------------------------------------------------------------

/**
 * Kaplan-Meier survival curve over the sample set.
 *
 * WHY NOT JUST TAKE A MEDIAN. Players who give up before matching are censored
 * observations: we know they waited at least W, not that they waited exactly W.
 * Both naive options bias the answer DOWNWARD — dropping them over-represents
 * the fast matches that did complete, and counting them as if they matched at W
 * replaces an unknown large value with a small one. The censoring rate is
 * highest in exactly the sparse high-rating bands where being wrong-low does
 * the most damage, so the naive estimator is least trustworthy precisely where
 * this feature has to be trusted.
 *
 * KM costs ~30 lines and also hands back the "no confident answer" signal for
 * free: when the curve never descends to the target quantile, the estimate is
 * genuinely undefined rather than merely unknown, and quantileAt returns null.
 *
 * TIE RULE: a censored observation at time t stays at risk for an event at the
 * same t. Standard convention, and the conservative one.
 */
export function kmCurve(samples) {
  const list = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.waitMs))
    .slice()
    .sort((a, b) => a.waitMs - b.waitMs || (a.censored ? 1 : 0) - (b.censored ? 1 : 0));

  const nTotal = list.length;
  const points = [];
  let atRisk = nTotal;
  let survival = 1;
  let nEvents = 0;
  let i = 0;

  while (i < list.length) {
    const t = list[i].waitMs;

    let events = 0;
    let censoredHere = 0;
    let j = i;
    while (j < list.length && list[j].waitMs === t) {
      if (list[j].censored) censoredHere++;
      else events++;
      j++;
    }

    if (events > 0 && atRisk > 0) {
      survival *= (atRisk - events) / atRisk;
      nEvents += events;
      points.push({ t, s: survival });
    }

    atRisk -= events + censoredHere;
    i = j;
  }

  return { points, nEvents, nTotal };
}

/**
 * The q-quantile of the wait distribution, in ms. UNCONDITIONAL — it does not
 * take an elapsed time and must never grow one. See the header: the displayed
 * figure is a total, and conditioning is what makes an ETA climb while a player
 * watches it.
 *
 * @returns {number|null} null when the curve never reaches 1 - q, which is the
 *   honest "the data does not support an answer" case.
 */
export function quantileAt(curve, q) {
  const target = 1 - q;
  for (const p of curve?.points || []) {
    if (p.s <= target) return p.t;
  }
  return null;
}

/**
 * Walk QUERY_PLAN and return the first step with enough data.
 *
 * @returns {{status:'ok', totalMs, longAfterMs, band, ageMs, q, nEvents, nTotal}
 *          |{status:'unknown'}}
 */
export function estimateWait(store, { rating, now, strict = false } = {}) {
  if (!Number.isFinite(rating)) return { status: 'unknown' };

  for (const step of QUERY_PLAN) {
    const samples = collectSamples(store, { rating, band: step.band, now, maxAgeMs: step.ageMs, strict });
    if (samples.length < MIN_SAMPLES) continue;

    const curve = kmCurve(samples);
    if (curve.nEvents < MIN_EVENTS) continue;

    const totalMs = quantileAt(curve, step.q);
    if (totalMs === null) continue; // curve never got there — try a wider step

    // p90 from the SAME curve, so the "taking longer" threshold is a real
    // property of this band rather than an arbitrary multiple. When the tail is
    // too censored to reach p90, fall back to a multiple of the estimate.
    const p90 = quantileAt(curve, LONG_QUANTILE);
    const longAfterMs = Math.max(totalMs, p90 ?? totalMs * LONG_FALLBACK_MULT);

    return {
      status: 'ok',
      totalMs,
      longAfterMs,
      band: step.band,
      ageMs: step.ageMs,
      q: step.q,
      nEvents: curve.nEvents,
      nTotal: curve.nTotal,
      strict: !!strict,
    };
  }

  // STRICT FALLBACK. The strict population is a fraction of the queue and lives
  // in the sparse top bands, so it can easily never reach MIN_EVENTS.
  //
  // Do NOT quietly hand back the non-strict number: it is a guaranteed
  // UNDERESTIMATE, because the strict player's pool is a subset of the pool that
  // number was measured on. Widening the RATING band is equally forbidden here
  // for the reason in this file's header — at 1450 the sparse band IS the band.
  //
  // So: take the non-strict estimate for the same rating as a LOWER BOUND,
  // inflate it, and stamp `modelled: true` so nextShownEta downgrades the
  // wording to a vague band. A number this module reasoned its way to must never
  // be phrased like one it measured.
  if (strict) {
    const base = estimateWait(store, { rating, now, strict: false });
    if (base.status === 'ok') {
      return {
        ...base,
        totalMs: Math.round(base.totalMs * STRICT_INFLATION),
        longAfterMs: Math.round(base.longAfterMs * STRICT_INFLATION),
        strict: true,
        modelled: true,
        derivedFrom: 'nonStrict',
      };
    }
  }

  return { status: 'unknown' };
}

/**
 * The static cold-start prior for a rating.
 *
 * `modelled: true` is the load-bearing field. It travels WITH the estimate
 * rather than as a separate argument precisely so a caller cannot forget it:
 * nextShownEta reads it and downgrades the wording to a vague band, because a
 * number this module invented must never be phrased like one it measured.
 *
 * @returns {{totalMs, longAfterMs, modelled: true}|null}
 */
export function bootstrapEstimate(rating, strict = false) {
  if (!Number.isFinite(rating)) return null;
  for (const [ceiling, seconds] of BOOTSTRAP_SEC) {
    if (rating < ceiling) {
      const totalMs = seconds * 1000 * (strict ? STRICT_INFLATION : 1);
      return {
        totalMs,
        longAfterMs: totalMs * LONG_FALLBACK_MULT,
        modelled: true,
        strict: !!strict,
      };
    }
  }
  return null;
}

/**
 * Coarse band for a MODELLED estimate. Three buckets, no figure — the client
 * renders these as "Typically under a minute" / "a few minutes" / "several
 * minutes", which reads as the guess it is.
 */
export function roughTier(totalMs) {
  if (!Number.isFinite(totalMs)) return null;
  if (totalMs <= 60000) return 'short';
  if (totalMs <= 180000) return 'mid';
  return 'long';
}

// ---------------------------------------------------------------------------
// 4. Presentation
// ---------------------------------------------------------------------------
//
// The rounding lives on the SERVER so the two clients never duplicate a
// seconds-vs-minutes branch and can never disagree about it. Clients receive a
// number and a unit and do nothing but format.

/**
 * Round to a human bucket. A queue estimate is inherently coarse and should
 * look it — "~45s" is honest, "~43s" claims a precision the data does not have.
 *
 * @returns {number|null} seconds, or null past the point where any estimate is
 *   meaningful (30 min).
 */
export function bucketSeconds(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = ms / 1000;
  if (s > 1800) return null;
  if (s < 15) return 10;
  if (s < 45) return Math.round(s / 15) * 15;
  if (s < 120) return Math.round(s / 30) * 30;
  if (s < 600) return Math.round(s / 60) * 60;
  return Math.round(s / 300) * 300;
}

/**
 * Decide what to actually show, given what was shown last tick.
 *
 * THE VALUE IS LATCHED FOR THE QUEUE SESSION. Once a figure has been shown it
 * keeps being shown: a band's wait distribution does not meaningfully change
 * inside one player's queue session, so re-deriving it every 5 seconds buys
 * nothing and risks the number stepping around under a stationary reader. Only
 * `state` may change, and only in one direction (ok -> long).
 *
 * @param prev  the previous return value of this function, or null on join.
 * @param est   estimateWait() output, or a bootstrapEstimate() shape.
 * @param elapsedMs  how long this player has waited — used ONLY as the `long`
 *                   threshold, never to alter the figure.
 */
export function nextShownEta(prev, est, elapsedMs) {
  // The latched threshold wins: once a session has a `long` boundary it keeps
  // it, so the prose can't flip back to a figure just because the underlying
  // band shifted while this player waited.
  const longAfter = Number.isFinite(prev?.longAfterMs) ? prev.longAfterMs
    : (Number.isFinite(est?.longAfterMs) ? est.longAfterMs : null);

  // Past the band's p90: stop quoting a figure the player has already beaten.
  if (longAfter !== null && Number.isFinite(elapsedMs) && elapsedMs > longAfter) {
    return { state: 'long', value: null, unit: null, seconds: null, tier: null, longAfterMs: longAfter };
  }

  // LATCH. Not a cache — see the doc comment. Only `state` may move.
  //
  // Deliberately does NOT latch 'rough': that state means "we have no real
  // data for this band yet", and if samples arrive mid-session we want the
  // vague band to be replaced by the measured figure. The upgrade only ever
  // runs one way — a measured 'ok' is latched here and can never decay back
  // into a guess.
  if (prev?.state === 'ok' && prev.seconds !== null) return prev;

  const totalMs = est?.totalMs;
  if (!Number.isFinite(totalMs)) {
    return { state: 'unknown', value: null, unit: null, seconds: null, tier: null, longAfterMs: longAfter };
  }

  // MODELLED, not measured. No figure, no "~", just a band — see
  // bootstrapEstimate. The whole point is that a player can tell at a glance
  // that this is a rough expectation and not something we observed.
  if (est.modelled) {
    return { state: 'rough', value: null, unit: null, seconds: null, tier: roughTier(totalMs), longAfterMs: longAfter };
  }

  const seconds = bucketSeconds(totalMs);
  if (seconds === null) {
    // Beyond the point where any figure is meaningful (30 min) — say so in
    // prose rather than printing a number nobody should plan around.
    return { state: 'long', value: null, unit: null, seconds: null, tier: null, longAfterMs: longAfter };
  }

  const useMinutes = seconds >= 120;
  return {
    state: 'ok',
    value: useMinutes ? Math.round(seconds / 60) : seconds,
    unit: useMinutes ? 'min' : 'sec',
    seconds,
    tier: null,
    longAfterMs: longAfter,
  };
}

// ---------------------------------------------------------------------------
// 5. Persistence
// ---------------------------------------------------------------------------
//
// Pure shape conversion only; ws.js owns the Mongo round trip. The store is
// worth persisting because a cold start costs the sparse high bands DAYS, not
// minutes — and those are the only bands where an estimate is interesting.

export function snapshotStore(store, now) {
  const buckets = [];
  for (const [b, ring] of store?.buckets || []) {
    const items = ring.items.filter(Boolean);
    if (!items.length) continue;
    buckets.push({
      b,
      // Ages are stored as seconds-before-now so a snapshot restored on a box
      // with a skewed clock still yields sane relative ages.
      r: items.map((s) => s.rating),
      w: items.map((s) => s.waitMs),
      a: items.map((s) => Math.round((now - s.at) / 1000)),
      c: items.map((s) => (s.censored ? 1 : 0)),
      // Strict flag. `v` stays 1 on purpose: an OLD ws reading a new snapshot
      // just ignores this array, and a NEW ws reading an old snapshot finds it
      // absent and reads every sample as non-strict — which is correct, because
      // the strict setting was unreachable when those samples were taken. No
      // version bump, no migration, no cold start for the sparse high bands.
      s: items.map((x) => (x.strict ? 1 : 0)),
    });
  }
  return { v: 1, at: now, buckets };
}

/**
 * Rebuild a store from a snapshot. Tolerates null, garbage and partial input by
 * returning an empty store — a corrupt snapshot must degrade to "no estimate
 * yet", never take the ws boot down with it.
 */
export function restoreStore(snap, now, maxAgeMs) {
  const store = createEtaStore();
  if (!snap || snap.v !== 1 || !Array.isArray(snap.buckets)) return store;

  for (const bucket of snap.buckets) {
    if (!bucket || !Array.isArray(bucket.r)) continue;
    for (let i = 0; i < bucket.r.length; i++) {
      const at = now - (Number(bucket.a?.[i]) || 0) * 1000;
      if (Number.isFinite(maxAgeMs) && now - at > maxAgeMs) continue;
      recordSample(store, {
        rating: Number(bucket.r[i]),
        waitMs: Number(bucket.w?.[i]),
        at,
        censored: bucket.c?.[i] === 1,
        strict: bucket.s?.[i] === 1,
      });
    }
  }
  return store;
}
