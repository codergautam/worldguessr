import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const eslintRequire = createRequire(require.resolve('eslint'));
const { parse } = createRequire(eslintRequire.resolve('espree'))('acorn');

// Run the actual callbacks without importing ws.js, which starts the server,
// timers and database connections. Only external services are replaced.
function readNodes(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
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
  return { nodes, text: (node) => source.slice(node.start, node.end) };
}

const server = readNodes('../ws/ws.js');
const playerSource = readNodes('../ws/classes/Player.js');

function harness() {
  const counts = new Map();
  const env = {
    players: new Map(), playersInQueue: new Map(), games: new Map(),
    disconnectedPlayers: new Map(), ipConnectionCount: new Map(),
    bannedIps: new Set(), duelRequestsLast10: counts,
    console: { log: vi.fn(), error: vi.fn() }, TextDecoder, Date,
    BOTS_INSTANT: false, blockUnnamed: () => false, maintenanceMode: false,
    dodgeRemaining: () => 0, dodgeCooldowns: new Map(), dodgeKeyFor: (p) => p.id,
    refreshBotEligibility: vi.fn(() => Promise.resolve()),
    getStrictFloor: () => 1000, rangeForRatingV2: () => [1450, 1550],
    windowFor: () => 50, pushQueueEta: vi.fn(), log: vi.fn(),
    getActivePlayerCount: () => 1, getLeague: () => ({ name: 'Nomad' }),
    currentDate: () => '', uuidv4: () => 'upgraded', json: {}, setCorsHeaders: vi.fn(),
    User: { updateOne: () => Promise.resolve() },
  };
  for (const name of ['matchesIpBan', 'queueJoinRateLimited']) {
    const node = server.nodes.find((n) => n.type === 'FunctionDeclaration' && n.id.name === name);
    if (node) env[name] = runInNewContext(`(${server.text(node)})`, env);
  }
  function handler(name) {
    const node = server.nodes.find((n) => n.type === 'Property'
      && n.key.name === name && n.value.type === 'ArrowFunctionExpression');
    return runInNewContext(`(${server.text(node.value)})`, env);
  }
  const close = handler('close');
  const message = handler('message');
  const upgrade = handler('upgrade');
  function addPlayer(id, ip = '1.2.3.4', accountId = id) {
    const p = {
      id, ip, accountId, username: id, verified: true, elo: 1500, league: 'Nomad',
      strictMatchmaking: true, inQueue: false, send: vi.fn(),
    };
    p.ws = { id, ip, close: vi.fn(() => close(p.ws, 1000, null)) };
    env.players.set(id, p);
    env.ipConnectionCount.set(ip, (env.ipConnectionCount.get(ip) || 0) + 1);
    return p;
  }
  function send(p, type) {
    message(p.ws, new TextEncoder().encode(JSON.stringify({ type })), false);
    expect(env.console.error).not.toHaveBeenCalled();
    expect(env.console.log.mock.calls.flat().some((x) => x instanceof Error)).toBe(false);
  }
  function resetRateWindow() {
    const call = server.nodes.find((n) => n.type === 'CallExpression'
      && n.callee.name === 'safeInterval'
      && n.arguments[0]?.value === 'duelReqReset');
    expect(call.arguments[1].value).toBe(10000);
    runInNewContext(`(${server.text(call.arguments[2])})()`, env);
  }
  function reconnect(p, accountId = 'account') {
    const node = playerSource.nodes.find((n) => n.type === 'VariableDeclarator'
      && n.id.name === 'handleReconnect');
    const factory = runInNewContext(`(function () { return ${playerSource.text(node.init)}; })`, env);
    return factory.call(p)('returning', accountId, accountId);
  }
  function banIp(ip) {
    const route = server.nodes.find((n) => n.type === 'CallExpression'
      && n.callee.type === 'MemberExpression' && n.callee.property.name === 'get'
      && n.arguments[0]?.type === 'TemplateLiteral'
      && n.arguments[0].quasis[0].value.raw === '/banIp/');
    const callback = runInNewContext(`(${server.text(route.arguments[1])})`, env);
    callback({ writeHeader: vi.fn(), end: vi.fn() }, { getParameter: () => ip });
  }
  return { env, close, message, upgrade, addPlayer, send, resetRateWindow, reconnect, banIp };
}

