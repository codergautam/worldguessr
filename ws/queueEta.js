// Ranked 1v1 queue ETA. The model is intentionally small:
//   - exact 100-ELO bucket
//   - completed human matches from the last hour
//   - five distinct matches before showing a number
//   - recency-weighted p80 (15-minute half-life)

export const BUCKET_WIDTH = 100;
export const BUCKET_CAP = 1024;
export const MAX_WAIT_MS = 30 * 60 * 1000;
export const MAX_AGE_MS = 60 * 60 * 1000;
export const MIN_MATCHES = 5;
export const CONSERVATIVE_QUANTILE = 0.8;
export const RECENCY_HALF_LIFE_MS = 15 * 60 * 1000;
export const STRICT_INFLATION = 2;

// Kept as a one-step plan because ws.js derives snapshot retention from it.
export const QUERY_PLAN = [{
  bucketWidth: BUCKET_WIDTH,
  ageMs: MAX_AGE_MS,
  q: CONSERVATIVE_QUANTILE,
}];

// Used only for rough wording while a bucket has fewer than five games.
export const BOOTSTRAP_SEC = [
  [1100, 15],
  [1200, 30],
  [1300, 60],
  [1400, 90],
  [1500, 150],
  [Infinity, 360],
];

export function createEtaStore() {
  return { buckets: new Map() };
}

function bucketIndex(rating) {
  return Math.floor(rating / BUCKET_WIDTH);
}

export function recordSample(store, {
  rating, waitMs, at, strict = false, matchId = null
} = {}) {
  if (!store?.buckets || !Number.isFinite(rating) || !Number.isFinite(waitMs)
      || waitMs < 0 || !Number.isFinite(at)) return false;

  const idx = bucketIndex(rating);
  let ring = store.buckets.get(idx);
  if (!ring) {
    ring = { items: [], next: 0 };
    store.buckets.set(idx, ring);
  }

  const sample = {
    waitMs: Math.min(waitMs, MAX_WAIT_MS),
    at,
    strict: !!strict,
    matchId: typeof matchId === 'string' && matchId ? matchId : null,
  };
  if (ring.items.length < BUCKET_CAP) ring.items.push(sample);
  else ring.items[ring.next] = sample;
  ring.next = (ring.next + 1) % BUCKET_CAP;
  return true;
}

function recentSamples(store, rating, now, strict) {
  const ring = store?.buckets?.get?.(bucketIndex(rating));
  if (!ring) return [];
  const oldest = now - MAX_AGE_MS;
  return ring.items.filter((sample) => sample
    && sample.at >= oldest
    && sample.at <= now
    && !!sample.strict === !!strict);
}

export function sweepSamples(store, now, maxAgeMs = MAX_AGE_MS) {
  if (!store?.buckets || !Number.isFinite(now)) return 0;
  const oldest = now - maxAgeMs;
  let removed = 0;

  for (const [idx, ring] of store.buckets) {
    const kept = ring.items.filter((sample) => sample && sample.at >= oldest)
      .sort((a, b) => a.at - b.at);
    removed += ring.items.length - kept.length;
    if (!kept.length) store.buckets.delete(idx);
    else if (kept.length !== ring.items.length) {
      ring.items = kept;
      ring.next = kept.length % BUCKET_CAP;
    }
  }
  return removed;
}

function countMatches(samples) {
  const ids = new Set();
  let legacyPlayers = 0;
  for (const sample of samples) {
    if (sample.matchId) ids.add(sample.matchId);
    else legacyPlayers++;
  }
  return ids.size + Math.floor(legacyPlayers / 2);
}

/** Weighted nearest-rank quantile. Newer games carry exponentially more weight. */
export function weightedQuantile(samples, q, now) {
  if (!Array.isArray(samples) || !samples.length || !Number.isFinite(q)
      || q < 0 || q > 1 || !Number.isFinite(now)) return null;

  const ordered = samples
    .filter((sample) => Number.isFinite(sample?.waitMs) && Number.isFinite(sample?.at))
    .map((sample) => ({
      waitMs: sample.waitMs,
      weight: Math.pow(0.5, Math.max(0, now - sample.at) / RECENCY_HALF_LIFE_MS),
    }))
    .sort((a, b) => a.waitMs - b.waitMs);
  const totalWeight = ordered.reduce((sum, sample) => sum + sample.weight, 0);
  if (!ordered.length || totalWeight <= 0) return null;

  const target = totalWeight * q;
  let cumulative = 0;
  for (const sample of ordered) {
    cumulative += sample.weight;
    if (cumulative >= target) return sample.waitMs;
  }
  return ordered[ordered.length - 1].waitMs;
}

export function estimateWait(store, { rating, now, strict = false } = {}) {
  if (!Number.isFinite(rating) || !Number.isFinite(now)) return { status: 'unknown' };
  const samples = recentSamples(store, rating, now, strict);
  const nMatches = countMatches(samples);
  if (nMatches < MIN_MATCHES) return { status: 'unknown', nMatches };

  const totalMs = weightedQuantile(samples, CONSERVATIVE_QUANTILE, now);
  if (!Number.isFinite(totalMs)) return { status: 'unknown', nMatches };
  return {
    status: 'ok',
    totalMs,
    longAfterMs: totalMs,
    bucket: bucketIndex(rating) * BUCKET_WIDTH,
    ageMs: MAX_AGE_MS,
    q: CONSERVATIVE_QUANTILE,
    nMatches,
    nTotal: samples.length,
    strict: !!strict,
  };
}

