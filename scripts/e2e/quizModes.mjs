#!/usr/bin/env node
// End-to-end check of the quiz modes on a THROWAWAY ws server: boots ws/ws.js
// on its own port with no Redis and no Mongo (both are optional at boot), in a
// scratch tmpdir so the gamestate snapshot can never swap games with a dev
// server, then drives real sockets through:
//   1. a two-player flags party: options, start, three rounds, scores, history
//   2. the rollout gates: a client without `quizModes` cannot join a quiz
//      party, and is evicted when the host switches a classic party to flags
//   3. a languages round: timer-off clamps to the mode default, choices
//      validate, points carry the speed bonus
// Zero dependencies (Node >= 22 built-in WebSocket).
//
// Usage: node scripts/e2e/quizModes.mjs [--port 3977] [--raw]

import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointsForDistance, haversineKm } from '../../shared/modes/score.js';

const { values: argv } = parseArgs({
  options: {
    port: { type: 'string', default: '3977' },
    raw: { type: 'boolean', default: false },
  },
});
const PORT = parseInt(argv.port, 10);
const URL = `ws://localhost:${PORT}/wg`;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEAM_SENTENCE = 'Play team games on worldguessr.com for now';
const QUIZ_SENTENCE = 'Play the new modes on worldguessr.com for now';
const OCEAN = [30, -40];

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
let failures = 0;
function check(cond, msg) {
  if (cond) { log('  ok  ', msg); return; }
  failures++;
  log('  FAIL', msg);
}
function expectEq(a, b, msg) { check(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`); }

// ---------- server ----------
function startServer() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-quiz-e2e-'));
  const env = {
    ...process.env,
    WS_PORT: String(PORT),
    REDIS_URI: '',
    MONGODB: '',
    DUEL_BOTS: 'off',
    TMP: scratch, TEMP: scratch, TMPDIR: scratch,
    UWS_HTTP_MAX_HEADERS_SIZE: '16384',
  };
  const child = spawn(process.execPath, ['ws/ws.js'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { if (argv.raw) process.stdout.write(`[ws] ${d}`); });
  child.stderr.on('data', (d) => process.stderr.write(`[ws!] ${d}`));
  return { child, scratch };
}

async function waitForServer(timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const ok = await new Promise((resolve) => {
      const ws = new WebSocket(URL);
      ws.onopen = () => { ws.close(); resolve(true); };
      ws.onerror = () => resolve(false);
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`ws server did not come up on ${URL}`);
}

// ---------- client ----------
class Client {
  constructor(label, { quizModes = true, teamSupport = true } = {}) {
    this.label = label;
    this.flags = { quizModes, teamSupport };
    this.game = null;
    this.inbox = [];
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(URL);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        this.send({
          type: 'verify', secret: 'not_logged_in', username: 'not_logged_in', platform: 'e2e',
          ...(this.flags.teamSupport ? { teamSupport: true } : {}),
          ...(this.flags.quizModes ? { quizModes: true } : {}),
        });
      };
      ws.onmessage = (ev) => {
        const str = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
        let json;
        try { json = JSON.parse(str); } catch { return; }
        if (argv.raw) log(`[${this.label}] <<`, str.slice(0, 400));
        if (json.type === 'verify') { this.pong = setInterval(() => this.send({ type: 'pong' }), 10000); resolve(this); }
        if (json.type === 'game') this.game = 'myId' in json ? json : { ...(this.game || {}), ...json };
        if (json.type === 'player' && this.game) {
          if (json.action === 'add') this.game.players = [...(this.game.players || []).filter((p) => p.id !== json.player.id), json.player];
          if (json.action === 'remove') this.game.players = (this.game.players || []).filter((p) => p.id !== json.id);
        }
        this.inbox.push(json);
        for (const w of [...this.waiters]) {
          if (w.pred(json, this)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(json); }
        }
      };
      ws.onerror = () => reject(new Error(`${this.label} failed to connect`));
    });
  }
  send(obj) {
    if (argv.raw) log(`[${this.label}] >>`, JSON.stringify(obj).slice(0, 300));
    this.ws.send(JSON.stringify(obj));
  }
  // Resolves on the next message matching pred (also checks the current
  // merged game state first, so a state already reached does not hang).
  waitFor(pred, what, timeoutMs = 30000) {
    if (pred(null, this)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.waiters.splice(this.waiters.findIndex((w) => w.resolve === resolve), 1);
        reject(new Error(`${this.label}: timed out waiting for ${what}`));
      }, timeoutMs);
      this.waiters.push({ pred: (j, c) => pred(j, c), resolve: (j) => { clearTimeout(t); resolve(j); } });
    });
  }
  waitState(state, extra = () => true, what = `state ${state}`) {
    return this.waitFor((_, c) => c.game?.state === state && extra(c.game), what, 40000);
  }
  waitMsg(type, extra = () => true) {
    return this.waitFor((j) => !!j && j.type === type && extra(j), `message ${type}`, 15000);
  }
  close() { clearInterval(this.pong); try { this.ws.close(); } catch {} }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const myPlayer = (c) => c.game?.players?.find((p) => p.id === c.game.myId);

// ---------- scenarios ----------
// A fresh party for A (host) and B. Used between scenarios instead of
// resetGame: that is refused while the end-of-game save is in flight, and
// with no Mongo here the save only fails after a 10s buffering timeout.
async function newParty(a, b) {
  for (const c of [a, b]) {
    if (c.game) { c.send({ type: 'leaveGame' }); c.game = null; }
  }
  await sleep(400);
  a.send({ type: 'createPrivateGame' });
  await a.waitFor((_, c) => !!c.game?.code, 'lobby with code');
  const code = a.game.code;
  b.send({ type: 'joinPrivateGame', gameCode: code });
  await b.waitFor((_, c) => c.game?.code === code, 'B joined');
  await a.waitFor((_, c) => c.game?.players?.length === 2, 'host sees 2 players');
  return code;
}

async function flagsParty(a, b) {
  log('--- flags party');
  const code = await newParty(a, b);
  check(a.game.mode === 'classic', 'new party starts classic');

  a.send({
    type: 'setPrivateGameOptions', rounds: 3, timePerRound: 10, location: 'all', displayLocation: 'World',
    nm: false, npz: false, showRoadName: true, mode: 'flags', region: 'Europe',
  });
  await a.waitFor((_, c) => c.game?.mode === 'flags' && c.game.generated === 3 && c.game.locations?.length === 3, 'flags rounds generated');
  check(a.game.region === 'Europe', 'region applied');
  check(a.game.locations.every((l) => l.mode === 'flags' && l.country && Number.isFinite(l.lat) && Number.isFinite(l.long)), 'every round is a flags location');
  check(a.game.maxDist === 20000, 'maxDist 20000');
  await b.waitFor((_, c) => c.game?.mode === 'flags' && c.game.locations?.length === 3, 'B sees flags rounds');

  a.send({ type: 'startGameHost' });
  await a.waitState('getready');
  const locations = a.game.locations;
  const expectedB = [];
  for (let round = 1; round <= 3; round++) {
    await a.waitState('guess', (g) => g.curRound === round, `guess round ${round}`);
    await b.waitState('guess', (g) => g.curRound === round, `B guess round ${round}`);
    const loc = locations[round - 1];
    // B clicks another round's country: a near miss inside Europe, so the
    // distance scoring at missMaxDist produces a real number, not 0.
    const miss = locations[round % 3];
    a.send({ type: 'place', latLong: [loc.lat, loc.long], final: true, round });
    b.send({ type: 'place', latLong: [miss.lat, miss.long], final: true, round });
    expectedB.push(pointsForDistance(haversineKm(loc.lat, loc.long, miss.lat, miss.long), 5000));
    await a.waitFor((_, c) => (c.game?.state === 'getready' || c.game?.state === 'end') && c.game.roundPoints?.round === round, `round ${round} scored`);
    const rp = a.game.roundPoints.points;
    expectEq(rp[a.game.myId], 5000, `round ${round}: host inside the country scores 5000`);
    expectEq(rp[b.game.myId], expectedB[round - 1], `round ${round}: neighbouring-country click scores by distance at missMaxDist`);
  }
  await a.waitState('end');
  const scoreOf = (c, id) => c.game.players.find((p) => p.id === id)?.score;
  expectEq(scoreOf(a, a.game.myId), 15000, 'host total 15000');
  expectEq(scoreOf(a, b.game.myId), expectedB.reduce((s, p) => s + p, 0), 'B total = sum of misses');
  check(a.game.roundHistory?.length === 3, 'roundHistory has 3 rounds');
  check(a.game.roundHistory?.every((r) => r.location?.mode === 'flags' && r.players[a.game.myId]?.points === 5000), 'roundHistory carries mode and points');
  check(expectedB.some((p) => p > 0 && p < 5000), 'at least one miss scored strictly between 0 and 5000');
  return code;
}

async function gates(a, b) {
  log('--- rollout gates');
  const code = await newParty(a, b);
  a.send({ type: 'setPrivateGameOptions', rounds: 3, timePerRound: 10, location: 'all', displayLocation: 'World', mode: 'flags', region: 'all' });
  await a.waitFor((_, g) => g.game?.mode === 'flags', 'party set to flags');

  const c = await new Client('C-flagless', { quizModes: false }).connect();
  c.send({ type: 'joinPrivateGame', gameCode: code });
  const err = await c.waitMsg('gameJoinError');
  expectEq(err.error, QUIZ_SENTENCE, 'flagless client refused with the sentence');

  // Back to classic, flagless joins, host flips to flags: flagless is evicted.
  a.send({ type: 'setPrivateGameOptions', rounds: 3, timePerRound: 10, location: 'all', displayLocation: 'World', mode: 'classic', region: 'all' });
  await a.waitFor((_, g) => g.game?.mode === 'classic', 'back to classic');
  c.send({ type: 'joinPrivateGame', gameCode: code });
  await c.waitFor((_, g) => !!g.game?.code, 'flagless joined the classic party');
  await a.waitFor((_, g) => g.game?.players?.length === 3, 'host sees 3 players');
  a.send({ type: 'setPrivateGameOptions', rounds: 3, timePerRound: 10, location: 'all', displayLocation: 'World', mode: 'flags', region: 'all' });
  const toast = await c.waitMsg('toast', (j) => j.key === QUIZ_SENTENCE);
  check(!!toast, 'evicted member gets the sentence toast');
  const kicked = await a.waitMsg('toast', (j) => j.key === 'playerKicked');
  check(!!kicked, 'host gets playerKicked');
  await a.waitFor((_, g) => g.game?.players?.length === 2 && g.game.mode === 'flags', 'roster back to 2, mode flags');
  c.close();

  // A flagless HOST cannot switch to a quiz mode at all.
  const h = await new Client('H-flagless', { quizModes: false }).connect();
  h.send({ type: 'createPrivateGame' });
  await h.waitFor((_, g) => !!g.game?.code, 'flagless host lobby');
  h.send({ type: 'setPrivateGameOptions', rounds: 3, timePerRound: 10, location: 'all', displayLocation: 'World', mode: 'flags', region: 'all' });
  await sleep(500);
  check(h.game.mode === 'classic', 'flagless host stays classic');
  h.close();
}

async function languages(a, b) {
  log('--- languages');
  a.send({ type: 'setPrivateGameOptions', rounds: 1, timePerRound: 86400, location: 'all', displayLocation: 'World', mode: 'languages', region: 'all' });
  await a.waitFor((_, g) => g.game?.mode === 'languages' && g.game.locations?.length === 1, 'languages round generated');
  expectEq(a.game.timePerRound, 20000, 'timer off clamps to the mode default (20s)');
  const loc = a.game.locations[0];
  check(Array.isArray(loc.choices) && loc.choices.length === 6 && loc.choices.includes(loc.lang), '6 choices including the answer');
  check(typeof loc.text === 'string' && loc.text.length > 40, 'round carries the text sample');
  check(a.game.region === 'all', 'region ignored for a mode without regions');

  a.send({ type: 'startGameHost' });
  await a.waitState('guess', (g) => g.curRound === 1);
  await b.waitState('guess', (g) => g.curRound === 1);
  const wrong = loc.choices.find((c) => c !== loc.lang);
  b.send({ type: 'place', choice: 'zz', final: true, round: 1 }); // invalid: dropped
  await sleep(300);
  check(!myPlayer(b)?.final, 'invalid choice is dropped');
  b.send({ type: 'place', latLong: [loc.lat, loc.long], final: true, round: 1 }); // coordinates in a choice mode: ignored
  await sleep(300);
  check(!myPlayer(b)?.final, 'coordinates are ignored in a choice mode');
  a.send({ type: 'place', choice: loc.lang, final: true, round: 1 });
  const placed = await b.waitMsg('place', (j) => j.id === a.game.myId && j.final);
  expectEq(placed.choice, loc.lang, 'final place broadcast carries the choice');
  b.send({ type: 'place', choice: wrong, final: true, round: 1 });
  await a.waitFor((_, g) => g.game?.state === 'end' && g.game.roundPoints?.round === 1, 'languages round scored');
  const rp = a.game.roundPoints.points;
  check(rp[a.game.myId] >= 2500 && rp[a.game.myId] <= 5000, `correct pick scores 2500..5000 (${rp[a.game.myId]})`);
  expectEq(rp[b.game.myId], 0, 'wrong pick scores 0');
  const hist = a.game.roundHistory?.[0];
  expectEq(hist?.players?.[a.game.myId]?.choice, loc.lang, 'history records the host choice');
  expectEq(hist?.players?.[b.game.myId]?.choice, wrong, 'history records the wrong choice');
  check(Math.abs(hist?.players?.[a.game.myId]?.lat - loc.lat) < 1e-6, 'choice landed at the label point');
}

// ---------- main ----------
const { child, scratch } = startServer();
let exitCode = 1;
try {
  await waitForServer();
  log(`ws up on ${URL}`);
  const a = await new Client('A').connect();
  const b = await new Client('B').connect();
  await flagsParty(a, b);
  await gates(a, b);
  await newParty(a, b);
  await languages(a, b);
  a.close(); b.close();
  exitCode = failures ? 1 : 0;
  log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
} catch (e) {
  log('ERROR', e.stack || e.message);
} finally {
  child.kill();
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
  process.exit(exitCode);
}
