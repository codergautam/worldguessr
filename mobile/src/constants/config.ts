// API Configuration
const DEV_SERVER_HOST = '192.168.4.58';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? `http://${DEV_SERVER_HOST}:3001` : 'https://api.worldguessr.com');
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL || (__DEV__ ? `http://${DEV_SERVER_HOST}:3004` : 'https://api.worldguessr.com');
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || (__DEV__ ? `ws://${DEV_SERVER_HOST}:3002/wg` : 'wss://server.worldguessr.com/wg');

// Public website (used for shareable party invite links — mirrors web NEXT_PUBLIC_DOMAIN).
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://worldguessr.com';

// Base URL for the chrome-less /embed/* Leaflet map pages loaded in the map
// WebView. In dev these are served by your local `next dev` (default :3000 on
// the dev host). Override with EXPO_PUBLIC_EMBED_URL if your web port differs.
// Once the embed pages are deployed, prod uses worldguessr.com.
export const EMBED_BASE_URL =
  process.env.EXPO_PUBLIC_EMBED_URL ||
  (__DEV__ ? `http://${DEV_SERVER_HOST}:3000` : 'https://worldguessr.com');

// Hard ceiling on every HTTP request (enforced by services/fetchWithTimeout.ts,
// which all network calls route through). A mobile socket can hang indefinitely —
// DNS, TCP connect, or the read can stall without the request ever failing — and
// a bare fetch() will then never resolve OR reject. That is exactly what leaves a
// loading spinner spinning forever. 15s sits comfortably above a slow-but-working
// mobile round-trip, so we only abort genuinely dead requests, never merely slow
// ones. Tune here in one place; nothing else hard-codes a request timeout.
export const HTTP_TIMEOUT_MS = 15000;

// Game Configuration
export const DEFAULT_ROUNDS = 5;
export const DEFAULT_TIME_PER_ROUND = 30; // seconds
export const DUEL_TIME_PER_ROUND = 60; // seconds
export const MAX_POINTS_PER_ROUND = 5000;
export const DEFAULT_MAX_DIST = 20000; // km

// Auth Configuration
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

// Storage Keys
export const STORAGE_KEYS = {
  SECRET: 'wg_secret',
  SETTINGS: 'wg_settings',
  LANGUAGE: 'wg_language',
} as const;
