import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  earliestDailyMetaDate, getDailyMetaSchedulePath,
  validateDailyMetaSchedule, validateDailyMetaUpdate,
} from '../serverUtils/dailyMetaSchedule.js';
import { normalizeDailyRounds } from '../serverUtils/normalizeDailyRounds.js';

vi.mock('../components/utils/ratelimitMiddleware.js', () => ({ default: (handler) => handler }));

const NOW = Date.parse('2026-09-06T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCHEDULE_PATH = fileURLToPath(new URL('../data/daily-metas.json', import.meta.url));
const day = () => [
  { lat: 48.8566, lng: 2.3522, country: 'FR' },
  { lat: 35.6762, lng: 139.6503, country: 'JP' },
  { lat: 40.7128, lng: -74.006, country: 'US' },
].map((location) => ({
  ...location, heading: 0, title: location.country,
  metas: [{ title: 'Tip', explanation: 'Look at the road signs.', view: { heading: 90 } }],
}));

let directory;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('DAILY_SECRET', 'daily-meta-test-secret');
  vi.stubEnv('DAILY_META_SCHEDULE_PATH', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  if (directory) {
    // Only remove the exact temporary directory created for this test.
    expect(path.dirname(directory)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(directory).startsWith('worldguessr-daily-meta-')).toBe(true);
    fs.rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

function privateSchedule() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldguessr-daily-meta-'));
  const target = path.join(directory, 'schedule.json');
  vi.stubEnv('DAILY_META_SCHEDULE_PATH', target);
  return {
    target,
    publish(value, at = Date.now()) {
      const temporary = path.join(directory, 'next.json');
      fs.writeFileSync(temporary, typeof value === 'string' ? value : JSON.stringify(value));
      fs.utimesSync(temporary, new Date(at), new Date(at));
      fs.renameSync(temporary, target);
    },
  };
}
async function coldWorker() {
  vi.resetModules();
  return import('../serverUtils/dailyChallenge.js');
}

describe('shared daily schedule validation', () => {
  it.each([undefined, ''])('uses the committed schedule when the override is %s, regardless of cwd', (value) => {
    vi.stubEnv('DAILY_META_SCHEDULE_PATH', value);
    vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());
    expect(getDailyMetaSchedulePath()).toBe(DEFAULT_SCHEDULE_PATH);
  });

  it('requires a private absolute path when an override is configured', () => {
    vi.stubEnv('DAILY_META_SCHEDULE_PATH', 'data/schedule.json');
    expect(() => getDailyMetaSchedulePath()).toThrow('absolute');
    vi.stubEnv('DAILY_META_SCHEDULE_PATH', path.resolve('data/schedule.json'));
    expect(() => getDailyMetaSchedulePath()).toThrow('outside the checkout');
    const { target } = privateSchedule();
    expect(getDailyMetaSchedulePath()).toBe(target);
  });

  it('accepts a complete schedule without altering its locations or tips', () => {
    const schedule = { '2026-09-09': day() };
    expect(validateDailyMetaSchedule(schedule)).toBe(schedule);
    expect(validateDailyMetaSchedule({})).toEqual({});
    expect(validateDailyMetaSchedule({ '2028-02-29': day() })).toBeDefined();
  });

  it.each([
    ['root array', () => []],
    ['root null', () => null],
    ['impossible date', () => ({ '2026-02-30': day() })],
    ['short day', () => ({ '2026-09-09': day().slice(1) })],
    ['latitude', () => { const d = day(); d[0].lat = 91; return { '2026-09-09': d }; }],
    ['longitude', () => { const d = day(); d[0].lng = -181; return { '2026-09-09': d }; }],
    ['nonfinite coordinate', () => { const d = day(); d[0].lat = Infinity; return { '2026-09-09': d }; }],
    ['invalid country', () => { const d = day(); d[0].country = 'ZZ'; return { '2026-09-09': d }; }],
    ['lowercase country', () => { const d = day(); d[0].country = 'fr'; return { '2026-09-09': d }; }],
    ['empty metas', () => { const d = day(); d[0].metas = []; return { '2026-09-09': d }; }],
    ['missing explanation', () => { const d = day(); delete d[0].metas[0].explanation; return { '2026-09-09': d }; }],
    ['invalid meta view', () => { const d = day(); d[0].metas[0].view = { heading: '90' }; return { '2026-09-09': d }; }],
    ['invalid image', () => { const d = day(); d[0].metas[0].image = 'javascript:alert(1)'; return { '2026-09-09': d }; }],
  ])('rejects the whole schedule for %s', (_, malformed) => {
    expect(() => validateDailyMetaSchedule(malformed())).toThrow('Invalid daily meta schedule');
  });

  it.each([
    ['2026-09-06T00:00:00.000Z', '2026-09-09'],
    ['2026-09-06T23:59:59.999Z', '2026-09-09'],
    ['2026-09-07T00:00:00.000Z', '2026-09-10'],
    ['2026-12-30T12:00:00.000Z', '2027-01-02'],
    ['2028-02-27T12:00:00.000Z', '2028-03-01'],
  ])('protects the complete UTC lookahead window at %s', (now, expected) => {
    expect(earliestDailyMetaDate(Date.parse(now))).toBe(expected);
  });

  it('rejects additions, removals and edits of every protected date while preserving unchanged history', () => {
    for (const date of ['2026-04-27', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']) {
      const previous = { [date]: day() };
      expect(() => validateDailyMetaUpdate({}, previous, NOW)).toThrow('protected');
      expect(() => validateDailyMetaUpdate(previous, {}, NOW)).toThrow('protected');
      const changed = structuredClone(previous);
      changed[date][0].metas[0].title = 'Changed';
      expect(() => validateDailyMetaUpdate(previous, changed, NOW)).toThrow('protected');
      const reordered = JSON.parse(JSON.stringify(previous));
      reordered[date][0] = Object.fromEntries(Object.entries(reordered[date][0]).reverse());
      expect(validateDailyMetaUpdate(previous, reordered, NOW)).toBe(reordered);
    }
    const future = { '2026-09-09': day() };
    expect(validateDailyMetaUpdate({}, future, NOW)).toBe(future);
    expect(validateDailyMetaUpdate(future, {}, NOW)).toEqual({});
  });
});

describe('daily schedule and location cache consistency', () => {
  it('serves the committed locations and tips through the API without an env override', async () => {
    vi.stubEnv('DAILY_META_SCHEDULE_PATH', undefined);
    const schedule = JSON.parse(fs.readFileSync(DEFAULT_SCHEDULE_PATH, 'utf8'));
    const dates = Object.keys(schedule).filter(date => date !== '_publishedAt');
    expect(dates.length).toBeGreaterThan(0);
    const worker = await coldWorker();
    const cold = await coldWorker();
    const { default: locationsHandler } = await import('../api/dailyChallenge/locations.js');
    for (const date of dates) {
      vi.setSystemTime(Date.parse(`${date}T12:00:00Z`));
      const expected = schedule[date].map(({ lat, lng, heading, country, metas }) => ({
        lat, long: lng, heading: heading ?? 0, country, metas,
      }));
      expect(worker.getDailyLocations(date)).toEqual(expected);
      expect(cold.getDailyLocations(date)).toEqual(expected);
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await locationsHandler({ method: 'GET', query: { date } }, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ date, locations: expected }));
    }
    const unscheduledDate = '2000-01-01';
    expect(schedule[unscheduledDate]).toBeUndefined();
    const picked = worker.getDailyLocations(unscheduledDate);
    privateSchedule().publish({});
    expect((await coldWorker()).getDailyLocations(unscheduledDate)).toEqual(picked);
  });

  it('keeps the seeded algorithm and session tokens unchanged with an empty schedule', async () => {
    privateSchedule().publish({});
    const worker = await coldWorker();
    const picked = worker.getDailyLocations('2026-09-09');
    // Captured from HEAD's seeded draw with the same test-only secret.
    expect(picked).toEqual([
      { lat: 41.31725444642974, long: 19.76902583771852, heading: 88.2787857055664, country: 'AL' },
      { lat: 42.00295481841255, long: 21.37984201624655, heading: 262.3113403320312, country: 'MK' },
      { lat: 22.31601424724127, long: 114.1698884259235, heading: 74.09363555908203, country: 'HK' },
    ]);
    expect(worker.getDailyLocations('2026-09-09')).toBe(picked);
    const cold = await coldWorker();
    expect(cold.getDailyLocations('2026-09-09')).toEqual(picked);
    const payload = `2026-09-09.${NOW}`;
    const hmac = crypto.createHmac('sha256', 'daily-meta-test-secret').update(payload).digest('hex').slice(0, 24);
    const token = worker.issueSessionToken('2026-09-09');
    expect(token).toBe(`${payload}.${hmac}`);
    expect(cold.verifySessionToken(token, '2026-09-09')).toBe(true);
  });

  it('invalidates a warmed future draw on add, edit and removal while preserving other cached dates', async () => {
    const file = privateSchedule();
    file.publish({});
    const warm = await coldWorker();
    const seeded = warm.getDailyLocations('2026-09-09');
    const historical = warm.getDailyLocations('2026-09-06');
    const otherFuture = warm.getDailyLocations('2026-09-10');
    const next = { '2026-09-09': day() };
    file.publish(next);
    const scheduled = warm.getDailyLocations('2026-09-09');
    expect(scheduled).not.toEqual(seeded);
    expect(warm.getDailyLocations('2026-09-06')).toBe(historical);
    expect(warm.getDailyLocations('2026-09-10')).toBe(otherFuture);
    expect((await coldWorker()).getDailyLocations('2026-09-09')).toEqual(scheduled);
    next['2026-09-09'][0].lat = 47;
    file.publish(next);
    expect(warm.getDailyLocations('2026-09-09')[0].lat).toBe(47);
    file.publish({});
    expect(warm.getDailyLocations('2026-09-09')).toEqual(seeded);
    expect((await coldWorker()).getDailyLocations('2026-09-09')).toEqual(seeded);
  });

  it('rejects a hot import of a date already exposed by the API instead of splitting cached puzzles', async () => {
    const file = privateSchedule();
    file.publish({});
    const worker = await coldWorker();
    const seeded = worker.getDailyLocations('2026-09-08');
    expect(worker.isValidDailyDate('2026-09-08')).toBe(true);
    file.publish({ '2026-09-08': day() });
    expect(worker.getDailyLocations('2026-09-08')).toBe(seeded);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('accepts a safe publication first observed after UTC midnight and keeps scoring locations consistent', async () => {
    vi.setSystemTime(Date.parse('2026-09-06T23:58:00Z'));
    const file = privateSchedule();
    file.publish({});
    const warm = await coldWorker();
    warm.getDailyLocations('2026-09-09');
    file.publish({ '2026-09-09': day() }, Date.parse('2026-09-06T23:59:00Z'));
    vi.setSystemTime(Date.parse('2026-09-07T12:00:00Z'));
    const cold = await coldWorker();
    const shown = warm.getDailyLocations('2026-09-09');
    expect(shown).toEqual(cold.getDailyLocations('2026-09-09'));
    expect(shown.map((loc) => loc.country)).toEqual(['FR', 'JP', 'US']);
    const submitted = shown.map((loc) => ({ score: 5000, guessLat: loc.lat, guessLng: loc.long }));
    const normalized = normalizeDailyRounds(submitted, cold.getDailyLocations('2026-09-09'));
    expect(normalized.map((round) => round.distance)).toEqual([0, 0, 0]);
    expect(normalized.map((round) => round.country)).toEqual(['FR', 'JP', 'US']);
    expect(normalized.reduce((sum, round) => sum + round.score, 0)).toBe(15000);
  });

  it('clamps a future file timestamp to the current publication boundary', async () => {
    const file = privateSchedule();
    file.publish({});
    const worker = await coldWorker();
    worker.getDailyLocations('2026-09-09');
    file.publish({ '2026-09-09': day() }, NOW + 10 * DAY_MS);
    expect(worker.getDailyLocations('2026-09-09')[0].country).toBe('FR');
  });

  it('accepts multiple valid publications missed across UTC midnight', async () => {
    vi.setSystemTime(Date.parse('2026-09-06T23:58:00Z'));
    const file = privateSchedule();
    file.publish({});
    const warm = await coldWorker();
    warm.getDailyLocations('2026-09-06');
    warm.getDailyLocations('2026-09-09');
    const first = { '2026-09-09': day() };
    const firstAt = Date.parse('2026-09-06T23:59:00Z');
    validateDailyMetaUpdate({}, first, firstAt);
    file.publish(first, firstAt);
    const second = { ...first, '2026-09-10': day() };
    const secondAt = Date.parse('2026-09-07T00:01:00Z');
    validateDailyMetaUpdate(first, second, secondAt);
    file.publish(second, secondAt);
    vi.setSystemTime(Date.parse('2026-09-07T00:02:00Z'));
    const cold = await coldWorker();
    expect(warm.getDailyLocations('2026-09-09')).toEqual(cold.getDailyLocations('2026-09-09'));
  });

  it('advances the protected baseline when an unchanged accepted file is observed after midnight', async () => {
    vi.setSystemTime(Date.parse('2026-09-06T23:58:00Z'));
    const file = privateSchedule();
    file.publish({});
    const worker = await coldWorker();
    worker.getDailyLocations('2026-09-06');
    vi.setSystemTime(Date.parse('2026-09-07T00:01:00Z'));
    expect(worker.isValidDailyDate('2026-09-09')).toBe(true);
    const shown = worker.getDailyLocations('2026-09-09');
    file.publish({ '2026-09-09': day() });
    expect(worker.getDailyLocations('2026-09-09')).toBe(shown);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('does not advance the baseline while retaining a schedule after rejected refreshes', async () => {
    vi.setSystemTime(Date.parse('2026-09-06T23:58:00Z'));
    const file = privateSchedule();
    file.publish({});
    const warm = await coldWorker();
    warm.getDailyLocations('2026-09-09');
    const first = { '2026-09-09': day() };
    const firstAt = Date.parse('2026-09-06T23:59:00Z');
    validateDailyMetaUpdate({}, first, firstAt);
    file.publish(first, firstAt);
    vi.setSystemTime(Date.parse('2026-09-07T00:01:00Z'));
    file.publish('{');
    warm.getDailyLocations('2026-09-06');
    warm.getDailyLocations('2026-09-06'); // Same rejected fingerprint must not advance it either.
    const recovered = { ...first, '2026-09-10': day() };
    validateDailyMetaUpdate(first, recovered, Date.now());
    file.publish(recovered);
    expect(warm.getDailyLocations('2026-09-09')).toEqual((await coldWorker()).getDailyLocations('2026-09-09'));
  });

  it.each(['missing', 'JSON', 'schema'])('retains a warm schedule and fails closed on a cold %s file', async (failure) => {
    const file = privateSchedule();
    file.publish({ '2026-09-06': day() });
    const warm = await coldWorker();
    const shown = warm.getDailyLocations('2026-09-06');
    if (failure === 'missing') fs.unlinkSync(file.target);
    else if (failure === 'JSON') file.publish('{');
    else file.publish({ '2026-09-06': day(), '2026-09-09': [] });
    expect(warm.getDailyLocations('2026-09-06')).toBe(shown);
    const cold = await coldWorker();
    expect(() => cold.getDailyLocations('2026-09-06')).toThrow();
    expect(() => cold.getDailyLocations('2026-09-06')).toThrow();
    const { default: locationsHandler } = await import('../api/dailyChallenge/locations.js');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await locationsHandler({ method: 'GET', query: { date: '2026-09-06' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate daily locations' });
    file.publish({ '2026-09-06': day(), '2026-09-09': day() });
    expect(warm.getDailyLocations('2026-09-09')).toEqual(cold.getDailyLocations('2026-09-09'));
    expect(warm.getDailyLocations('2026-09-06')).toBe(shown);
  });

  it('judges a hot import by the publication stamp inside the file, not by a later copy time', async () => {
    // Authored on Sep 6 for Sep 9 (legal: earliest is Sep 9), but the file
    // reaches the host on Sep 8 with a fresh mtime. By mtime Sep 9 would be
    // protected on a warm worker while a restarted worker accepted it: two
    // puzzles for one date. The stamp keeps every worker on the same answer.
    const file = privateSchedule();
    file.publish({});
    const warm = await coldWorker();
    expect(warm.getDailyLocations('2026-09-09')[0].country).not.toBe('FR');
    const authoredAt = '2026-09-06T12:30:00.000Z';
    vi.setSystemTime(Date.parse('2026-09-08T09:00:00Z'));
    file.publish({ _publishedAt: authoredAt, '2026-09-09': day() }, Date.parse('2026-09-08T09:00:00Z'));
    const shown = warm.getDailyLocations('2026-09-09');
    expect(shown.map((loc) => loc.country)).toEqual(['FR', 'JP', 'US']);
    expect(shown).toEqual((await coldWorker()).getDailyLocations('2026-09-09'));
    // The stamp never reaches beyond the clock (a future stamp is clamped),
    // and an unstamped file still falls back to its mtime as before.
    expect(validateDailyMetaSchedule({ _publishedAt: authoredAt })).toEqual({ _publishedAt: authoredAt });
    expect(() => validateDailyMetaSchedule({ _publishedAt: 'yesterday' })).toThrow('ISO timestamp');
  });

  it('keeps the newer schedule when an older-stamped file (a restored backup) replaces it', async () => {
    const file = privateSchedule();
    file.publish({ _publishedAt: '2026-09-06T12:00:00.000Z', '2026-09-09': day() });
    const warm = await coldWorker();
    const shown = warm.getDailyLocations('2026-09-09');
    expect(shown[0].country).toBe('FR');
    // Older publication without Sep 9: its early stamp would otherwise let
    // every date change, reverting a date players may already have played.
    file.publish({ _publishedAt: '2026-09-01T12:00:00.000Z' });
    expect(warm.getDailyLocations('2026-09-09')).toBe(shown);
    expect(console.error).toHaveBeenCalledTimes(1);
    // A newer publication is still adopted.
    file.publish({ _publishedAt: '2026-09-06T13:00:00.000Z', '2026-09-09': day(), '2026-09-10': day() });
    expect(warm.getDailyLocations('2026-09-10')[0].country).toBe('FR');
  });

  it('refuses an unstamped replacement once a stamped schedule was accepted', async () => {
    // A pre-stamp backup restored with its old mtime would otherwise move the
    // protected window back and let dates already served (today, tomorrow)
    // change on this worker while restarted workers accept the file whole.
    const file = privateSchedule();
    file.publish({ _publishedAt: '2026-09-06T12:00:00.000Z', '2026-09-09': day() });
    const warm = await coldWorker();
    const shown = warm.getDailyLocations('2026-09-09');
    const today = warm.getDailyLocations('2026-09-06');
    // Valid on its own (so only the stamp rule can refuse it): adds today and
    // drops Sep 9, both legal against a Sep 1 mtime window.
    file.publish({ '2026-09-06': day() }, Date.parse('2026-09-01T12:00:00Z'));
    expect(warm.getDailyLocations('2026-09-09')).toBe(shown);
    expect(warm.getDailyLocations('2026-09-06')).toBe(today);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('fails each daily request with a clear error on a rejected path instead of throwing at import', async () => {
    vi.stubEnv('DAILY_META_SCHEDULE_PATH', 'data/schedule.json');
    const worker = await coldWorker();
    expect(() => worker.getDailyLocations('2026-09-06')).toThrow('absolute');
    expect(() => worker.getDailyLocations('2026-09-06')).toThrow('absolute');
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
