const GROUP_COUNT = 20;
export const HEARTBEAT_INTERVAL_MS = 5000 / GROUP_COUNT;

// Group by open socket. A rejoin can change its player id without reopening it.
export function createHeartbeat(players, getActivePlayerCount) {
  const groups = Array.from({ length: GROUP_COUNT }, () => new Set());
  let nextJoin = 0;
  let nextSend = 0;
  let countMessage;
  let countBytes;

  return {
    add(ws) {
      ws.heartbeatGroup = nextJoin;
      groups[nextJoin].add(ws);
      nextJoin = (nextJoin + 1) % GROUP_COUNT;
    },
    remove(ws) {
      groups[ws.heartbeatGroup]?.delete(ws);
    },
    tick() {
      if (nextSend === 0) {
        countMessage = { type: 'cnt', c: getActivePlayerCount() };
        countBytes = Buffer.from(JSON.stringify(countMessage));
      }
      const group = groups[nextSend];
      nextSend = (nextSend + 1) % GROUP_COUNT;
      if (!group.size) return;

      const clockMessage = { type: 't', t: Date.now() };
      const clockBytes = Buffer.from(JSON.stringify(clockMessage));
      for (const ws of group) {
        try {
          const player = players.get(ws.id);
          if (player?.ws !== ws) continue;
          if (player.verified && !player.gameId) player.send(countMessage, countBytes);
          player.send(clockMessage, clockBytes);
        } catch (e) {
          console.error('[tick:heartbeat] send failed for', ws.id, e?.stack || e);
        }
      }
    },
  };
}
