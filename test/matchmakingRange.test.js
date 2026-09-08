import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRY_RATING } from '../components/utils/eloSystem.js';
import {
  clearLeagueConfig, getLeague, getLeagueBelow, getStrictFloor,
  getMatchmakingFallbackFloor, setLeagueConfig,
} from '../components/utils/leagues.js';
import { ratingRangeFor, windowFor } from '../ws/matchmakingV2.js';

// Exercise the production adapter and widening pass without importing ws.js,
// which starts sockets, timers and database connections.
const require = createRequire(import.meta.url);
const eslintRequire = createRequire(require.resolve('eslint'));
const { parse } = createRequire(eslintRequire.resolve('espree'))('acorn');
const source = readFileSync(new URL('../ws/ws.js', import.meta.url), 'utf8');
const nodes = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type) nodes.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
const text = (node) => source.slice(node.start, node.end);
const rangeNode = nodes.find((node) => node.type === 'FunctionDeclaration' && node.id.name === 'rangeForRatingV2');
const widenNode = nodes.find((node) => node.type === 'BlockStatement'
  && node.body[0]?.type === 'VariableDeclaration'
  && node.body[0].declarations[0]?.id.name === 'now'
  && node.body[1]?.type === 'ForOfStatement'
  && text(node).includes('queueData.window = half'));
if (!rangeNode || !widenNode) throw new Error('Production matchmaking range adapter or widening pass was not found');

const JOINED_AT = 1_770_000_000_000;
const HIGH_RATING = 10_000; // The gradual lower bound cannot mask either widening floor.
function harness() {
  let now = JOINED_AT;
  const env = {
    ENTRY_RATING, getLeague, getLeagueBelow, getStrictFloor, getMatchmakingFallbackFloor,
    ratingRangeFor, windowFor, players: new Map(), playersInQueue: new Map(),
    Date: { now: () => now }, console: { error: vi.fn() },
  };
  env.rangeForRatingV2 = runInNewContext(`(${text(rangeNode)})`, env);
  const widen = runInNewContext(`(function () ${text(widenNode)})`, env);
  return {
    env, range: env.rangeForRatingV2,
    tick(waitedMs) {
      now = JOINED_AT + waitedMs;
      widen();
      expect(env.console.error).not.toHaveBeenCalled();
    },
  };
}

afterEach(clearLeagueConfig);

describe('production ranked search range', () => {
  it.each([false, true])('keeps the correct floors at one minute, two minutes and ten minutes with strict=%s', (strict) => {
    const { range } = harness();
    expect(Number.isFinite(range(HIGH_RATING, 59_999, strict)[1])).toBe(true);
    expect(range(HIGH_RATING, 60_000, strict)).toEqual([1000, '∞']);
    expect(range(HIGH_RATING, 119_999, strict)).toEqual([1000, '∞']);
    for (const waited of [120_000, 600_000]) {
      // Check the payload after JSON serialization, as both clients receive it.
      expect(JSON.parse(JSON.stringify(range(HIGH_RATING, waited, strict))))
        .toEqual([strict ? 1000 : 800, '∞']);
    }
  });

  it.each([false, true])('uses configured Voyager/Explorer floors with strict=%s', (strict) => {
    expect(setLeagueConfig([
      { name: 'Trekker', min: 0, max: 899 },
      { name: 'Explorer', min: 900, max: 1099 },
      { name: 'Voyager', min: 1100, max: 1399 },
      { name: 'Nomad', min: 1400, max: 1899 },
      { name: 'Legend', min: 1900, max: Infinity },
    ])).toBe(true);
    const { range } = harness();
    expect(range(HIGH_RATING, 60_000, strict)).toEqual([1100, '∞']);
    for (const waited of [120_000, 600_000]) {
      expect(range(HIGH_RATING, waited, strict)).toEqual([strict ? 1100 : 900, '∞']);
    }
  });

  it.each([false, true])('sends threshold updates without resetting the queue or preference with strict=%s', (strict) => {
    const h = harness();
    const send = vi.fn();
    const queue = {
      duel: true, guest: false, rating: HIGH_RATING, strict,
      queueTime: JOINED_AT, window: windowFor(59_999),
    };
    h.env.players.set('waiting', { send });
    h.env.playersInQueue.set('waiting', queue);
    h.tick(59_999);
    expect(send).not.toHaveBeenCalled();
    h.tick(60_000);
    expect(send).toHaveBeenLastCalledWith({ type: 'publicDuelRange', range: [1000, '∞'] });
    h.tick(119_999);
    send.mockClear();
    h.tick(120_000);
    const expected = [strict ? 1000 : 800, '∞'];
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'publicDuelRange', range: expected });
    expect([queue.min, queue.max]).toEqual(expected);
    h.tick(120_001);
    expect(send).toHaveBeenCalledTimes(1);
    expect(h.env.playersInQueue.get('waiting')).toBe(queue);
    expect(queue.queueTime).toBe(JOINED_AT);
    expect(queue.strict).toBe(strict);
  });

  it('keeps Trekker searches finite and gradual through the widening thresholds', () => {
    const { range } = harness();
    expect(range(700, 59_999, false)).toEqual([450, 950]);
    expect(range(700, 60_000, false)).toEqual([400, 1000]);
    expect(range(700, 119_999, false)).toEqual([300, 1100]);
    expect(range(700, 120_000, false)).toEqual([250, 1150]);
    expect(range(700, 600_000, false)).toEqual([0, 1950]);
  });
});
