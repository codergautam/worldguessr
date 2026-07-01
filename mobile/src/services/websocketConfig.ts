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
// silently — TCP dropped by a NAT/radio change, or the uplink black-holed while the
// downlink still delivers (a half-open socket) — WITHOUT ws.onclose/onerror ever
// firing, leaving a "zombie" that still reads readyState OPEN. The foreground probe
// above (WS_LIVENESS_TIMEOUT_MS) only runs on a background→foreground transition, so a
// zombie that strikes while the app stays foregrounded would otherwise never be noticed:
// actions silently dropped, multiplayer frozen, no reconnect — recoverable only by
// reopening the app.
//
// The watchdog ticks every PING_INTERVAL and keys liveness off the last ANSWERED
// round-trip (_lastTimeSyncResponseAt), NOT off arbitrary inbound traffic. This is the
// crux of the zombie bug: the server broadcasts a `t` keepalive to every socket every
// ~5s unconditionally, so "some message arrived recently" stays true forever even on a
// half-open socket whose uplink is dead — only a timeSync REPLY proves our send reached
// the server and came back, and `t` cannot forge it. If no round-trip completes within
// MAX_SILENCE, the watchdog fires ONE confirming probe (verifyLiveness) before tearing
// down, so a momentarily slow link or a brief JS-thread freeze costs at most a graceful
// reconnect, never a false drop.
//
// Timing contract (all three values move together):
//   • TIME_SYNC_INTERVAL_MS (10s) — how often we ask "you there?". A healthy link refreshes
//     _lastTimeSyncResponseAt every 10s.
//   • MAX_SILENCE (25s) — how long with NO answered round-trip before we get SUSPICIOUS.
//     It MUST stay comfortably above the ask interval or a healthy link would trip
//     suspicion between routine asks and fire needless probes. 25 / 10 = 2.5 missed asks
//     of headroom, so a single dropped heartbeat (a 20s gap) never trips it — only a
//     genuinely stalled link does.
//   • PING_INTERVAL (8s) — how often we CHECK staleness. This is a free timestamp compare
//     (it sends nothing unless suspicious), so it's tuned for low detection latency.
// Worst-case automatic detection ≈ MAX_SILENCE + PING_INTERVAL + WS_LIVENESS_TIMEOUT
// ≈ 25 + 8 + 7 ≈ 40s (typically ~30s); a background→foreground transition recovers a
// zombie near-instantly via the foreground probe path regardless of these.
export const WS_LIVENESS_PING_INTERVAL_MS = 8000;
export const WS_LIVENESS_MAX_SILENCE_MS = 25000;

// A freshly-opened socket sends `verify` immediately (setupConnection) and expects a
// `verify` reply. A socket can OPEN cleanly yet never get verified — e.g. the server's
// verify handler threw on a transient DB blip and silently dropped us, or a reconnect
// raced the server's rejoin bookkeeping — and such a socket emits no onclose, so nothing
// else would ever notice (the server's verified-gate then drops every action we send).
// If no verify reply lands within this window, treat the open as failed and force a fresh
// connect+verify. Generous vs. a normal sub-second verify round-trip, so only a genuinely
// wedged session trips it.
export const WS_VERIFY_TIMEOUT_MS = 10000;

// Heartbeat interval (ported from web home.js:2349-2358)
export const PONG_INTERVAL_MS = 10000;

// Time sync interval. Web (home.js:1114-1123) uses 30s purely for clock sync, but on
// mobile this round-trip ALSO doubles as the liveness heartbeat the watchdog reads, so it
// must refresh well inside WS_LIVENESS_MAX_SILENCE_MS (25s). 10s gives the watchdog ~2.5
// answered round-trips of headroom before it could ever get suspicious on a healthy link.
export const TIME_SYNC_INTERVAL_MS = 10000;

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
