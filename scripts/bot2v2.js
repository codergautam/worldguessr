#!/usr/bin/env node
// Multiplayer test bots — spawns guest bots that queue for 2v2 duels OR play
// intra-party team games, randomly guessing every round. Zero dependencies
// (uses Node >= 21 built-in WebSocket).
//
// Usage:
//   node scripts/bot2v2.js [--bots N] [--url ws://host/wg] [--skill 0..1] [--once] [--raw]
//   node scripts/bot2v2.js --party N [--team-scoring average|closest] [--ffa]
//   node scripts/bot2v2.js --join CODE --bots N
//
// 2v2 queue scenarios by bot count:
//   --bots 2  (default) one bot DUO queues as your opponents.
//   --bots 3  bot duo (opponents) + solo bot (your teammate) — solo-queue in
//             the web UI with ONE browser window.
//   --bots 4  two bot duos play each other — fully autonomous smoke test.
//
// Party scenarios:
//   --party N          N bots form a private party: bot host creates it,
//                      enables TEAM mode (unless --ffa), shuffles, moves one
//                      player manually, starts, plays, then loops via
//                      play-again (resetGame). Logs team totals every round.
//   --join CODE        bots join YOUR party by code and just play along —
//                      fill your browser-hosted party to test host controls
//                      (drag, shuffle, kick, scoring) against live players.
//   --team-scoring     'average' (default) or 'closest'
//   --rounds/--time    party game length (default 3 rounds, 15s) for fast loops
//
// Common flags:
//   --url    WS endpoint       (default ws://localhost:3002/wg)
//   --skill  0 = pure random guesses (default), 1 = near-perfect
//   --once   play a single match per group then exit (default: loop forever)
//   --raw    dump every inbound/outbound frame as JSON
//
// All bots connect as guests — no accounts touched, no ELO at stake.

import { parseArgs } from 'node:util';
import { EventEmitter } from 'node:events';

