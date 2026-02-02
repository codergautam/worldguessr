// API Configuration
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://worldguessr.com';
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://worldguessr.com/ws';

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
