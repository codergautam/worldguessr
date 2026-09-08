import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Player from '../ws/classes/Player.js';
import User from '../models/User.js';
import { disconnectedPlayers, games, players, playersInQueue } from '../serverUtils/states.js';
import { getLeague, getLeagueBelow, getStrictFloor, getMatchmakingFallbackFloor } from '../components/utils/leagues.js';
import { ENTRY_RATING } from '../components/utils/eloSystem.js';
import { ratingRangeFor, windowFor } from '../ws/matchmakingV2.js';

vi.mock('../models/User.js', () => ({
  default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('../api/eloRank.js', () => ({ setElo: vi.fn() }));

// Execute the actual ranked admission branch without importing ws.js, which
// starts services. The Player methods and shared state below are real.
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
const admission = nodes.find((node) => node.type === 'IfStatement'
  && source.slice(node.test.start, node.test.end).includes("json.type === 'publicDuel'")
  && source.slice(node.consequent.start, node.end).includes('strictQueue'));
const joinRanked = runInNewContext(`(function(player) { ${source.slice(admission.start, admission.end)} })`, {
  json: { type: 'publicDuel' }, playersInQueue,
  BOTS_INSTANT: false, maintenanceMode: false, blockUnnamed: () => false,
  dodgeRemaining: () => 0, dodgeCooldowns: new Map(), dodgeKeyFor: (p) => p.accountId,
  queueJoinRateLimited: () => false, refreshBotEligibility: async () => {},
  getStrictFloor, getLeague, windowFor,
  rangeForRatingV2: () => [1750, 1850], pushQueueEta: () => {},
  console, Date,
});
const rangeNode = nodes.find((node) => node.type === 'FunctionDeclaration' && node.id.name === 'rangeForRatingV2');
const rangeForRatingV2 = runInNewContext(`(${source.slice(rangeNode.start, rangeNode.end)})`, {
  ENTRY_RATING, getLeague, getLeagueBelow, getStrictFloor, getMatchmakingFallbackFloor, ratingRangeFor,
});
const preference = nodes.find((node) => node.type === 'IfStatement'
  && source.slice(node.test.start, node.test.end).includes('json.type === "setStrictMatchmaking"'));
const setPreference = runInNewContext(`(function(player, json) { ${source.slice(preference.start, preference.end)} })`, {
  User, playersInQueue, getStrictFloor, windowFor, rangeForRatingV2, console, Date,
});

const account = (preference = false) => ({
  _id: 'account', username: 'Player', elo: 1800, banned: false,
  strictMatchmaking: preference, friends: [], sentReq: [], receivedReq: [],
});

function connectedPlayer(id, onMessage = () => {}) {
  const ws = { id, send: vi.fn((bytes) => onMessage(JSON.parse(new TextDecoder().decode(bytes)))), close: vi.fn() };
  const player = new Player(ws, id, '127.0.0.1');
  players.set(id, player);
  return player;
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const state of [players, games, disconnectedPlayers, playersInQueue]) state.clear();
  User.updateOne.mockResolvedValue({});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const state of [players, games, disconnectedPlayers, playersInQueue]) state.clear();
});

