import { getApp } from '@react-native-firebase/app';
import {
  getAnalytics,
  setAnalyticsCollectionEnabled,
  logEvent as fbLogEvent,
  logScreenView as fbLogScreenView,
  setUserId as fbSetUserId,
} from '@react-native-firebase/analytics';

let firebaseReady = false;
// Events fired before initAnalytics() resolves (onboarding_shown, the first
// game_start) are held here and flushed on init instead of being dropped.
const MAX_PENDING_EVENTS = 50;
let pendingEvents: Array<{ name: string; params?: Record<string, unknown>; screen?: boolean }> | null = [];
let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;

function getInstance() {
  if (!analyticsInstance) {
    analyticsInstance = getAnalytics(getApp());
  }
  return analyticsInstance;
}

export async function initAnalytics(): Promise<void> {
  try {
    await setAnalyticsCollectionEnabled(getInstance(), true);
    firebaseReady = true;
  } catch (err) {
    // GoogleService-Info.plist / google-services.json missing or Firebase not configured.
    console.warn('[analytics] init skipped:', (err as Error).message);
  }
  const queued = pendingEvents ?? [];
  pendingEvents = null;
  if (firebaseReady) {
    queued.forEach((e) => { void (e.screen ? logScreenView(e.name) : logEvent(e.name, e.params)); });
  }
}

export async function logEvent(name: string, params?: Record<string, unknown>): Promise<void> {
  if (!firebaseReady) {
    if (pendingEvents && pendingEvents.length < MAX_PENDING_EVENTS) pendingEvents.push({ name, params });
    return;
  }
  try {
    await fbLogEvent(getInstance(), name, params as Record<string, string | number | boolean>);
  } catch (err) {
    console.warn('[analytics] logEvent failed', err);
  }
}

export async function logScreenView(screen: string): Promise<void> {
  if (!firebaseReady) {
    if (pendingEvents && pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push({ name: screen, screen: true });
    }
    return;
  }
  try {
    await fbLogScreenView(getInstance(), { screen_name: screen, screen_class: screen });
  } catch (err) {
    console.warn('[analytics] logScreenView failed', err);
  }
}

export async function setUserId(userId: string | null): Promise<void> {
  if (!firebaseReady) return;
  try {
    await fbSetUserId(getInstance(), userId);
  } catch (err) {
    console.warn('[analytics] setUserId failed', err);
  }
}