describe('queue socket ownership', () => {
  it('ignores a stale close while preserving the live queue and connection', () => {
    const h = harness();
    const p = h.addPlayer('returning');
    h.send(p, 'publicDuel');
    const queued = h.env.playersInQueue.get(p.id);
    const stale = { id: p.id, ip: p.ip };
    h.close(stale, 1000, null);
    expect(h.env.playersInQueue.get(p.id)).toBe(queued);
    expect(p.inQueue).toBe(true);
    expect(p.disconnected).not.toBe(true);
  });

  it('does not let a stale socket cancel the live queue', () => {
    const h = harness();
    const p = h.addPlayer('returning');
    h.send(p, 'publicDuel');
    h.message({ id: p.id }, new TextEncoder().encode('{"type":"leaveQueue"}'), false);
    expect(h.env.playersInQueue.has(p.id)).toBe(true);
    expect(p.inQueue).toBe(true);
  });

  it.each([false, true])('cleans up the current socket queue even if its handler throws: %s', (throws) => {
    const h = harness();
    const p = h.addPlayer('returning');
    h.send(p, 'publicDuel');
    if (throws) Object.defineProperty(p, 'username', { get() { throw new Error('cleanup failure'); } });
    h.close(p.ws, 1000, null);
    expect(h.env.playersInQueue.has(p.id)).toBe(false);
  });

  it.each([0, 1])('allows one owner when reconnect lookup %s resolves first', async (first) => {
    const h = harness();
    const original = h.addPlayer('returning', '1.2.3.4', 'account');
    h.close(original.ws, 1000, null);
    const contenders = [h.addPlayer('temp-a'), h.addPlayer('temp-b')];
    const resolve = [];
    h.env.User.findById = () => ({ select: () => new Promise((r) => resolve.push(r)) });
    const attempts = contenders.map((p) => h.reconnect(p));
    resolve[first]({ elo: 1500 });
    await attempts[first];
    const winner = contenders[first].ws;
    h.send(original, 'publicDuel');
    const queue = h.env.playersInQueue.get(original.id);
    resolve[1 - first]({ elo: 9999 });
    await attempts[1 - first];
    expect(original.ws).toBe(winner);
    expect(original.elo).toBe(1500);
    expect(h.env.playersInQueue.get(original.id)).toBe(queue);
    expect(contenders[1 - first].send).toHaveBeenCalledWith({ type: 'error', message: 'uac' });
    expect(contenders[1 - first].ws).toBeNull();
  });

  it('does not adopt a connection that closed during its account lookup', async () => {
    const h = harness();
    const original = h.addPlayer('returning', '1.2.3.4', 'account');
    h.close(original.ws, 1000, null);
    const incoming = h.addPlayer('temp');
    let resolve;
    h.env.User.findById = () => ({ select: () => new Promise((r) => { resolve = r; }) });
    const attempt = h.reconnect(incoming);
    h.close(incoming.ws, 1000, null);
    resolve({ elo: 9999 });
    await attempt;
    expect(original.ws).toBeNull();
    expect(original.elo).toBe(1500);
    expect(original.disconnected).toBe(true);
  });

  it('does not let a failed competing lookup replace the live connection', async () => {
    const h = harness();
    const original = h.addPlayer('returning', '1.2.3.4', 'account');
    h.close(original.ws, 1000, null);
    const contenders = [h.addPlayer('temp-a'), h.addPlayer('temp-b')];
    const pending = [];
    h.env.User.findById = () => ({ select: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
    const attempts = contenders.map((p) => h.reconnect(p));
    pending[0].resolve(null);
    await attempts[0];
    h.send(original, 'publicDuel');
    const queue = h.env.playersInQueue.get(original.id);
    pending[1].reject(new Error('database unavailable'));
    await attempts[1];
    expect(original.ws).toBe(contenders[0].ws);
    expect(h.env.playersInQueue.get(original.id)).toBe(queue);
    expect(contenders[1].ws).toBeNull();
  });

  it('still reconnects the current attempt when its lookup fails', async () => {
    const h = harness();
    const original = h.addPlayer('returning', '1.2.3.4', 'account');
    h.close(original.ws, 1000, null);
    const incoming = h.addPlayer('temp');
    h.env.User.findById = () => ({ select: () => Promise.reject(new Error('database unavailable')) });
    await h.reconnect(incoming);
    expect(original.ws).toBe(incoming.ws);
    expect(original.disconnected).toBe(false);
    expect(original.elo).toBe(1500);
  });

  it('does not revive a player purged during the reconnect lookup', async () => {
    const h = harness();
    const original = h.addPlayer('returning', '1.2.3.4', 'account');
    h.close(original.ws, 1000, null);
    const incoming = h.addPlayer('temp');
    let resolve;
    h.env.User.findById = () => ({ select: () => new Promise((r) => { resolve = r; }) });
    const attempt = h.reconnect(incoming);
    h.env.players.delete(original.id);
    resolve({ elo: 9999 });
    await attempt;
    expect(original.ws).toBeNull();
    expect(incoming.ws).toBeNull();
    expect(original.elo).toBe(1500);
  });

  it('preserves guest reconnects without an account lookup', async () => {
    const h = harness();
    const original = h.addPlayer('returning', '1.2.3.4', null);
    h.close(original.ws, 1000, null);
    const incoming = h.addPlayer('temp', '1.2.3.4', null);
    await h.reconnect(incoming, null);
    expect(original.ws).toBe(incoming.ws);
    expect(original.disconnected).toBe(false);
  });
});

describe('queue spam isolation', () => {
  it.each(['publicDuel', 'unrankedDuel'])('keeps 51 distinct players on a shared network connected: %s', (type) => {
    const h = harness();
    const players = Array.from({ length: 51 }, (_, i) => h.addPlayer(`player-${i}`));
    for (const p of players) h.send(p, type);
    expect(h.env.bannedIps.size).toBe(0);
    expect(h.env.playersInQueue.size).toBe(51);
    for (const p of players) expect(p.ws?.close).not.toHaveBeenCalled();
  });

  it('rejects excess requests before queue work, then allows joining after the reset', () => {
    const h = harness();
    const p = h.addPlayer('spammer');
    const neighbor = h.addPlayer('neighbor');
    const unrelated = h.addPlayer('unrelated', '11.2.30.4');
    for (let i = 0; i < 50; i++) h.send(p, 'publicDuel');
    h.send(p, 'leaveQueue');
    h.send(p, 'publicDuel');
    expect(h.env.playersInQueue.has(p.id)).toBe(false);
    expect(h.env.refreshBotEligibility).toHaveBeenCalledTimes(50);
    expect(p.send).toHaveBeenLastCalledWith({ type: 'toast', key: 'pleaseWaitSeconds', seconds: 10, toastType: 'error' });
    expect(h.env.bannedIps.size).toBe(0);
    expect(neighbor.ws.close).not.toHaveBeenCalled();
    expect(unrelated.ws.close).not.toHaveBeenCalled();
    h.resetRateWindow();
    h.send(p, 'publicDuel');
    expect(h.env.playersInQueue.has(p.id)).toBe(true);
  });

  it('shares an account limit across connections and queue types', () => {
    const h = harness();
    const first = h.addPlayer('first', '1.2.3.4', 'same-account');
    for (let i = 0; i < 50; i++) h.send(first, 'publicDuel');
    h.close(first.ws, 1000, null);
    const next = h.addPlayer('next', '5.6.7.8', 'same-account');
    h.send(next, 'unrankedDuel');
    expect(h.env.playersInQueue.has(next.id)).toBe(false);
  });

  it('limits IPv6 guests independently on the same address', () => {
    const h = harness();
    const first = h.addPlayer('guest-a', '2001:db8::1', null);
    const next = h.addPlayer('guest-b', '2001:db8::1', null);
    for (let i = 0; i < 50; i++) h.send(first, 'unrankedDuel');
    h.send(first, 'leaveQueue');
    h.send(first, 'unrankedDuel');
    h.send(next, 'unrankedDuel');
    expect(h.env.playersInQueue.has(first.id)).toBe(false);
    expect(h.env.playersInQueue.has(next.id)).toBe(true);
  });

  it('only disconnects the intended addresses when a manual prefix ban is applied', () => {
    const h = harness();
    const matching = h.addPlayer('matching', '1.2.3.4');
    const unrelated = h.addPlayer('unrelated', '11.2.30.4');
    const adjacent = h.addPlayer('adjacent', '1.2.30.4');
    h.banIp('1.2.3');
    expect(matching.ws).toBeNull();
    expect(unrelated.ws.close).not.toHaveBeenCalled();
    expect(adjacent.ws.close).not.toHaveBeenCalled();
    expect(h.env.bannedIps.has('1.2.3')).toBe(true);
  });

  it.each([
    ['1.2.3', '1.2.3.4', true],
    ['1.2.3', '11.2.30.4', false],
    ['1.2.3', '1.2.30.4', false],
    ['1.2.3.4', '1.2.3.4', true],
    ['1.2.3.4', '1.2.3.40', false],
    ['2001:db8::1', '2001:db8::1', true],
    ['2001:db8::1', '2001:db8::10', false],
  ])('enforces manual ban %s against %s with address boundaries', (ban, ip, blocked) => {
    const h = harness();
    h.env.bannedIps.add(ban);
    const res = { writeStatus: vi.fn(), end: vi.fn(), upgrade: vi.fn() };
    const req = { getHeader: (name) => name === 'x-forwarded-for' ? ip : '' };
    h.upgrade(res, req, {});
    expect(res.writeStatus).toHaveBeenCalledTimes(blocked ? 1 : 0);
    expect(res.upgrade).toHaveBeenCalledTimes(blocked ? 0 : 1);
  });
});
