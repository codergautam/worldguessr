// API Configuration
//
// Every build (dev client, preview, and store) defaults to the LIVE backends.
// To run against a local backend, set the matching EXPO_PUBLIC_* var in
// mobile/.env, e.g.
//   EXPO_PUBLIC_API_URL=http://192.168.x.x:3001
//   EXPO_PUBLIC_AUTH_URL=http://192.168.x.x:3004
//   EXPO_PUBLIC_WS_URL=ws://192.168.x.x:3002/wg
//   EXPO_PUBLIC_EMBED_URL=http://192.168.x.x:3000
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.worldguessr.com';
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL || 'https://api.worldguessr.com';
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://server.worldguessr.com/wg';

// Public website (used for shareable party invite links — mirrors web NEXT_PUBLIC_DOMAIN).
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://worldguessr.com';

// Base URL for the chrome-less /embed/* Leaflet map pages loaded in the map
// WebView. Served from worldguessr.com in prod; override with
// EXPO_PUBLIC_EMBED_URL to point at a local `next dev`.
export const EMBED_BASE_URL = process.env.EXPO_PUBLIC_EMBED_URL || 'https://worldguessr.com';

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