const { values: argv } = parseArgs({
  options: {
    bots: { type: 'string', default: '2' },
    party: { type: 'string' },
    join: { type: 'string' },
    'team-scoring': { type: 'string', default: 'closest' },
    ffa: { type: 'boolean', default: false },
    rounds: { type: 'string', default: '3' },
    time: { type: 'string', default: '15' },
    linger: { type: 'string', default: '5' },
    'no-start': { type: 'boolean', default: false },
    url: { type: 'string', default: 'ws://localhost:3002/wg' },
    skill: { type: 'string', default: '0' },
    once: { type: 'boolean', default: false },
    raw: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (argv.help) {
  console.log('2v2 queue: node scripts/bot2v2.js [--bots N] [--url ws://host/wg] [--skill 0..1] [--once] [--raw]');
  console.log('bot party: node scripts/bot2v2.js --party N [--team-scoring average|closest] [--ffa] [--rounds 3] [--time 15]');
  console.log('fill yours: node scripts/bot2v2.js --join CODE --bots N');
  process.exit(0);
}

const BOT_COUNT = Math.max(1, Math.min(16, parseInt(argv.bots, 10) || 2));
const PARTY_SIZE = argv.party ? Math.max(2, Math.min(16, parseInt(argv.party, 10) || 4)) : 0;
const JOIN_CODE = argv.join || null;
const TEAM_SCORING = argv['team-scoring'] === 'average' ? 'average' : 'closest';
const PARTY_FFA = argv.ffa;
const PARTY_ROUNDS = Math.max(1, Math.min(20, parseInt(argv.rounds, 10) || 3));
const PARTY_TIME = Math.max(10, Math.min(300, parseInt(argv.time, 10) || 15));
// How long bots sit on the results screen before play-again — bump this when
// a human wants time to inspect the end screen (e.g. --linger 30).
const PARTY_LINGER_MS = Math.max(2, Math.min(120, parseInt(argv.linger, 10) || 5)) * 1000;
// Hold the lobby open indefinitely (host never presses Start) — for testing
// the waiting-room UI by hand, e.g. joining from a browser as a non-host.
const NO_START = argv['no-start'];
const URL = argv.url;
const SKILL = Math.max(0, Math.min(1, parseFloat(argv.skill) || 0));
const ONCE = argv.once;
const RAW = argv.raw;

// ---------- logging ----------
const useColor = process.stdout.isTTY;
const COLORS = [36, 33, 35, 32, 34, 91, 93, 95, 96, 92];
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
const ts = () => new Date().toISOString().slice(11, 23);

function makeLogger(label, colorIdx) {
  const tag = paint(COLORS[colorIdx % COLORS.length], `[${label}]`.padEnd(6));
  return (category, ...args) => {
    const cat = category === 'ERROR' ? paint(31, category.padEnd(7)) : category.padEnd(7);
    console.log(`${ts()} ${tag} ${cat}`, ...args);
  };
}
const mainLog = makeLogger('MAIN', 9);

// ---------- geo helpers ----------
function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function randomWorldPoint() {
  return [-50 + Math.random() * 115, -180 + Math.random() * 360];
}

function makeGuess(trueLoc, skill) {
  if (skill <= 0 || !trueLoc) return randomWorldPoint();
  // skill 1 → ~0.05° (~5 km) off; skill 0.5 → up to ~20° off
  const maxDeg = Math.max(0.05, (1 - skill) * 40);
  const dist = Math.random() * maxDeg;
  const bearing = Math.random() * 2 * Math.PI;
  const lat = Math.max(-85, Math.min(85, trueLoc.lat + dist * Math.cos(bearing)));
  const lng = ((trueLoc.long + dist * Math.sin(bearing) + 540) % 360) - 180;
  return [lat, lng];
}

const rand = (min, max) => min + Math.random() * (max - min);
const stats = { played: {}, wins: {}, errors: 0 };

// ---------- Bot ----------
class Bot extends EventEmitter {
  constructor(label, colorIdx) {
    super();
    this.label = label;
    this.log = makeLogger(label, colorIdx);
    this.ws = null;
    this.game = null; // merged latest game state
    this.guestName = null;
    this.verified = false;
    this.intentionalClose = false;
    this.lastGuessedRound = 0;
    this.lastEmoteRound = 0;
    this.timers = new Set();
    this.pongInterval = null;
    this.prevState = null;
    this.prevScores = null;
  }

  after(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.log('WS', `connecting to ${URL}`);
      const ws = new WebSocket(URL);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this.log('WS', 'connected, verifying as guest');
        this.send({ type: 'verify', secret: 'not_logged_in', username: 'not_logged_in', platform: 'bot', teamSupport: true });
      };
      ws.onmessage = (ev) => {
        const str = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
        let json;
        try {
          json = JSON.parse(str);
        } catch {
          this.log('ERROR', 'unparseable frame', str.slice(0, 200));
          return;
        }
        if (RAW) this.log('RAW', '<<', str.slice(0, 500));
        try {
          this.onMessage(json, resolve);
        } catch (e) {
          this.log('ERROR', 'handler threw', e.stack || e.message);
        }
      };
      ws.onclose = (ev) => {
        clearInterval(this.pongInterval);
        this.clearTimers();
        if (this.intentionalClose) {
          this.log('WS', 'closed (intentional)');
        } else {
          this.log('ERROR', `socket closed unexpectedly (code ${ev.code})`);
          stats.errors++;
          this.emit('dead');
        }
      };
      ws.onerror = () => {
        this.log('ERROR', 'socket error');
        reject(new Error(`${this.label} failed to connect`));
      };
    });
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('ERROR', `tried to send while socket not open:`, obj.type);
      return;
    }
    if (RAW) this.log('RAW', '>>', JSON.stringify(obj).slice(0, 300));
    this.ws.send(JSON.stringify(obj));
  }

  shutdown() {
    this.intentionalClose = true;
    this.clearTimers();
    clearInterval(this.pongInterval);
    try {
      this.ws?.close();
    } catch {}
  }

  playerName(id) {
    if (id === this.game?.myId) return `${this.label}(me)`;
    const p = this.game?.players?.find((p) => p.id === id);
    return p ? `${p.username}${p.team ? `[${p.team.toUpperCase()}]` : ''}` : id?.slice(0, 8);
  }

  get inMatch() {
    return !!(this.game && this.game.team2v2 && this.game.public);
  }

  // Private party (not the 2v2 staging shell) in any state.
  get inParty() {
    return !!(this.game && !this.game.public && !this.game.is2v2Lobby && this.game.code);
  }

  // Any game the bot should actively play rounds in.
  get inActiveGame() {
    return !!(this.game && ['getready', 'guess', 'end'].includes(this.game.state))
      && (this.inMatch || this.inParty);
  }

  onMessage(json, resolveConnect) {
    switch (json.type) {
      case 'verify':
        this.verified = true;
        this.guestName = json.guestName || this.guestName;
        this.log('AUTH', `verified as ${bold(this.guestName || 'account user')}`);
        // web client sends a pong every 10s to stay alive
        this.pongInterval = setInterval(() => this.send({ type: 'pong' }), 10000);
        resolveConnect?.(this);
        this.emit('verified');
        break;

      case 'game': {
        // full snapshots carry myId (getInitialSendState); partials merge
        this.game = 'myId' in json ? json : { ...(this.game || {}), ...json };
        this.onGameUpdate();
        this.emit('update');
        break;
      }

      case 'player':
        if (!this.game) break;
        if (json.action === 'add') {
          this.game.players = [...(this.game.players || []).filter((p) => p.id !== json.player.id), json.player];
          this.log('LOBBY', `+ ${json.player.username} joined (${this.game.players.length} in lobby)`);
        } else if (json.action === 'remove') {
          this.game.players = (this.game.players || []).filter((p) => p.id !== json.id);
          this.log('LOBBY', `- player left (${this.game.players.length} remain)`);
        }
        this.emit('update');
        break;

      case 'enter2v2Queue':
        this.log('QUEUE', bold(`queued — searching for ${json.stage === 'teammate' ? 'a TEAMMATE (stage 1)' : 'OPPONENTS (stage 2)'}`));
        this.emit('queued', json.stage);
        break;

      case 'place': {
        const who = this.playerName(json.id);
        if (json.id === this.game?.myId) break; // own echo
        const loc = this.game?.locations?.[(this.game?.curRound || 1) - 1];
        const dist = json.latLong && loc ? ` (${haversineKm(json.latLong, [loc.lat, loc.long])} km off)` : '';
        this.log('GUESS', `${who} ${json.final ? 'locked FINAL' : 'placed interim' + (json.teammate ? ' (teammate)' : '')} guess${dist}`);
        break;
      }

      case 'duelEnd': {
        const label = json.teamGame ? 'totals' : 'HP';
        const scores = json.teamScores ? ` | ${label} 1:${json.teamScores.a} 2:${json.teamScores.b}` : '';
        const result = json.draw ? 'DRAW' : json.winner ? 'WON' : 'LOST';
        const kind = json.teamGame ? `team party (${json.teamScoring})` : 'match';
        this.log('END', bold(`${kind} over — I ${result}`) + ` (winning team: ${json.winningTeam === 'a' ? '1' : json.winningTeam === 'b' ? '2' : '-'})${scores} after ${Math.round((json.timeElapsed || 0) / 1000)}s`);
        this.emit('duelEnd', json);
        break;
      }

      case 'gameShutdown':
        this.log(this.inMatch ? 'END' : 'LOBBY', `gameShutdown received${this.inMatch ? '' : ' (staging lobby dissolved — expected while queued)'}`);
        this.game = null;
        this.emit('shutdown');
        break;

      case 'gameJoinError':
        this.log('ERROR', `join failed: ${json.error}`);
        stats.errors++;
        this.emit('joinError', json.error);
        break;

      case 'toast':
        this.log(json.toastType === 'error' ? 'ERROR' : 'INFO', `toast: ${json.key}${json.name ? ` (${json.name})` : ''}`);
        if (json.toastType === 'error') stats.errors++;
        break;

      case 'error':
        this.log('ERROR', `server error: ${json.message}`);
        stats.errors++;
        break;

      case 'emote':
        if (json.id !== this.game?.myId) this.log('EMOTE', `${json.name} sent emote #${json.emote}`);
        break;

      case 'gameCancelled':
        this.log('END', 'game cancelled pregame (a player left during countdown)');
        this.emit('cancelled');
        break;

      // routine noise — only surfaced with --raw
      case 't':
      case 'cnt':
      case 'restartQueued':
      case 'streak':
      case 'friends':
      case 'maxDist':
      case 'generating':
      case 'timeSync':
        break;

      default:
        this.log('MSG', `unhandled '${json.type}':`, JSON.stringify(json).slice(0, 250));
    }
  }

  onGameUpdate() {
    const g = this.game;
    if (!g) return;

    if (g.is2v2Lobby && g.code && this.prevState !== 'lobby:' + g.code) {
      this.prevState = 'lobby:' + g.code;
      this.log('LOBBY', `in 2v2 staging lobby ${bold(g.code)} (${g.players?.length || 0} player(s), host: ${g.host})${g.autoQueueInMs ? ` — auto-queueing in ${Math.round(g.autoQueueInMs / 1000)}s` : ''}`);
      return;
    }

    // Party lobby: log roster + team split whenever the composition changes.
    if (this.inParty && g.state === 'waiting') {
      const teamSplit = g.teamGame
        ? ` | TEAMS on (${g.teamScoring}, pick=${!!g.allowTeamPick}) — 1: [${(g.players || []).filter((p) => p.team === 'a').map((p) => p.username).join(', ')}] 2: [${(g.players || []).filter((p) => p.team === 'b').map((p) => p.username).join(', ')}]`
        : '';
      const lobbyKey = `plobby:${g.code}:${(g.players || []).map((p) => `${p.id}${p.team || ''}`).join(',')}:${g.teamGame}:${g.teamScoring}:${g.allowTeamPick}`;
      if (this.prevState !== lobbyKey) {
        this.prevState = lobbyKey;
        this.log('LOBBY', `party ${bold(g.code)} (${g.players?.length || 0} players, host: ${g.host})${teamSplit}`);
      }
      this.emit('partyLobby');
      return;
    }

    if (!this.inActiveGame) return;

    const stateKey = `${g.state}:${g.curRound}`;
    if (stateKey !== this.prevState) {
      this.prevState = stateKey;
      if (g.state === 'getready' && g.curRound === 1 && g.players) {
        const me = g.players.find((p) => p.id === g.myId);
        if (g.team2v2 || g.teamGame) {
          const teamA = g.players.filter((p) => p.team === 'a').map((p) => p.username).join(' + ');
          const teamB = g.players.filter((p) => p.team === 'b').map((p) => p.username).join(' + ');
          const kind = g.team2v2 ? 'MATCH FOUND' : `PARTY TEAM GAME (${g.teamScoring})`;
          this.log('MATCH', bold(`${kind} — [1] ${teamA} vs [2] ${teamB}`) + ` (I'm on team ${me?.team === 'a' ? '1' : '2'}, ${g.rounds} rounds, ${(g.timePerRound || 0) / 1000}s each)`);
        } else {
          this.log('MATCH', bold(`PARTY FFA started`) + ` — ${g.players.map((p) => p.username).join(', ')} (${g.rounds} rounds)`);
        }
      } else if (g.state === 'getready' && g.curRound <= g.rounds) {
        this.log('ROUND', `round ${g.curRound}/${g.rounds} starting soon`);
      } else if (g.state === 'guess' && g.curRound <= g.rounds) {
        const loc = g.locations?.[g.curRound - 1];
        this.log('ROUND', bold(`round ${g.curRound}/${g.rounds} GUESS`) + (loc ? ` — location: ${loc.lat.toFixed(3)},${loc.long.toFixed(3)} (${loc.country || '??'})` : ''));
        this.scheduleGuess();
        this.maybeEmote();
      } else if (g.state === 'end') {
        this.log('MATCH', 'state=end (results screen)');
        this.emit('gameEnded');
      }
    }

    if (g.teamScores && JSON.stringify(g.teamScores) !== JSON.stringify(this.prevScores)) {
      const d = (k) => (this.prevScores ? g.teamScores[k] - this.prevScores[k] : 0);
      const fmt = (k) => `${g.teamScores[k]}${d(k) ? ` (${d(k) > 0 ? '+' : ''}${d(k)})` : ''}`;
      const label = g.teamGame ? 'TOTALS' : 'HP';
      const roundScores = g.teamRoundScores?.scores
        ? ` [round ${g.teamRoundScores.round}: ${g.teamRoundScores.scores.a} vs ${g.teamRoundScores.scores.b}]`
        : '';
      this.log('SCORE', bold(`${label} — 1: ${fmt('a')} | 2: ${fmt('b')}`) + (g.teamGame ? roundScores : ''));
      this.prevScores = { ...g.teamScores };
    }
  }

  scheduleGuess() {
    const g = this.game;
    const round = g.curRound;
    if (this.lastGuessedRound === round) return;
    this.lastGuessedRound = round;

    const loc = g.locations?.[round - 1];
    const finalGuess = makeGuess(loc, SKILL);
    const maxDelay = Math.min(12000, (g.timePerRound || 30000) - 3000);
    const delay = rand(2500, maxDelay);

    // interim placement first — exercises the teammate guess-streaming path
    this.after(delay * rand(0.4, 0.7), () => {
      if (this.game?.state !== 'guess' || this.game.curRound !== round) return;
      this.send({ type: 'place', latLong: randomWorldPoint(), final: false, round });
      this.log('GUESS', `placed interim marker (round ${round})`);
    });

    this.after(delay, () => {
      if (this.game?.state !== 'guess' || this.game.curRound !== round) return;
      // re-place at the real spot then lock: server prefers interim coords,
      // mirroring how the web client places-then-confirms
      this.send({ type: 'place', latLong: finalGuess, final: false, round });
      this.send({ type: 'place', latLong: finalGuess, final: true, round });
      const dist = loc ? ` — ${haversineKm(finalGuess, [loc.lat, loc.long])} km off` : '';
      this.log('GUESS', bold(`FINAL guess sent (round ${round})`) + ` @ ${finalGuess[0].toFixed(2)},${finalGuess[1].toFixed(2)}${dist}`);
    });
  }

  maybeEmote() {
    if (Math.random() > 0.3 || this.lastEmoteRound === this.game.curRound) return;
    this.lastEmoteRound = this.game.curRound;
    this.after(rand(1000, 8000), () => {
      if (!this.inMatch) return;
      const emote = Math.floor(Math.random() * 8);
      this.send({ type: 'emote', emote });
      this.log('EMOTE', `sent emote #${emote}`);
    });
  }
}

