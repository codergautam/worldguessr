import { afterEach, describe, expect, it, vi } from 'vitest';
import Player from '../ws/classes/Player.js';
import { createHeartbeat, HEARTBEAT_INTERVAL_MS } from '../ws/heartbeat.js';

function setup() {
  const players = new Map();
  const countPlayers = vi.fn(() => 37);
  const heartbeat = createHeartbeat(players, countPlayers);

  function connect(id) {
    const frames = [];
    const ws = { id, send: (bytes) => frames.push(bytes) };
    const player = new Player(ws, id, '127.0.0.1');
    player.verified = true;
    players.set(id, player);
    heartbeat.add(ws);
    return { ws, player, frames };
  }

  return { players, heartbeat, countPlayers, connect };
}

const read = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WebSocket heartbeat', () => {
  it('serves every socket once per cycle, with shared bytes and a fresh clock per group', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { heartbeat, countPlayers, connect } = setup();
    countPlayers.mockReturnValueOnce(37).mockReturnValue(38);
    const clients = Array.from({ length: 40 }, (_, i) => connect(String(i)));
    expect(HEARTBEAT_INTERVAL_MS).toBe(250);

    for (let tick = 0; tick < 40; tick++) {
      const now = 1700000000000 + tick * HEARTBEAT_INTERVAL_MS;
      vi.setSystemTime(now);
      heartbeat.tick();
      const slot = tick % 20;
      const frames = clients[slot].frames;
      const peerFrames = clients[slot + 20].frames;
      expect(frames).toHaveLength(tick < 20 ? 2 : 4);
      expect(read(frames.at(-1))).toEqual({ type: 't', t: now });
      expect(frames.at(-1)).toBe(peerFrames.at(-1));
      expect(read(frames.at(-2))).toEqual({ type: 'cnt', c: tick < 20 ? 37 : 38 });
      expect(frames.at(-2)).toBe(clients[0].frames.at(-2));
      if (tick < 19) expect(clients[slot + 1].frames).toHaveLength(0);
    }
    expect(countPlayers).toHaveBeenCalledTimes(2);
    for (const { frames } of clients) expect(frames).toHaveLength(4);
  });

  it('checks current lobby membership, socket ownership and disconnection at send time', () => {
    const { heartbeat, players, connect } = setup();
    const old = connect('returning');
    const replacement = connect('temporary');
    const playing = connect('playing');
    const unverified = connect('unverified');
    const closed = connect('closed');
    const disconnected = connect('disconnected');

    players.delete('temporary');
    replacement.ws.id = old.ws.id;
    old.player.ws = replacement.ws;
    heartbeat.tick(); // The old socket is still registered, but no longer owns this player.
    heartbeat.remove(old.ws);
    heartbeat.remove(closed.ws);
    playing.player.gameId = 'game';
    unverified.player.verified = false;
    disconnected.player.disconnected = true;
    for (let i = 1; i < 40; i++) heartbeat.tick();

    expect(old.frames).toHaveLength(0);
    expect(closed.frames).toHaveLength(0);
    expect(disconnected.frames).toHaveLength(0);
    expect(replacement.frames.map(read).map(m => m.type)).toEqual(['cnt', 't', 'cnt', 't']);
    for (const client of [playing, unverified]) {
      expect(client.frames.map(read).map(m => m.type)).toEqual(['t', 't']);
    }
  });

  it('continues the group when one recipient throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { heartbeat, connect } = setup();
    const clients = Array.from({ length: 21 }, (_, i) => connect(String(i)));
    clients[0].player.send = () => { throw new Error('bad recipient'); };
    heartbeat.tick();
    expect(clients[20].frames.map(read).map(m => m.type)).toEqual(['cnt', 't']);
  });
});
