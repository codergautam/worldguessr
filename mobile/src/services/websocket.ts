/**
 * WebSocket singleton service for WorldGuessr multiplayer.
 *
 * Ported from:
 *  - components/utils/initWebsocket.js  (connection + retry logic)
 *  - components/home.js:1065-1133       (time sync)
 *  - components/home.js:2349-2358       (pong heartbeat)
 *  - components/home.js:1297-1391       (verify / auth flow)
 *  - components/home.js:1882-1927       (onclose / onerror)
 */

import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  WS_URL,
  WS_TIMEOUT_MS,
  WS_MAX_RETRIES,
  WS_RETRY_DELAY_MS,
  PONG_INTERVAL_MS,
  TIME_SYNC_INTERVAL_MS,
} from './websocketConfig';

const REJOIN_CODE_KEY = 'wg_rejoinCode';

type MessageHandler = (data: any) => void;
type DisconnectHandler = () => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private disconnectHandlers: Set<DisconnectHandler> = new Set();
  private pongInterval: ReturnType<typeof setInterval> | null = null;
  private timeSyncInterval: ReturnType<typeof setInterval> | null = null;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  // Reconnect control (replaces web's window.dontReconnect)
  private _dontReconnect = false;
  private _currentRetry = 0;
  private _secret: string | null = null;
  private _intentionalClose = false;

  // Connection generation — incremented on each connect() call.
  // Any in-flight initWebsocket chain with a stale generation is abandoned.
  private _generation = 0;

  // Time sync state (ported from home.js:1065-1089)
  private _timeOffset = 0;
  private _bestRtt = Infinity;
  private _lastSyncAt = 0;
  private _lastServerNow = 0;

  // ── Public getters ────────────────────────────────────────

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get timeOffset(): number {
    return this._timeOffset;
  }

  get currentRetry(): number {
    return this._currentRetry;
  }

  // ── Connection ────────────────────────────────────────────

  /**
   * Connect to the WS server with optional auth secret.
   * Ported from initWebsocket.js + home.js:1297-1391.
   */
  async connect(secret: string | null): Promise<void> {
    // Skip if already connected with the same secret
    if (this.isConnected && this._secret === secret) {
      console.log('[WS] Already connected with same secret, skipping');
      return;
    }

    // Bump generation so any in-flight retry chain from a previous connect() is abandoned
    const gen = ++this._generation;
    console.log(`[WS] connect() called (gen=${gen}, secret=${secret ? 'yes' : 'no'})`);

    this._secret = secret;
    this._dontReconnect = false;
    this._currentRetry = 0;

    // Cancel any pending retry timeout from a previous connection attempt
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // Close existing connection cleanly
    if (this.ws) {
      this._intentionalClose = true;
      // Nullify handlers so close doesn't trigger handleDisconnect
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    this.clearIntervals();
    this._intentionalClose = false;

    try {
      await this.initWebsocket(WS_URL, WS_TIMEOUT_MS, WS_MAX_RETRIES, gen);
    } catch (err) {
      // Only log if this is still the active generation
      if (gen === this._generation) {
        console.error('[WS] All connection attempts failed:', err);
      }
    }
  }

  /**
   * Disconnect intentionally (e.g. logout). No auto-reconnect.
   */
  disconnect(): void {
    console.log('[WS] disconnect() called');
    this._generation++;
    this._intentionalClose = true;
    this._dontReconnect = true;
    this.clearIntervals();
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  /**
   * Set the dontReconnect flag (called from store on UAC / auth failure).
   */
  setDontReconnect(value: boolean): void {
    this._dontReconnect = value;
    if (value) {
      // Also cancel any pending retry
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
        this.retryTimeout = null;
      }
    }
  }

  // ── Messaging ─────────────────────────────────────────────

  /**
   * Send a JSON message to the server.
   */
  send(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify(data);
      console.log('[WS] >>>>', (data as any).type, msg.length > 200 ? msg.slice(0, 200) + '...' : msg);
      this.ws.send(msg);
    } else {
      console.warn('[WS] send() dropped (not connected):', (data as any).type);
    }
  }

  /**
   * Register a handler for incoming messages.
   * Returns an unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Register a handler for disconnect events.
   * Called when an established connection drops unexpectedly (not intentional close).
   * Returns an unsubscribe function.
   */
  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  // ── Time Sync (ported from home.js:1065-1094) ─────────────

  /**
   * Send a timeSync request to the server.
   */
  sendTimeSync(): void {
    this.send({ type: 'timeSync', clientSentAt: Date.now() });
  }

  /**
   * Process a timeSync response and update offset.
   * Ported from home.js:1065-1089 updateTimeOffsetFromSync.
   */
  updateTimeOffsetFromSync(serverNow: number, clientSentAt: number): void {
    if (!serverNow || !clientSentAt) return;
    const now = Date.now();
    const rtt = Math.max(0, now - clientSentAt);
    const offset = serverNow - (clientSentAt + rtt / 2);
    const tooOld = now - this._lastSyncAt > 60000;
    const betterRtt = rtt <= this._bestRtt + 25;

    if (this._lastSyncAt === 0 || betterRtt || tooOld) {
      this._bestRtt = Math.min(this._bestRtt, rtt);
      this._lastSyncAt = now;
      this._lastServerNow = serverNow;
      this._timeOffset = offset;
    }
  }

  /**
   * Fallback time offset from server "t" (ping) messages.
   * Ported from home.js:1519-1533.
   */
  updateTimeOffsetFallback(serverTime: number): void {
    const offset = serverTime - Date.now();
    const now = Date.now();
    const useFallback =
      this._lastSyncAt === 0 || now - this._lastSyncAt > 60000;
    if (useFallback && Math.abs(offset) < 300000) {
      this._timeOffset = offset;
    }
  }

  // ── AppState handling ─────────────────────────────────────

  /**
   * Start listening for app foreground/background transitions.
   */
  startAppStateListener(): void {
    if (this.appStateSubscription) return;
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  /**
   * Stop listening for app state changes.
   */
  stopAppStateListener(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      // App came to foreground — re-sync time
      if (this.isConnected) {
        this.sendTimeSync();
      } else if (!this._dontReconnect) {
        // Connection lost while backgrounded — reconnect immediately
        this.connect(this._secret);
      }
    }
  };

  // ── Internal: connection with retry ───────────────────────

  /**
   * Core connection function, ported from initWebsocket.js.
   * Recursively retries with delay on failure.
   * The `gen` parameter ensures stale retry chains are abandoned.
   */
  private initWebsocket(
    url: string,
    timeoutMs: number,
    retriesRemaining: number,
    gen: number,
  ): Promise<WebSocket> {
    // Abort if a newer connect() was called
    if (gen !== this._generation) {
      return Promise.reject(new Error('Stale connection attempt'));
    }

    return new Promise((resolve, reject) => {
      let hasReturned = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      // Create WebSocket
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`WebSocket creation failed: ${err}`));
        return;
      }

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      timeoutId = setTimeout(() => {
        if (!hasReturned) {
          console.warn(`[WS] Connection timed out after ${timeoutMs}ms`);
          rejectInternal('timeout');
        }
      }, timeoutMs);

      ws.onopen = () => {
        if (hasReturned || gen !== this._generation) {
          ws.close();
          return;
        }
        hasReturned = true;
        cleanup();
        console.log(`[WS] Connected (gen=${gen})`);
        this.ws = ws;
        this.setupConnection(ws);
        resolve(ws);
      };

      ws.onclose = (event) => {
        if (!hasReturned) {
          rejectInternal('close');
          return;
        }
        // Connection was open and now closed
        console.warn(`[WS] Closed (code: ${event.code})`);
        this.handleDisconnect();
      };

      ws.onerror = () => {
        if (!hasReturned) {
          rejectInternal('error');
          return;
        }
        console.error('[WS] Error on open connection');
        this.handleDisconnect();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.dispatchMessage(data);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      const rejectInternal = (reason: string) => {
        if (hasReturned) return;
        hasReturned = true;
        cleanup();
        // Nullify handlers before closing so ws.close() doesn't trigger
        // onclose → handleDisconnect() (which would start a fresh retry chain)
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try { ws.close(); } catch {}

        this._currentRetry++;

        if (retriesRemaining <= 0 || this._dontReconnect || gen !== this._generation) {
          reject(new Error(`WebSocket connection failed: ${reason}`));
          return;
        }

        console.log(
          `[WS] Retrying in ${WS_RETRY_DELAY_MS / 1000}s (${retriesRemaining - 1} retries left)`,
        );
        this.retryTimeout = setTimeout(() => {
          this.retryTimeout = null;
          if (gen !== this._generation) {
            reject(new Error('Stale connection attempt'));
            return;
          }
          this.initWebsocket(url, timeoutMs, retriesRemaining - 1, gen)
            .then(resolve)
            .catch(reject);
        }, WS_RETRY_DELAY_MS);
      };
    });
  }

  // ── Internal: post-connection setup ───────────────────────

  /**
   * Called once the WebSocket is open.
   * Sends verify, starts heartbeat + time sync.
   */
  private async setupConnection(ws: WebSocket): Promise<void> {
    this._currentRetry = 0;
    this._intentionalClose = false;

    // Reset time sync state
    this._bestRtt = Infinity;
    this._lastSyncAt = 0;
    this._lastServerNow = 0;
    this._timeOffset = 0;

    // Send verify — ported from home.js:1364
    const rejoinCode = await SecureStore.getItemAsync(REJOIN_CODE_KEY);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    this.send({
      type: 'verify',
      secret: this._secret ?? 'not_logged_in',
      rejoinCode: rejoinCode ?? undefined,
      tz,
    });

    // Start pong heartbeat — ported from home.js:2349-2358
    this.pongInterval = setInterval(() => {
      this.send({ type: 'pong' });
    }, PONG_INTERVAL_MS);

    // Start time sync — ported from home.js:1114-1123
    this.sendTimeSync();
    this.timeSyncInterval = setInterval(() => {
      this.sendTimeSync();
    }, TIME_SYNC_INTERVAL_MS);
  }

  /**
   * Handle a disconnection (onclose/onerror after connection was established).
   * Ported from home.js:1882-1927.
   */
  private handleDisconnect(): void {
    this.ws = null;
    this.clearIntervals();

    // Only notify disconnect handlers for UNEXPECTED disconnects
    // (not intentional close from connect()/disconnect())
    if (!this._intentionalClose && !this._dontReconnect) {
      console.log('[WS] Unexpected disconnect — notifying handlers');
      for (const handler of this.disconnectHandlers) {
        try {
          handler();
        } catch (err) {
          console.error('[WS] Disconnect handler error:', err);
        }
      }

      // Auto-reconnect — same flow as web
      console.log('[WS] Attempting reconnection...');
      const gen = ++this._generation;
      this.initWebsocket(WS_URL, WS_TIMEOUT_MS, WS_MAX_RETRIES, gen).catch(
        (err) => {
          if (gen === this._generation) {
            console.error('[WS] Reconnection failed:', err);
          }
        },
      );
    }
  }

  // ── Internal: helpers ─────────────────────────────────────

  private dispatchMessage(data: any): void {
    // Log all received messages (skip noisy ones)
    if (data.type !== 'pong' && data.type !== 't' && data.type !== 'timeSync') {
      console.log('[WS] <<<<', data.type, JSON.stringify(data).slice(0, 300));
    }

    // Handle time sync messages internally as well
    if (data.type === 'timeSync') {
      this.updateTimeOffsetFromSync(data.serverNow, data.clientSentAt);
    } else if (data.type === 't') {
      this.updateTimeOffsetFallback(data.t);
    }

    // Dispatch to all registered handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(data);
      } catch (err) {
        console.error('[WS] Message handler error:', err);
      }
    }
  }

  private clearIntervals(): void {
    if (this.pongInterval) {
      clearInterval(this.pongInterval);
      this.pongInterval = null;
    }
    if (this.timeSyncInterval) {
      clearInterval(this.timeSyncInterval);
      this.timeSyncInterval = null;
    }
  }

  /**
   * Store the rejoinCode received from server.
   * Called from the multiplayerStore when processing verify messages.
   */
  async storeRejoinCode(code: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(REJOIN_CODE_KEY, code);
    } catch (err) {
      console.error('[WS] Failed to store rejoinCode:', err);
    }
  }
}

// Singleton export
export const wsService = new WebSocketService();
