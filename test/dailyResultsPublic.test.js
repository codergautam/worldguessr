import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The public half of /api/dailyChallenge/results: the shared $median
// aggregation, its cache, and the `lite` bypass the home menu uses.

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  statsFindOne: vi.fn(),
}));

vi.mock('../components/utils/ratelimitMiddleware.js', () => ({ default: (handler) => handler }));
vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../models/GuestProfile.js', () => ({ default: {} }));
vi.mock('../models/GuestScore.js', () => ({ default: {} }));
vi.mock('../models/DailyChallengeScore.js', () => ({ default: { aggregate: mocks.aggregate } }));
vi.mock('../models/DailyChallengeStats.js', () => ({
  default: { findOne: mocks.statsFindOne },
  DAILY_ROUNDS_PER_DAY: 3,
  DAILY_BUCKET_COUNT: 31,
  DAILY_MAX_SCORE: 15000,
}));
vi.mock('../serverUtils/dailyChallenge.js', () => ({ isValidDailyDate: () => true }));
vi.mock('../serverUtils/dailyStreak.js', () => ({ effectiveStreak: () => 0, isGraceDay: () => false }));
vi.mock('../serverUtils/dailyRank.js', () => ({ exactDailyRank: async () => null }));
vi.mock('../api/dailyChallenge/leaderboard.js', () => ({ invalidateDailyLeaderboardCache: () => {} }));

// The aggregate builder: `.option()` returns the promise the handler awaits.
function aggregateResolving(rows) {
  return { option: () => Promise.resolve(rows) };
}
function aggregateRejecting(message) {
  return { option: () => Promise.reject(new Error(message)) };
}
function aggregateDeferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { builder: { option: () => promise }, resolve };
}

function statsResolving(doc) {
  return { select: () => ({ lean: async () => doc }) };
}

async function call(handler, query) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ method: 'GET', query }, res);
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

