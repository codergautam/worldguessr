import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { earliestDailyMetaDate } from '../serverUtils/dailyMetaSchedule.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/importDailyMetaPack.mjs');
const dayMs = 86_400_000;
const dayAfter = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
const fixtureDay = () => [
  { lat: 46.94809, lng: 7.44744, country: 'CH' },
  { lat: 40.7128, lng: -74.006, country: 'US' },
  { lat: -33.8688, lng: 151.2093, country: 'AU' },
].map(loc => ({ ...loc, heading: 0, metas: [{ title: 'Fixture', explanation: 'Test hint.', view: { heading: 0 } }] }));

let directory, output, pack;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldguessr-daily-import-'));
  output = path.join(directory, 'schedule.json');
  pack = path.join(directory, 'pack.json');
  fs.writeFileSync(pack, JSON.stringify({
    kind: 'geocoach.meta-pack', spec_version: 1,
    locations: fixtureDay().map(({ lat, lng, heading, country, metas }) => ({
      title: 'Fixture', country_code: country, view: { lat, lng, heading }, metas,
    })),
  }));
});
afterEach(() => {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.join(os.tmpdir(), 'worldguessr-daily-import-'))) throw new Error('Unexpected fixture directory');
  fs.rmSync(resolved, { recursive: true, force: true });
});

function run(start, extra = [], schedulePath = output) {
  return spawnSync(process.execPath, [script, pack, '--start', start, ...extra], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, DAILY_META_SCHEDULE_PATH: schedulePath },
  });
}

describe('private daily meta publisher CLI', () => {
  it('publishes a complete private file and retains historical entries', () => {
    const historical = fixtureDay();
    fs.writeFileSync(output, JSON.stringify({ '2000-01-01': historical }));
    const result = run(earliestDailyMetaDate());
    expect(result.status, result.stderr).toBe(0);
    const saved = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(saved['2000-01-01']).toEqual(historical);
    expect(saved[earliestDailyMetaDate()]).toHaveLength(3);
    expect(saved[earliestDailyMetaDate()].map(loc => loc.country)).toEqual(['CH', 'US', 'AU']);
    expect(fs.readdirSync(directory).sort()).toEqual(['pack.json', 'schedule.json']);
  });

  it('refuses the two-day API lookahead even with --force', () => {
    fs.writeFileSync(output, '{}');
    const result = run(dayAfter(earliestDailyMetaDate(), -1), ['--force']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('three UTC calendar days');
    expect(fs.readFileSync(output, 'utf8')).toBe('{}');
  });

  it('does not offer a live-date bypass', () => {
    const result = run(dayAfter(earliestDailyMetaDate(), -1), ['--allow-live']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--allow-live is no longer supported');
    expect(fs.existsSync(output)).toBe(false);
  });

  it('refuses malformed existing files instead of erasing their history', () => {
    const original = '{"2000-01-01":';
    fs.writeFileSync(output, original);
    const result = run(earliestDailyMetaDate());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing to replace');
    expect(fs.readFileSync(output, 'utf8')).toBe(original);
  });

  it('validates coordinates before replacing an existing schedule', () => {
    fs.writeFileSync(output, '{}');
    const invalid = JSON.parse(fs.readFileSync(pack, 'utf8'));
    invalid.locations[0].view.lat = 95;
    fs.writeFileSync(pack, JSON.stringify(invalid));
    const result = run(earliestDailyMetaDate());
    expect(result.status).toBe(1);
    expect(fs.readFileSync(output, 'utf8')).toBe('{}');
  });

  it('previews changes without writing and requires --force for an existing future day', () => {
    const date = earliestDailyMetaDate();
    fs.writeFileSync(output, JSON.stringify({ [date]: fixtureDay() }));
    const original = fs.readFileSync(output, 'utf8');
    expect(run(date).status).toBe(1);
    const preview = run(date, ['--force', '--dry-run']);
    expect(preview.status, preview.stderr).toBe(0);
    expect(fs.readFileSync(output, 'utf8')).toBe(original);
    const publish = run(date, ['--force']);
    expect(publish.status, publish.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))[date]).toHaveLength(3);
  });

  it('requires a private path and rejects normalized invalid calendar dates', () => {
    const missing = run(earliestDailyMetaDate(), [], '');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('DAILY_META_SCHEDULE_PATH');
    const invalid = run('2030-02-30');
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('not a real date');
    expect(fs.existsSync(output)).toBe(false);
  });
});