export function bootstrapEstimate(rating, strict = false) {
  if (!Number.isFinite(rating)) return null;
  for (const [ceiling, seconds] of BOOTSTRAP_SEC) {
    if (rating < ceiling) {
      const totalMs = seconds * 1000 * (strict ? STRICT_INFLATION : 1);
      return { totalMs, modelled: true, strict: !!strict };
    }
  }
  return null;
}

export function roughTier(totalMs) {
  if (!Number.isFinite(totalMs)) return null;
  if (totalMs < 60000) return 'short';
  if (totalMs <= 180000) return 'mid';
  return 'long';
}

export function bucketSeconds(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = ms / 1000;
  if (seconds > 1800) return null;
  if (seconds <= 10) return 10;
  if (seconds <= 45) return Math.ceil(seconds / 15) * 15;
  if (seconds <= 120) return Math.ceil(seconds / 30) * 30;
  if (seconds <= 600) return Math.ceil(seconds / 60) * 60;
  return Math.ceil(seconds / 300) * 300;
}

export function nextShownEta(previous, estimate, elapsedMs) {
  const long = (threshold) => ({
    state: 'long', value: null, unit: null, seconds: null, tier: null,
    longAfterMs: Number.isFinite(threshold) ? threshold : null,
  });
  const past = (threshold) => Number.isFinite(threshold)
    && Number.isFinite(elapsedMs) && elapsedMs > threshold;

  if (previous?.state === 'long') return previous;
  const previousThreshold = Number.isFinite(previous?.longAfterMs)
    ? previous.longAfterMs : null;
  if (past(previousThreshold)) return long(previousThreshold);
  if (previous?.state === 'ok' && Number.isFinite(previous.seconds)) return previous;

  if (!Number.isFinite(estimate?.totalMs)) {
    return { state: 'unknown', value: null, unit: null, seconds: null, tier: null, longAfterMs: null };
  }

  if (estimate.modelled) {
    const tier = roughTier(estimate.totalMs);
    const threshold = tier === 'short' ? 60000
      : tier === 'mid' ? 180000
        : Math.max(180000, estimate.totalMs);
    if (past(threshold)) return long(threshold);
    return {
      state: 'rough', value: null, unit: null, seconds: null, tier,
      longAfterMs: threshold,
    };
  }

  const seconds = bucketSeconds(estimate.totalMs);
  if (seconds === null) return long(null);
  const threshold = seconds * 1000;
  if (past(threshold)) return long(threshold);
  const minutes = seconds >= 120;
  return {
    state: 'ok',
    value: minutes ? Math.round(seconds / 60) : seconds,
    unit: minutes ? 'min' : 'sec',
    seconds,
    tier: null,
    longAfterMs: threshold,
  };
}

export function snapshotStore(store, now) {
  const buckets = [];
  for (const [bucket, ring] of store?.buckets || []) {
    const items = ring.items.filter((sample) => sample
      && sample.at >= now - MAX_AGE_MS
      && sample.at <= now).sort((a, b) => a.at - b.at);
    if (!items.length) continue;
    buckets.push({
      b: bucket,
      w: items.map((sample) => sample.waitMs),
      a: items.map((sample) => Math.round((now - sample.at) / 1000)),
      s: items.map((sample) => (sample.strict ? 1 : 0)),
      g: items.map((sample) => sample.matchId),
    });
  }
  return { v: 2, at: now, buckets };
}

export function restoreStore(snapshot, now, maxAgeMs = MAX_AGE_MS) {
  const store = createEtaStore();
  if (!Number.isFinite(now) || snapshot?.v !== 2 || !Number.isFinite(snapshot.at)
      || !Array.isArray(snapshot.buckets)) return store;

  const elapsed = Math.max(0, now - snapshot.at);
  const pending = [];
  for (const bucket of snapshot.buckets) {
    if (!Number.isFinite(bucket?.b) || !Array.isArray(bucket.w)) continue;
    for (let i = 0; i < bucket.w.length; i++) {
      const waitMs = bucket.w[i];
      const savedAgeSeconds = bucket.a?.[i];
      if (!Number.isFinite(waitMs) || waitMs < 0
          || !Number.isFinite(savedAgeSeconds) || savedAgeSeconds < 0) continue;
      const ageMs = savedAgeSeconds * 1000 + elapsed;
      if (ageMs > maxAgeMs) continue;
      pending.push({
        rating: bucket.b * BUCKET_WIDTH,
        waitMs,
        at: now - ageMs,
        strict: bucket.s?.[i] === 1,
        matchId: typeof bucket.g?.[i] === 'string' ? bucket.g[i] : null,
      });
    }
  }
  pending.sort((a, b) => a.at - b.at);
  for (const sample of pending) recordSample(store, sample);
  return store;
}
