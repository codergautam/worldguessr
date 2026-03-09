// WebSocket server URL configuration
// In dev, point to local server; in production, use the live server
export const WS_URL = __DEV__
  ? 'ws://172.20.10.2:3002/wg'
  : 'wss://server.worldguessr.com/wg';

// Connection parameters (ported from web initWebsocket.js)
export const WS_TIMEOUT_MS = 5000;
export const WS_MAX_RETRIES = 50;
export const WS_RETRY_DELAY_MS = 5000;

// Heartbeat interval (ported from web home.js:2349-2358)
export const PONG_INTERVAL_MS = 10000;

// Time sync interval (ported from web home.js:1114-1123)
export const TIME_SYNC_INTERVAL_MS = 30000;

// Server gives 30 seconds to reconnect before removing player
export const RECONNECT_WINDOW_MS = 30000;