// ---------- group orchestration ----------
// A group is a duo (two bots: captain + partner) or a solo bot. It forms a
// staging lobby, queues, plays, and loops.
class Group {
  constructor(name, bots) {
    this.name = name;
    this.bots = bots;
    this.captain = bots[0];
    this.phase = 'idle';
    this.matchHandled = false;
    this.queuedAt = null;
    this.formTimer = null;

    for (const bot of bots) {
      bot.on('duelEnd', (json) => this.onMatchEnd(json, bot));
      bot.on('dead', () => this.hardRestart(`${bot.label} socket died`));
      bot.on('joinError', () => this.hardRestart('lobby join failed'));
      bot.on('queued', () => {
        this.phase = 'queued';
        this.queuedAt = Date.now();
      });
      bot.on('cancelled', () => {
        // server auto-requeues regrouped lobbies; just track phase
        this.phase = 'queued';
      });
      bot.on('update', () => {
        if (bot.inMatch && this.phase === 'queued') {
          this.phase = 'match';
          this.queuedAt = null;
        }
      });
    }

    // queue watchdog
    setInterval(() => {
      if (this.phase === 'queued' && this.queuedAt) {
        mainLog('QUEUE', `${this.name} still searching (${Math.round((Date.now() - this.queuedAt) / 1000)}s)…`);
      }
    }, 20000).unref();
  }

