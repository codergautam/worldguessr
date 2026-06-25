// WebSocket server URL — single source of truth lives in constants/config so the
// socket and the rest of the app can never drift to different hosts. Defaults to
// wss://server.worldguessr.com/wg; override via EXPO_PUBLIC_WS_URL for local dev.
export { WS_URL } from '../constants/config';

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

// Continuous foreground liveness watchdog. While the app is OPEN, a socket can die
// silently — TCP dropped by a NAT/network change or a frozen JS thread — WITHOUT
// ws.onclose/onerror ever firing, leaving a "zombie" that still reads readyState
// OPEN. The foreground check above (WS_LIVENESS_TIMEOUT_MS) only runs on a
// background→foreground transition, so a zombie that happens while the app stays
// foregrounded is never noticed: stale online count, multiplayer stuck loading, no
// reconnect — recoverable only by reopening the app. This watchdog ticks every
// PING_INTERVAL and, if NO inbound message has arrived for MAX_SILENCE, treats the
// socket as dead and forces a reconnect. MAX_SILENCE sits well above
// TIME_SYNC_INTERVAL_MS (the guaranteed ~30s round-trip) plus network slack, so a
// momentarily slow link never trips it, but a true zombie is caught within ~1 minute.
export const WS_LIVENESS_PING_INTERVAL_MS = 15000;
export const WS_LIVENESS_MAX_SILENCE_MS = 45000;

// Heartbeat interval (ported from web home.js:2349-2358)
export const PONG_INTERVAL_MS = 10000;

// Time sync interval (ported from web home.js:1114-1123)
export const TIME_SYNC_INTERVAL_MS = 30000;

// The server keeps a disconnected player rejoinable for 30s, then evicts them. We
// use a slightly smaller client window so a foreground always forces a full
// reconnect *before* the server eviction boundary instead of racing it.
export const RECONNECT_WINDOW_MS = 25000;

// After we send a publicDuel/unrankedDuel join the server replies with a
// `queueJoined` ack (ranked additionally sends `publicDuelRange`). If neither
// arrives within this window the join never registered server-side, so instead of
// leaving the user spinning on the matchmaking screen forever we toast and pop
// them home. The ack is a same-tick server response, so 8s is far above a normal
// round-trip while still short enough not to feel stuck.
export const WS_QUEUE_CONFIRM_TIMEOUT_MS = 8000;