let handler;
let invalidate;
beforeEach(async () => {
  vi.resetModules();
  mocks.aggregate.mockReset();
  mocks.statsFindOne.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const mod = await import('../api/dailyChallenge/results.js');
  handler = mod.default;
  invalidate = mod.invalidateDailyPublicCache;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('daily results public distribution', () => {
  it('returns an empty roundAverages list, not zeros, when no counted row exists yet', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving(null));
    mocks.aggregate.mockReturnValue(aggregateResolving([]));
    const { status, body } = await call(handler, { date: '2026-09-09' });
    expect(status).toBe(200);
    expect(body.distribution.roundAverages).toEqual([]);
    expect(body.distribution.avgScore).toBe(0);
    expect(body.distribution.totalPlays).toBe(0);
  });

  it('rounds the medians into three integers once rows exist', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 4, buckets: [1, 2] }));
    mocks.aggregate.mockReturnValue(aggregateResolving([{ rows: 5, score: 8520.4, r0: 1200.6, r1: 3000, r2: 4320.2 }]));
    const { body } = await call(handler, { date: '2026-09-09' });
    expect(body.distribution).toEqual({
      totalPlays: 5,
      avgScore: 8520,
      buckets: [1, 2],
      roundAverages: [1201, 3000, 4320],
    });
  });

  it('skips the aggregation entirely for lite callers', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving(null));
    mocks.aggregate.mockReturnValue(aggregateResolving([]));
    const { status, body } = await call(handler, { date: '2026-09-09', lite: '1' });
    expect(status).toBe(200);
    expect(body.distribution).toBeNull();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('does not let a reader that arrives after an invalidation join or re-cache the older aggregation', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 100, buckets: [] }));
    const first = aggregateDeferred();
    mocks.aggregate.mockReturnValueOnce(first.builder);
    const early = call(handler, { date: '2026-09-09' });
    // A score lands while the first aggregation is still running.
    invalidate('2026-09-09');
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 101, buckets: [] }));
    mocks.aggregate.mockReturnValueOnce(aggregateResolving([{ rows: 101, score: 5000, r0: 1, r1: 2, r2: 3 }]));
    const late = call(handler, { date: '2026-09-09' });
    first.resolve([{ rows: 100, score: 4000, r0: 1, r1: 2, r2: 3 }]);
    const [a, b] = await Promise.all([early, late]);
    expect(mocks.aggregate).toHaveBeenCalledTimes(2);
    expect(a.body.distribution.totalPlays).toBe(100);
    expect(b.body.distribution.totalPlays).toBe(101);
    // The cache holds the newer snapshot, not the retired one.
    const again = await call(handler, { date: '2026-09-09' });
    expect(mocks.aggregate).toHaveBeenCalledTimes(2);
    expect(again.body.distribution.totalPlays).toBe(101);
  });

  it('shares one in-flight aggregation between concurrent misses', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving(null));
    const deferred = aggregateDeferred();
    mocks.aggregate.mockReturnValue(deferred.builder);
    const first = call(handler, { date: '2026-09-09' });
    const second = call(handler, { date: '2026-09-09' });
    deferred.resolve([{ rows: 1, score: 100, r0: 1, r1: 2, r2: 3 }]);
    const [a, b] = await Promise.all([first, second]);
    expect(mocks.aggregate).toHaveBeenCalledTimes(1);
    expect(a.body.distribution.roundAverages).toEqual([1, 2, 3]);
    expect(b.body.distribution).toEqual(a.body.distribution);
  });

  it('answers a cold miss with counts only when the medians time out, and 500s only when the stats read fails too', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 7, buckets: [3, 4] }));
    mocks.aggregate.mockReturnValue(aggregateRejecting('operation exceeded time limit'));
    const cold = await call(handler, { date: '2026-09-09' });
    expect(cold.status).toBe(200);
    // avgScore is the histogram median (bucket 1 of 500-point buckets holds
    // the 4th of 7 plays: midpoint 750), never a 0 beside real plays.
    expect(cold.body.distribution).toEqual({ totalPlays: 7, avgScore: 750, buckets: [3, 4], roundAverages: [] });

    invalidate('2026-09-09');
    mocks.statsFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.reject(new Error('db down')) }) });
    mocks.aggregate.mockReturnValue(aggregateResolving([{ rows: 2, score: 900, r0: 100, r1: 200, r2: 600 }]));
    // A previous payload exists now, so a stats failure serves it.
    expect((await call(handler, { date: '2026-09-09' })).body.distribution.roundAverages).toEqual([]);

    invalidate('2026-09-10');
    expect((await call(handler, { date: '2026-09-10' })).status).toBe(500);
  });

  it('serves the previous medians with FRESH counts when a refresh fails', async () => {
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 2, buckets: [2] }));
    mocks.aggregate.mockReturnValue(aggregateResolving([{ rows: 2, score: 900, r0: 100, r1: 200, r2: 600 }]));
    expect((await call(handler, { date: '2026-09-09' })).body.distribution).toEqual({ totalPlays: 2, avgScore: 900, buckets: [2], roundAverages: [100, 200, 600] });

    // A third player submits: the stats doc is current, the medians time out.
    invalidate('2026-09-09');
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 3, buckets: [2, 1] }));
    mocks.aggregate.mockReturnValue(aggregateRejecting('operation exceeded time limit'));
    const { status, body } = await call(handler, { date: '2026-09-09' });
    expect(status).toBe(200);
    // Old medians, new counts: a live ownRank of 3 never sits beside "of 2".
    expect(body.distribution).toEqual({ totalPlays: 3, avgScore: 900, buckets: [2, 1], roundAverages: [100, 200, 600] });
    // The re-cached payload carries the fresh counts too.
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 99, buckets: [] }));
    expect((await call(handler, { date: '2026-09-09' })).body.distribution.totalPlays).toBe(3);

    // Never backwards: a stats read that lags the old total keeps the old total.
    invalidate('2026-09-09');
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 1, buckets: [1] }));
    expect((await call(handler, { date: '2026-09-09' })).body.distribution.totalPlays).toBe(3);
  });

  it('re-derives the histogram median when the previous payload was itself counts-only', async () => {
    // Cold miss, medians time out: counts-only payload, median from bucket 0.
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 2, buckets: [2] }));
    mocks.aggregate.mockReturnValue(aggregateRejecting('operation exceeded time limit'));
    expect((await call(handler, { date: '2026-09-11' })).body.distribution).toEqual({ totalPlays: 2, avgScore: 250, buckets: [2], roundAverages: [] });

    // Three more plays land in bucket 20 and the medians time out again: the
    // served median follows the served histogram (3rd of 5 plays sits in
    // bucket 20, midpoint 10250), not the retired one.
    invalidate('2026-09-11');
    mocks.statsFindOne.mockReturnValue(statsResolving({ totalPlays: 5, buckets: [2, ...new Array(19).fill(0), 3] }));
    const { body } = await call(handler, { date: '2026-09-11' });
    expect(body.distribution).toEqual({ totalPlays: 5, avgScore: 10250, buckets: [2, ...new Array(19).fill(0), 3], roundAverages: [] });
  });
});