  async start() {
    await Promise.all(this.bots.map((b) => b.connect()));
    this.form();
  }

  form() {
    this.phase = 'forming';
    this.matchHandled = false;
    for (const b of this.bots) {
      b.game = null;
      b.prevState = null;
      b.prevScores = null;
      b.lastGuessedRound = 0;
      b.lastEmoteRound = 0;
    }
    mainLog('LOBBY', `${this.name}: creating 2v2 staging lobby`);
    this.captain.send({ type: 'createPrivateGame', mode: '2v2' });

    const onCaptainUpdate = () => {
      const g = this.captain.game;
      if (!g || !g.is2v2Lobby || !g.code) return;

      if (this.bots.length === 1) {
        // solo bot: queue immediately (stage 1 — teammate search)
        this.captain.removeListener('update', onCaptainUpdate);
        this.captain.send({ type: 'find2v2Match' });
        this.phase = 'queued';
        this.queuedAt = Date.now();
        return;
      }

      if (this.phase === 'forming') {
        this.phase = 'joining';
        mainLog('LOBBY', `${this.name}: partner joining lobby ${g.code}`);
        this.bots[1].send({ type: 'joinPrivateGame', gameCode: g.code });
      }
      if (this.phase === 'joining' && (g.players?.length || 0) >= 2) {
        this.phase = 'queueing';
        this.captain.removeListener('update', onCaptainUpdate);
        mainLog('QUEUE', `${this.name}: duo complete — Find Match`);
        this.captain.send({ type: 'find2v2Match' });
      }
    };
    this.captain.on('update', onCaptainUpdate);
    onCaptainUpdate();

    clearTimeout(this.formTimer);
    this.formTimer = setTimeout(() => {
      if (['forming', 'joining', 'queueing'].includes(this.phase)) {
        this.captain.removeListener('update', onCaptainUpdate);
        this.hardRestart(`lobby formation stalled in phase '${this.phase}'`);
      }
    }, 15000);
  }

