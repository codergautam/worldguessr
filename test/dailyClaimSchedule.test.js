import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  User: { findOne: vi.fn(), updateOne: vi.fn() },
  GuestProfile: { findOneAndUpdate: vi.fn(), findOne: vi.fn() },
  GuestScore: { find: vi.fn() },
  DailyChallengeScore: { find: vi.fn(), create: vi.fn() },
  writeLoggedInDailyGame: vi.fn(), incrementStats: vi.fn(), invalidateDailyPublicCache: vi.fn(),
}));
vi.mock('../components/utils/ratelimitMiddleware.js', () => ({ default: (handler) => handler }));
vi.mock('../models/User.js', () => ({ default: mocks.User }));
vi.mock('../models/GuestProfile.js', () => ({ default: mocks.GuestProfile }));
vi.mock('../models/GuestScore.js', () => ({ default: mocks.GuestScore }));
vi.mock('../models/DailyChallengeScore.js', () => ({ default: mocks.DailyChallengeScore }));
vi.mock('../serverUtils/dailyGameHistoryWriter.js', () => ({ writeLoggedInDailyGame: mocks.writeLoggedInDailyGame }));
vi.mock('../api/dailyChallenge/submit.js', () => ({ incrementStats: mocks.incrementStats }));
vi.mock('../api/dailyChallenge/results.js', () => ({ invalidateDailyPublicCache: mocks.invalidateDailyPublicCache }));

const DATE = '2026-09-06';
const locations = [
  { lat: 48.8566, lng: 2.3522, country: 'FR' },
  { lat: 35.6762, lng: 139.6503, country: 'JP' },
  { lat: 40.7128, lng: -74.006, country: 'US' },
].map((loc) => ({ ...loc, heading: 0, metas: [{ title: 'Tip', explanation: 'Road signs.', view: { heading: 90 } }] }));
let directory, schedulePath, claimed, profile;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-09-07T12:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldguessr-claim-meta-'));
  schedulePath = path.join(directory, 'schedule.json');
  vi.stubEnv('DAILY_META_SCHEDULE_PATH', schedulePath);
  vi.stubEnv('DAILY_SECRET', 'daily-claim-test-secret');
  claimed = false;
  profile = { daily: { history: [{ date: DATE, score: 15000, rank: 1 }], streakBest: 1 } };
  mocks.User.findOne.mockReturnValue({ select: async () => ({ _id: 'user', username: 'Player', dailyHistory: [] }) });
  mocks.User.updateOne.mockResolvedValue({});
  mocks.GuestProfile.findOneAndUpdate.mockImplementation(async () => {
    if (claimed) return null;
    claimed = true;
    return profile;
  });
  mocks.GuestProfile.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ claimedBy: 'user' }) }) });
  mocks.DailyChallengeScore.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mocks.DailyChallengeScore.create.mockResolvedValue({});
  mocks.GuestScore.find.mockReturnValue({ select: () => ({ lean: async () => [{
    date: DATE, score: 15000, rounds: locations.map((loc) => ({ score: 5000, guessLat: loc.lat, guessLng: loc.lng, country: loc.country })),
  }] }) });
  mocks.writeLoggedInDailyGame.mockResolvedValue({});
  mocks.incrementStats.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  expect(path.dirname(directory)).toBe(path.resolve(os.tmpdir()));
  expect(path.basename(directory).startsWith('worldguessr-claim-meta-')).toBe(true);
  fs.rmSync(directory, { recursive: true, force: true });
});