describe('ranked preference across authentication and reconnects', () => {
  it('uses saved OFF for a queue join immediately after the verification acknowledgement', async () => {
    User.findOne.mockResolvedValue(account(false));
    let releaseWrite;
    User.updateOne.mockReturnValue(new Promise((resolve) => { releaseWrite = resolve; }));
    let acknowledge;
    const acknowledged = new Promise((resolve) => { acknowledge = resolve; });
    const player = connectedPlayer('fresh', (message) => {
      if (message.type !== 'verify') return;
      joinRanked(player);
      acknowledge();
    });

    const verification = player.verify({ secret: 'test-secret' });
    await acknowledged;
    const queued = playersInQueue.get(player.id);
    releaseWrite({});
    await verification;

    expect(queued).toBeDefined();
    expect(queued.strict).toBe(false);
  });

  it('keeps the default ON when a legacy authentication record has no preference', async () => {
    const legacy = account();
    delete legacy.strictMatchmaking;
    User.findOne.mockResolvedValue(legacy);
    const player = connectedPlayer('legacy');
    await player.verify({ secret: 'test-secret' });
    joinRanked(player);
    expect(playersInQueue.get(player.id).strict).toBe(true);
  });

  it('preserves OFF through the actual gamestate serialization round trip', () => {
    const player = new Player(null, 'restored', '127.0.0.1');
    player.strictMatchmaking = false;
    const restored = Player.fromJSON(JSON.parse(JSON.stringify(player)));
    expect(restored.strictMatchmaking).toBe(false);
  });

  it.each([false, true])('preserves saved ON=%s when an older repeated verification resolves afterward', async (strict) => {
    const user = account(!strict);
    let releaseWrite, releaseRead;
    const write = new Promise((resolve) => { releaseWrite = resolve; });
    const read = new Promise((resolve) => { releaseRead = resolve; });
    User.updateOne.mockReturnValue(write);
    User.findOne.mockReturnValue(read);
    const player = connectedPlayer('verified');
    Object.assign(player, {
      accountId: user._id, username: user.username, elo: user.elo,
      verified: true, strictMatchmaking: !strict,
    });
    player.sendFriendData = vi.fn();
    setPreference(player, { type: 'setStrictMatchmaking', strict });

    const verification = player.verify({ secret: 'test-secret' });
    expect(User.findOne).toHaveBeenCalledOnce();
    releaseWrite({});
    await write;
    expect(player.strictMatchmaking).toBe(strict);
    releaseRead(user); // Authentication began before the preference save completed.
    await verification;

    expect(player.strictMatchmaking).toBe(strict);
    joinRanked(player);
    expect(playersInQueue.get(player.id).strict).toBe(strict);
  });

  it.each([false, true])('preserves saved ON=%s when an older reconnect read resolves afterward', async (strict) => {
    const user = account(!strict);
    User.findOne.mockResolvedValue(user);
    let releaseWrite, releaseRead, acknowledgeRead;
    const write = new Promise((resolve) => { releaseWrite = resolve; });
    const read = new Promise((resolve) => { releaseRead = resolve; });
    const readStarted = new Promise((resolve) => { acknowledgeRead = resolve; });
    User.updateOne.mockReturnValue(write);
    User.findById.mockReturnValue({ select: () => { acknowledgeRead(); return read; } });
    const returning = connectedPlayer('returning');
    Object.assign(returning, {
      accountId: user._id, username: user.username, elo: user.elo,
      verified: true, strictMatchmaking: !strict,
    });
    returning.sendFriendData = vi.fn();
    setPreference(returning, { type: 'setStrictMatchmaking', strict });
    returning.ws = null;
    returning.disconnected = true;
    disconnectedPlayers.set(user._id, returning.id);
    const incoming = connectedPlayer('incoming');

    const verification = incoming.verify({ secret: 'test-secret' });
    await readStarted;
    releaseWrite({});
    await write;
    expect(returning.strictMatchmaking).toBe(strict);
    releaseRead(user); // This snapshot predates the now-completed preference save.
    await verification;

    expect(returning.ws).toBe(incoming.ws);
    expect(returning.strictMatchmaking).toBe(strict);
    joinRanked(returning);
    expect(playersInQueue.get(returning.id).strict).toBe(strict);
  });

  it.each([
    [true, false, false],
    [false, true, true],
    [false, undefined, false],
    [true, undefined, true],
  ])('refreshes reconnect preference %s with DB value %s to %s', async (previous, stored, expected) => {
    const user = account();
    if (stored === undefined) delete user.strictMatchmaking;
    else user.strictMatchmaking = stored;
    User.findOne.mockResolvedValue(user);
    // Honor the actual projection so omitting the preference reproduces the bug.
    User.findById.mockReturnValue({ select: (fields) => Promise.resolve(Object.fromEntries(
      fields.split(' ').filter((field) => user[field] !== undefined).map((field) => [field, user[field]]),
    )) });
    const returning = new Player(null, 'returning', '127.0.0.1');
    Object.assign(returning, {
      accountId: user._id, username: user.username, elo: user.elo,
      verified: true, disconnected: true, strictMatchmaking: previous,
    });
    players.set(returning.id, returning);
    disconnectedPlayers.set(user._id, returning.id);
    const incoming = connectedPlayer('incoming');

    await incoming.verify({ secret: 'test-secret' });

    expect(returning.ws).toBe(incoming.ws);
    expect(returning.strictMatchmaking).toBe(expected);
    joinRanked(returning);
    expect(playersInQueue.get(returning.id).strict).toBe(expected);
  });
});