  onMatchEnd(json, bot) {
    if (this.matchHandled) return;
    this.matchHandled = true;
    this.phase = 'ended';
    const won = !json.draw && json.winner;
    stats.played[this.name] = (stats.played[this.name] || 0) + 1;
    stats.wins[this.name] = (stats.wins[this.name] || 0) + (won ? 1 : 0);
    mainLog('END', bold(`${this.name}: match #${stats.played[this.name]} finished — ${json.draw ? 'draw' : won ? `${this.name} won` : `${this.name} lost`}`));

    if (ONCE) {
      finishedGroups.add(this.name);
      if (finishedGroups.size === groups.length) {
        printSummary();
        for (const g of groups) g.bots.forEach((b) => b.shutdown());
        process.exit(0);
      }
      return;
    }

    // linger on the results screen like a human, then leave and requeue
    setTimeout(() => {
      mainLog('LOBBY', `${this.name}: leaving finished game, requeueing`);
      for (const b of this.bots) b.send({ type: 'leaveGame' });
      setTimeout(() => this.form(), 1500);
    }, 4000);
  }

  hardRestart(reason) {
    if (this.phase === 'restarting') return;
    this.phase = 'restarting';
    mainLog('ERROR', `${this.name}: hard restart — ${reason}`);
    stats.errors++;
    for (const b of this.bots) b.shutdown();
    setTimeout(async () => {
      try {
        await Promise.all(this.bots.map((b) => b.connect()));
        this.form();
      } catch (e) {
        mainLog('ERROR', `${this.name}: reconnect failed (${e.message}), retrying in 5s`);
        this.phase = 'idle';
        setTimeout(() => this.hardRestart('retry'), 5000);
      }
    }, 2000);
  }
}