function publish() {
  fs.writeFileSync(schedulePath, JSON.stringify({ [DATE]: locations }));
}
async function claim(guestId = 'guest') {
  const { default: handler } = await import('../api/dailyChallenge/claimGuestProgress.js');
  const response = {};
  const res = {
    status(status) { response.status = status; return this; },
    json(body) { response.body = body; return this; },
  };
  await handler({ method: 'POST', body: { guestId, secret: 'test-secret' }, headers: {}, connection: { remoteAddress: '127.0.0.1' } }, res);
  return response;
}
function expectWrittenHistory() {
  expect(mocks.writeLoggedInDailyGame).toHaveBeenCalledOnce();
  expect(mocks.writeLoggedInDailyGame.mock.calls[0][0]).toMatchObject({
    date: DATE, finalScore: 15000, finalXp: 300,
    dailyLocs: locations.map(({ lng, ...loc }) => ({ ...loc, long: lng })),
  });
}

describe('guest claims with a configured daily schedule', () => {
  it('claims progress when the override points to the committed schedule', async () => {
    const committedPath = fileURLToPath(new URL('../data/daily-metas.json', import.meta.url));
    vi.stubEnv('DAILY_META_SCHEDULE_PATH', committedPath);
    const schedule = JSON.parse(fs.readFileSync(committedPath, 'utf8'));
    const date = Object.keys(schedule).find(key => key !== '_publishedAt');
    const locs = schedule[date];
    vi.setSystemTime(Date.parse(`${date}T12:00:00Z`));
    profile.daily.history[0].date = date;
    mocks.GuestScore.find.mockReturnValue({ select: () => ({ lean: async () => [{
      date, score: 15000, rounds: locs.map(loc => ({ score: 5000, guessLat: loc.lat, guessLng: loc.lng, country: loc.country })),
    }] }) });
    expect(await claim()).toMatchObject({ status: 200, body: { ok: true, mergedDays: 1 } });
    expect(claimed).toBe(true);
    expect(mocks.writeLoggedInDailyGame).toHaveBeenCalledOnce();
    expect(mocks.writeLoggedInDailyGame.mock.calls[0][0]).toMatchObject({
      date, finalScore: 15000, finalXp: 300,
      dailyLocs: locs.map(({ lat, lng, heading, country, metas }) => ({ lat, long: lng, heading: heading ?? 0, country, metas })),
    });
  });

  it.each(['missing', 'JSON', 'schema'])('does not consume progress on a cold %s failure and succeeds after recovery', async (failure) => {
    if (failure === 'JSON') fs.writeFileSync(schedulePath, '{');
    if (failure === 'schema') fs.writeFileSync(schedulePath, JSON.stringify({ [DATE]: [] }));
    for (let attempt = 0; attempt < 3; attempt++) expect((await claim()).status).toBe(500);
    expect(claimed).toBe(false);
    expect(mocks.GuestProfile.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.DailyChallengeScore.create).not.toHaveBeenCalled();
    expect(mocks.User.updateOne).not.toHaveBeenCalled();
    expect(mocks.writeLoggedInDailyGame).not.toHaveBeenCalled();
    publish();
    expect(await claim()).toMatchObject({ status: 200, body: { ok: true, mergedDays: 1 } });
    expectWrittenHistory();
  });

  it('preserves normal successful claims and their canonical historical locations', async () => {
    publish();
    expect(await claim()).toMatchObject({ status: 200, body: { ok: true, mergedDays: 1 } });
    expect(claimed).toBe(true);
    expectWrittenHistory();
  });

  it('still limits actual claims to three per user per day', async () => {
    publish();
    for (let attempt = 0; attempt < 3; attempt++) {
      claimed = false; // Each request targets a different unclaimed guest profile.
      expect((await claim(`guest-${attempt}`)).status).toBe(200);
    }
    expect((await claim('guest-four')).status).toBe(429);
    expect(mocks.GuestProfile.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(mocks.writeLoggedInDailyGame).toHaveBeenCalledTimes(3);
  });

  it('retains the validated schedule if the file disappears after the claim begins', async () => {
    publish();
    mocks.GuestProfile.findOneAndUpdate.mockImplementationOnce(async () => {
      claimed = true;
      fs.unlinkSync(schedulePath);
      return profile;
    });
    expect((await claim()).status).toBe(200);
    expectWrittenHistory();
  });
});
