// WebSocket server URL configuration
// In dev, point to local server; in production, use the live server
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || (__DEV__
  ? 'ws://192.168.4.58:3002/wg'
  : 'wss://server.worldguessr.com/wg');

// Connection parameters (ported from web initWebsocket.js)
export const WS_TIMEOUT_MS = 5000;
export const WS_MAX_RETRIES = 50;
export const WS_RETRY_DELAY_MS = 5000;

// While the user is in a multiplayer game / party / queue, cap auto-reconnect at a
// few attempts instead of the full WS_MAX_RETRIES. If we can't get back within
// roughly the server's rejoin window (RECONNECT_WINDOW_MS below) the game is gone,
// so we give up fast and let the onReconnectFailed teardown pop the user home
// rather than spinning on a dead session for minutes. ~3 attempts × (timeout +
// delay) ≈ the rejoin window. On home (not in a game) we keep the full budget.
export const WS_INGAME_RECONNECT_ATTEMPTS = 3;

// On foreground with a still-"OPEN" socket, we ping the server and wait this long
// for a timeSync reply. No reply => the socket is a zombie (OS killed TCP while JS
// was frozen) and we force a fresh reconnect. Kept above WS_TIMEOUT_MS so a slow
// network doesn't trip a needless reconnect; a false positive only costs a graceful
// reconnect, never data.
export const WS_LIVENESS_TIMEOUT_MS = 7000;

// Heartbeat interval (ported from web home.js:2349-2358)
export const PONG_INTERVAL_MS = 10000;

// Time sync interval (ported from web home.js:1114-1123)
export const TIME_SYNC_INTERVAL_MS = 30000;

// The server keeps a disconnected player rejoinable for 30s, then evicts them. We
// use a slightly smaller client window so a foreground always forces a full
// reconnect *before* the server eviction boundary instead of racing it.
export const RECONNECT_WINDOW_MS = 25000;