// A party of bots: host bot creates a private party, others join by code,
// host configures team mode + options, starts, and loops via resetGame.
class PartyGroup {
  constructor(name, bots) {
    this.name = name;
    this.bots = bots;
    this.host = bots[0];
    this.phase = 'idle';
    this.matchHandled = false;
    this.joinedCount = 0;

    for (const bot of bots) {
      bot.on('dead', () => this.hardRestart(`${bot.label} socket died`));
      bot.on('joinError', (err) => this.hardRestart(`party join failed: ${err}`));
      bot.on('duelEnd', () => this.onGameOver('duelEnd'));
      bot.on('gameEnded', () => this.onGameOver('end state'));
    }
    // 'update' fires on both full game payloads AND player add/remove
    // broadcasts — roster growth only arrives via the latter for the host.
    this.host.on('update', () => this.onLobbyUpdate());
  }

  async start() {
    await Promise.all(this.bots.map((b) => b.connect()));
    this.form();
  }

  form() {
    this.phase = 'forming';
    this.matchHandled = false;
    for (const b of this.bots) {
      b.game = null;
      b.prevState = null;
      b.prevScores = null;
      b.lastGuessedRound = 0;
      b.lastEmoteRound = 0;
    }
    mainLog('LOBBY', `${this.name}: host creating private party`);
    this.host.send({ type: 'createPrivateGame' });
  }