describe('changing the preference during a ranked search', () => {
  const now = 1_770_000_120_000;
  function queuedPlayer(strict) {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const messages = [];
    const player = connectedPlayer('queued', (message) => messages.push(message));
    Object.assign(player, { accountId: 'account', elo: 1800, inQueue: true, strictMatchmaking: strict });
    player.sendFriendData = vi.fn();
    const range = rangeForRatingV2(player.elo, 120_000, strict);
    const queued = {
      duel: true, guest: false, rating: player.elo, strict,
      queueTime: now - 120_000, window: windowFor(120_000), min: range[0], max: range[1],
      etaShown: { state: 'normal', seconds: 30 },
    };
    playersInQueue.set(player.id, queued);
    return { player, queued, messages };
  }

  it.each([true, false])('applies saved ON=%s to the current search without restarting it', async (strict) => {
    const { player, queued, messages } = queuedPlayer(!strict);
    let releaseWrite;
    const write = new Promise((resolve) => { releaseWrite = resolve; });
    User.updateOne.mockReturnValue(write);
    setPreference(player, { type: 'setStrictMatchmaking', strict });
    expect(queued.strict).toBe(!strict);
    expect(player.strictMatchmaking).toBe(!strict);
    expect(messages).toEqual([]);
    releaseWrite({});
    await write;
    expect(player.strictMatchmaking).toBe(strict);
    expect(playersInQueue.get(player.id)).toBe(queued);
    expect(queued.strict).toBe(strict);
    expect(queued.queueTime).toBe(now - 120_000);
    expect(queued.window).toBe(windowFor(120_000));
    expect([queued.min, queued.max]).toEqual([strict ? 1000 : 800, '∞']);
    expect(queued.etaShown).toBeFalsy();
    expect(messages).toContainEqual({ type: 'publicDuelRange', range: [strict ? 1000 : 800, '∞'] });
  });

  it('keeps the current search and preference unchanged when saving fails', async () => {
    const { player, queued, messages } = queuedPlayer(false);
    const before = structuredClone(queued);
    User.updateOne.mockRejectedValue(new Error('save failed'));
    setPreference(player, { type: 'setStrictMatchmaking', strict: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(player.strictMatchmaking).toBe(false);
    expect(queued).toEqual(before);
    expect(player.sendFriendData).toHaveBeenCalledOnce();
    expect(messages).toEqual([]);
  });

  it.each(['cancelled', 'matched'])('does not restart a search %s while the preference was saving', async (state) => {
    const { player, queued, messages } = queuedPlayer(false);
    const before = structuredClone(queued);
    let releaseWrite;
    const write = new Promise((resolve) => { releaseWrite = resolve; });
    User.updateOne.mockReturnValue(write);
    setPreference(player, { type: 'setStrictMatchmaking', strict: true });
    player.inQueue = false;
    if (state === 'matched') player.gameId = 'new-game';
    playersInQueue.delete(player.id);
    releaseWrite({});
    await write;
    expect(player.strictMatchmaking).toBe(true);
    expect(playersInQueue.has(player.id)).toBe(false);
    expect(queued).toEqual(before);
    expect(messages.filter((message) => message.type === 'publicDuelRange')).toEqual([]);
  });
});