  onLobbyUpdate() {
    const g = this.host.game;
    if (!g?.code || g.state !== 'waiting') return;

    if (this.phase === 'forming') {
      this.phase = 'joining';
      mainLog('LOBBY', `${this.name}: ${this.bots.length - 1} bot(s) joining party ${g.code}`);
      this.bots.slice(1).forEach((b, i) => {
        b.after(200 * (i + 1), () => b.send({ type: 'joinPrivateGame', gameCode: g.code }));
      });
    }

    if (this.phase === 'joining' && (g.players?.length || 0) >= this.bots.length) {
      this.phase = 'configuring';
      mainLog('LOBBY', `${this.name}: party full — configuring (${PARTY_ROUNDS} rounds, ${PARTY_TIME}s${PARTY_FFA ? ', FFA' : `, team mode: ${TEAM_SCORING}`})`);
      this.host.send({
        type: 'setPrivateGameOptions',
        rounds: PARTY_ROUNDS, timePerRound: PARTY_TIME, location: 'all',
        nm: false, npz: false, showRoadName: true, displayLocation: 'World'
      });
      if (!PARTY_FFA) {
        this.host.send({ type: 'setTeamConfig', enabled: true, scoring: TEAM_SCORING, allowTeamPick: true });
        this.host.after(600, () => this.host.send({ type: 'shuffleTeams' }));
        // Exercise both assignment paths: a non-host self-move (allowTeamPick)
        // and a host-move REBALANCING from the larger team (never empties one).
        this.host.after(1200, () => {
          const roster = this.host.game?.players || [];
          const nonHostBot = this.bots[1];
          const self = roster.find((p) => p.id === nonHostBot?.game?.myId);
          if (self?.team) nonHostBot.send({ type: 'setPlayerTeam', playerId: self.id, team: self.team === 'a' ? 'b' : 'a' });
        });
        this.host.after(1500, () => {
          const roster = this.host.game?.players || [];
          const count = (t) => roster.filter((p) => p.team === t).length;
          const [big, small] = count('a') >= count('b') ? ['a', 'b'] : ['b', 'a'];
          if (count(big) < 2) return; // moving would empty the larger team
          const mover = roster.find((p) => p.team === big && p.id !== this.host.game?.myId) || roster.find((p) => p.team === big);
          if (mover) this.host.send({ type: 'setPlayerTeam', playerId: mover.id, team: small });
        });
      }
      this.phase = 'startPending';
    }

    if (this.phase === 'startPending' && NO_START) return; // lobby held open for manual testing

    if (this.phase === 'startPending'
        && (g.players?.length || 0) >= this.bots.length
        && g.rounds && (g.generated ?? 0) >= g.rounds) {
      this.phase = 'starting';
      // Small beat so the team moves above land before start.
      this.host.after(1800, () => {
        const cur = this.host.game;
        if (!cur || cur.state !== 'waiting') { this.phase = 'startPending'; return; }
        if (!PARTY_FFA && cur.teamGame) {
          const roster = cur.players || [];
          const aCnt = roster.filter((p) => p.team === 'a').length;
          const bCnt = roster.filter((p) => p.team === 'b').length;
          if (!aCnt || !bCnt) {
            mainLog('LOBBY', `${this.name}: team empty (${aCnt}v${bCnt}) — reshuffling before start`);
            this.host.send({ type: 'shuffleTeams' });
            this.phase = 'startPending';
            return;
          }
        }
        mainLog('MATCH', `${this.name}: host starting game`);
        this.host.send({ type: 'startGameHost' });
        this.phase = 'playing';
        this.startedAt = Date.now();
      });
    }

    // Start-failure watchdog: if the server refused startGameHost (e.g. a race
    // left a team empty), the game stays 'waiting' — re-enter the start loop.
    if (this.phase === 'playing' && g.state === 'waiting' && Date.now() - (this.startedAt || 0) > 5000) {
      mainLog('LOBBY', `${this.name}: start did not take — retrying`);
      this.phase = 'startPending';
    }
  }

  onGameOver(via) {
    if (this.matchHandled) return;
    this.matchHandled = true;
    this.phase = 'ended';
    stats.played[this.name] = (stats.played[this.name] || 0) + 1;
    mainLog('END', bold(`${this.name}: party game #${stats.played[this.name]} finished (${via})`));

    if (ONCE) {
      finishedGroups.add(this.name);
      if (finishedGroups.size === groups.length) {
        printSummary();
        for (const g of groups) g.bots.forEach((b) => b.shutdown());
        process.exit(0);
      }
      return;
    }

    // Play again: host resets the same lobby — teams/config must survive.
    setTimeout(() => {
      mainLog('LOBBY', `${this.name}: host pressing play again (resetGame)`);
      this.matchHandled = false;
      this.phase = 'startPending';
      for (const b of this.bots) { b.prevState = null; b.prevScores = null; b.lastGuessedRound = 0; }
      this.host.send({ type: 'resetGame' });
    }, PARTY_LINGER_MS);
  }

  hardRestart(reason) {
    if (this.phase === 'restarting') return;
    this.phase = 'restarting';
    mainLog('ERROR', `${this.name}: hard restart — ${reason}`);
    stats.errors++;
    for (const b of this.bots) b.shutdown();
    setTimeout(async () => {
      try {
        await Promise.all(this.bots.map((b) => b.connect()));
        this.form();
      } catch (e) {
        mainLog('ERROR', `${this.name}: reconnect failed (${e.message})`);
        process.exit(1);
      }
    }, 2000);
  }
}

// Bots that join a human-hosted party by code and just play along. Passive:
// they never start/config anything; when the party shuts down, they exit.
class JoinGroup {
  constructor(name, bots, code) {
    this.name = name;
    this.bots = bots;
    this.code = code;
    this.alive = new Set(bots.map((b) => b.label));

    for (const bot of bots) {
      bot.on('verified', () => {
        bot.send({ type: 'joinPrivateGame', gameCode: code });
      });
      bot.on('joinError', (err) => {
        mainLog('ERROR', `${bot.label}: could not join party ${code}: ${err}`);
        this.retire(bot);
      });
      bot.on('shutdown', () => {
        // Party closed or bot was kicked — leave gracefully, don't rejoin
        // (rejoin-after-kick would fight the host).
        if (!bot.game) {
          mainLog('LOBBY', `${bot.label}: party over (shutdown/kick) — retiring`);
          this.retire(bot);
        }
      });
      bot.on('dead', () => this.retire(bot));
      bot.on('duelEnd', () => {
        stats.played[this.name] = (stats.played[this.name] || 0) + 1;
      });
    }
  }

  retire(bot) {
    bot.shutdown();
    this.alive.delete(bot.label);
    if (this.alive.size === 0) {
      mainLog('WS', 'all join-bots retired — exiting');
      printSummary();
      process.exit(0);
    }
  }

  async start() {
    for (const b of this.bots) {
      await b.connect();
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

// ---------- main ----------
const groups = [];
const finishedGroups = new Set();

{
  let colorIdx = 0;
  if (PARTY_SIZE) {
    const bots = Array.from({ length: PARTY_SIZE }, (_, i) => new Bot(`P${i + 1}`, colorIdx++));
    groups.push(new PartyGroup('Party', bots));
  } else if (JOIN_CODE) {
    const bots = Array.from({ length: BOT_COUNT }, (_, i) => new Bot(`J${i + 1}`, colorIdx++));
    groups.push(new JoinGroup('Joiners', bots, JOIN_CODE));
  } else {
    const duoCount = Math.floor(BOT_COUNT / 2);
    for (let i = 0; i < duoCount; i++) {
      const tag = String.fromCharCode(65 + i); // A, B, ...
      groups.push(new Group(`Duo${tag}`, [new Bot(`${tag}1`, colorIdx++), new Bot(`${tag}2`, colorIdx++)]));
    }
    if (BOT_COUNT % 2 === 1) {
      groups.push(new Group('Solo', [new Bot('S1', colorIdx++)]));
    }
  }
}

function printSummary() {
  console.log('\n' + bold('===== bot2v2 summary ====='));
  for (const [name, played] of Object.entries(stats.played)) {
    console.log(`  ${name}: played ${played}, won ${stats.wins[name] || 0}`);
  }
  console.log(`errors/toasts: ${stats.errors}`);
}

process.on('SIGINT', () => {
  mainLog('WS', 'shutting down…');
  for (const g of groups) g.bots.forEach((b) => b.shutdown());
  printSummary();
  process.exit(0);
});

if (PARTY_SIZE) {
  mainLog('WS', bold(`starting ${PARTY_SIZE}-bot party → ${URL}`) + ` (${PARTY_FFA ? 'FFA' : `team mode, scoring=${TEAM_SCORING}`}, ${PARTY_ROUNDS} rounds × ${PARTY_TIME}s, skill=${SKILL}, ${ONCE ? 'single game' : 'play-again loop'})`);
} else if (JOIN_CODE) {
  mainLog('WS', bold(`sending ${BOT_COUNT} bot(s) into party ${JOIN_CODE} → ${URL}`) + ' — they play along until the party closes or they are kicked');
} else {
  mainLog('WS', bold(`starting ${BOT_COUNT} bot(s) → ${URL}`) + ` (skill=${SKILL}, ${ONCE ? 'single match' : 'requeue loop'})`);
  if (BOT_COUNT === 2) mainLog('WS', 'scenario: 1 bot duo as OPPONENTS — queue as a duo from the web UI');
  if (BOT_COUNT === 3) mainLog('WS', 'scenario: bot duo (opponents) + solo bot (your teammate) — just solo-queue 2v2 in the web UI');
  if (BOT_COUNT >= 4) mainLog('WS', 'scenario: bot duos will match each other — sit back and watch');
}

for (const group of groups) {
  group.start().catch((e) => {
    mainLog('ERROR', `${group.name} failed to start: ${e.message}`);
    process.exit(1);
  });
  // stagger so queue pairing/logs stay readable
  await new Promise((r) => setTimeout(r, 400));
}
