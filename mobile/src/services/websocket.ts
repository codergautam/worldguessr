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
  WS_INGAME_RECONNECT_ATTEMPTS,
  WS_RETRY_DELAY_MS,
  PONG_INTERVAL_MS,
  TIME_SYNC_INTERVAL_MS,
  RECONNECT_WINDOW_MS,
  WS_LIVENESS_TIMEOUT_MS,
  WS_LIVENESS_PING_INTERVAL_MS,
  WS_LIVENESS_MAX_SILENCE_MS,
  WS_VERIFY_TIMEOUT_MS,
} from './websocketConfig';

const REJOIN_CODE_KEY = 'wg_rejoinCode';

type MessageHandler = (data: any) => void;
type DisconnectHandler = () => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private disconnectHandlers: Set<DisconnectHandler> = new Set();
  private reconnectFailedHandlers: Set<DisconnectHandler> = new Set();
  // Fired when a reconnect of an established session STARTS (foreground / liveness
  // / post-drop). Lets the UI flip to "connecting" (yellow WsIcon) without the
  // "Connection Lost" toast that onDisconnect shows for genuine mid-session drops.
  private reconnectingHandlers: Set<DisconnectHandler> = new Set();
  // Fired when a reconnect SUCCEEDS (a fresh verify arrived after we'd been
  // connected before). Drives the universal "Reconnected!" toast.
  private reconnectedHandlers: Set<DisconnectHandler> = new Set();
  private pongInterval: ReturnType<typeof setInterval> | null = null;
  private timeSyncInterval: ReturnType<typeof setInterval> | null = null;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private livenessTimeout: ReturnType<typeof setTimeout> | null = null;
  // Continuous foreground zombie-socket watchdog (see livenessWatchdog setup in
  // setupConnection). Distinct from livenessTimeout, which is the one-shot
  // foreground-transition probe.
  private livenessWatchdog: ReturnType<typeof setInterval> | null = null;
  // One-shot timer armed when a fresh socket sends `verify` (setupConnection). If no
  // verify reply lands before it fires, the open is treated as failed and we force a
  // reconnect. Closes the "socket OPENed but never verified" gap — that state emits no
  // onclose, so without this it would strand the user on a permanent "connecting".
  private verifyAckTimeout: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  // Reconnect control (replaces web's window.dontReconnect)
  private _dontReconnect = false;
  private _currentRetry = 0;
  private _secret: string | null = null;
  private _intentionalClose = false;

  // True while the user is in a multiplayer game / party / queue. Pushed from
  // useWebSocket whenever the store's multiplayer state changes. Shortens the
  // auto-reconnect budget (reconnectBudget) so a drop we can't recover within
  // ~the server's rejoin window gives up fast and pops the user home (via the
  // onReconnectFailed teardown) instead of leaving them on a frozen game.
  private _inGame = false;

  // True once we've completed at least one verify this session. Gates the
  // "Reconnected!" toast (so a first connect / cold launch never toasts) and
  // whether a drop should be treated as a reconnect.
  private _everConnected = false;
  // True while the current (re)connection attempt is a reconnect of a previously
  // established session — set it, and the next verify fires reconnectedHandlers.
  private _pendingReconnect = false;
  // Timestamp (ms) of the last timeSync RESPONSE. This is the heartbeat both liveness
  // checks key off: it advances ONLY on a real server reply to our timeSync, so unlike
  // raw inbound traffic (e.g. the server's unconditional 5s `t` keepalive) it can't be
  // forged by a half-open socket whose uplink is dead. Both verifyLiveness (foreground
  // transition) and the continuous watchdog capture-and-compare it.
  private _lastTimeSyncResponseAt = 0;

  // Timestamp (ms) of the last `verify` response. The verify-ack timer capture-compares
  // it to tell a successful open+verify apart from a socket that OPENed but never verified.
  private _lastVerifyAt = 0;

  // Timestamp (ms) the app was last backgrounded, to decide on foreground
  // whether we've been gone long enough that the server dropped our session.
  private _backgroundedAt = 0;

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

  /**
   * True if we're already connected using exactly this secret — i.e. a
   * connect() call with this secret would short-circuit (no new socket, no
   * fresh verify). Callers use this to avoid flagging `connecting` for a
   * connect that will never actually run.
   */
  isConnectedWith(secret: string | null): boolean {
    return this.isConnected && this._secret === secret;
  }

  /**
   * True if the live socket is open AND the server has completed a verify this
   * session. `_everConnected` survives drops and (crucially) survives a dev
   * Fast-Refresh store reset, since this service is a persisted singleton. The
   * store mirrors `connected`/`verified` as its own flags that are ONLY set true
   * by an incoming `verify` — but connect() short-circuits when the socket is
   * already open ("Already connected with same secret, skipping"), so no fresh
   * verify arrives to restore those flags after a reset. Callers use this as the
   * source of truth to re-sync the store against the real connection.
   */
  get isVerified(): boolean {
    return this.isConnected && this._everConnected;
  }

  get timeOffset(): number {
    return this._timeOffset;
  }

  getTimeOffset(): number {
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
  async connect(
    secret: string | null,
    force = false,
    opts?: { isReconnect?: boolean },
  ): Promise<void> {
    // Skip if already connected with the same secret. `force` bypasses this so a
    // foreground after a long background can tear down a possibly-stale socket
    // and re-verify even though readyState still reads OPEN.
    if (!force && this.isConnected && this._secret === secret) {
      console.log('[WS] Already connected with same secret, skipping');
      return;
    }

    const isReconnect = !!opts?.isReconnect;

    // Bump generation so any in-flight retry chain from a previous connect() is abandoned
    const gen = ++this._generation;
    console.log(`[WS] connect() called (gen=${gen}, secret=${secret ? 'yes' : 'no'}, reconnect=${isReconnect})`);

    this._secret = secret;
    this._dontReconnect = false;
    this._currentRetry = 0;
    // Reset-then-set so a stale pendingReconnect from an abandoned attempt can
    // never survive a fresh connect and fire a spurious "Reconnected!" toast.
    this._pendingReconnect = isReconnect;

    // Cancel any pending retry timeout from a previous connection attempt
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // A reconnect of an established session: flip the UI to "connecting" (yellow
    // WsIcon) up front — WITHOUT the "Connection Lost" toast that onDisconnect
    // shows for genuine mid-session drops. A foreground reconnect via connect()
    // suppresses handleDisconnect (handlers nulled below), so this is the only
    // place that can drive the indicator for a reopen reconnect.
    if (isReconnect) {
      this.notifyReconnecting();
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
      await this.initWebsocket(WS_URL, WS_TIMEOUT_MS, this.reconnectBudget, gen);
    } catch (err) {
      // Only act if this is still the active generation (a newer connect() owns
      // the connection state otherwise).
      if (gen === this._generation) {
        console.error('[WS] All connection attempts failed:', err);
        // A failed reconnect is a real disconnect: drop from "connecting"
        // (yellow) to disconnected (red) and tear the game down — mirroring
        // handleDisconnect's give-up path. Without this a failed foreground
        // reconnect would leave the indicator stuck green forever.
        if (isReconnect && !this._dontReconnect) {
          this.notifyReconnectFailed();
        }
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

  /**
   * Tell the service whether the user is currently in a multiplayer game / party /
   * queue. Drives the shortened in-game reconnect budget (see _inGame /
   * reconnectBudget). Pushed from useWebSocket whenever the store's multiplayer
   * state changes.
   */
  setInGame(value: boolean): void {
    this._inGame = value;
  }

  /**
   * Auto-reconnect attempt budget. Shortened to a few attempts while the user is
   * in a multiplayer game / party / queue so a non-recoverable drop pops them home
   * quickly; the full WS_MAX_RETRIES budget applies everywhere else (home presence
   * / re-queue should keep retrying).
   */
  private get reconnectBudget(): number {
    return this._inGame ? WS_INGAME_RECONNECT_ATTEMPTS : WS_MAX_RETRIES;
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

  /**
   * Register a handler fired when auto-reconnection gives up after exhausting
   * all retries. Lets the UI fall back from "connecting" (yellow) to a real
   * "disconnected" (red) state. Returns an unsubscribe function.
   */
  onReconnectFailed(handler: DisconnectHandler): () => void {
    this.reconnectFailedHandlers.add(handler);
    return () => {
      this.reconnectFailedHandlers.delete(handler);
    };
  }

  /**
   * Register a handler fired when a reconnect of an established session STARTS
   * (foreground / liveness / post-drop force-reconnect). Lets the UI flip to
   * "connecting" (yellow) without the "Connection Lost" toast. Returns an
   * unsubscribe function.
   */
  onReconnecting(handler: DisconnectHandler): () => void {
    this.reconnectingHandlers.add(handler);
    return () => {
      this.reconnectingHandlers.delete(handler);
    };
  }

  /**
   * Register a handler fired when a reconnect SUCCEEDS (a fresh verify arrived
   * after we'd been connected before). Drives the "Reconnected!" toast.
   * Returns an unsubscribe function.
   */
  onReconnected(handler: DisconnectHandler): () => void {
    this.reconnectedHandlers.add(handler);
    return () => {
      this.reconnectedHandlers.delete(handler);
    };
  }

  private notifyReconnecting(): void {
    for (const handler of this.reconnectingHandlers) {
      try {
        handler();
      } catch (err) {
        console.error('[WS] Reconnecting handler error:', err);
      }
    }
  }

  private notifyReconnected(): void {
    for (const handler of this.reconnectedHandlers) {
      try {
        handler();
      } catch (err) {
        console.error('[WS] Reconnected handler error:', err);
      }
    }
  }

  private notifyReconnectFailed(): void {
    for (const handler of this.reconnectFailedHandlers) {
      try {
        handler();
      } catch (err) {
        console.error('[WS] Reconnect-failed handler error:', err);
      }
    }
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
      const bgMs = this._backgroundedAt ? Date.now() - this._backgroundedAt : 0;
      this._backgroundedAt = 0;

      // NOTE: we deliberately DON'T bail on `_dontReconnect` here. A UAC
      // (userAlreadyConnected) sets that latch so we don't *passively* fight a
      // device that took over — but bringing this app to the foreground is
      // explicit intent to use THIS device, so we should reconnect (and let the
      // server hand the session back). connect() clears the latch. Because this
      // only fires on a discrete background→foreground transition, it can't loop
      // into a reconnect war.
      if (this.isConnected && bgMs < RECONNECT_WINDOW_MS && !this._dontReconnect) {
        // Socket looks alive and we weren't gone long. But after a freeze the OS
        // may have killed TCP while readyState still reads OPEN (zombie), so
        // verify liveness before trusting it.
        this.verifyLiveness();
      } else {
        // Dead/zombie socket, gone past the server's reconnect window (session
        // likely evicted), or UAC-suppressed. Force a fresh connect+verify so the
        // server replays the live game (or tells us it ended). Trusting a
        // possibly-zombie "OPEN" socket here is exactly what left a stale in-round
        // UI frozen after a long background.
        this.connect(this._secret, true, { isReconnect: this._everConnected });
      }
    } else if (nextState === 'background' || nextState === 'inactive') {
      if (!this._backgroundedAt) this._backgroundedAt = Date.now();
    }
  };

  /**
   * Confirming liveness probe for a socket that still reads OPEN. Pings the server
   * (timeSync) and, if no response arrives within WS_LIVENESS_TIMEOUT_MS, treats the
   * socket as a zombie and forces a reconnect. Capture-and-compare on
   * `_lastTimeSyncResponseAt` so a routine timeSync tick can't mask a dead socket.
   *
   * Shared by both liveness paths: the background→foreground transition
   * (handleAppStateChange) AND the continuous foreground watchdog (setupConnection),
   * which calls this once it sees the round-trip heartbeat go stale. Routing the
   * watchdog through here adds one confirming round-trip before any teardown, so a
   * merely-slow link or a brief JS-thread freeze can never trigger a false reconnect.
   */
  private verifyLiveness(): void {
    if (!this.isConnected) {
      // Raced with a close — just reconnect.
      this.connect(this._secret, true, { isReconnect: this._everConnected });
      return;
    }
    const gen = this._generation;
    const before = this._lastTimeSyncResponseAt;
    this.sendTimeSync();

    if (this.livenessTimeout) clearTimeout(this.livenessTimeout);
    this.livenessTimeout = setTimeout(() => {
      this.livenessTimeout = null;
      // Superseded by a newer connect, or handleDisconnect already took over.
      if (gen !== this._generation || !this.isConnected) return;
      if (this._lastTimeSyncResponseAt === before) {
        console.warn('[WS] Liveness check failed — forcing reconnect');
        this.connect(this._secret, true, { isReconnect: this._everConnected });
      }
    }, WS_LIVENESS_TIMEOUT_MS);
  }

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

    // Verify-ack watchdog. A socket can OPEN cleanly (onopen fired, readyState OPEN) yet
    // never get verified — the server's verify handler can throw on a transient DB blip
    // and silently drop us, or a reconnect can race the server's rejoin bookkeeping. Such
    // a socket emits no onclose (so handleDisconnect / onReconnectFailed never fire) and
    // keeps receiving the 5s `t` keepalive, so without this it would sit OPEN-but-unverified
    // indefinitely — the user stuck "connecting" with every action silently dropped by the
    // server's verified-gate. If no verify reply lands within WS_VERIFY_TIMEOUT_MS, force a
    // fresh connect+verify. Generation-guarded so a superseded attempt's stale timer can't
    // tear down a newer socket; latch-guarded so we never fight a UAC takeover.
    // dispatchMessage disarms it the moment a verify reply arrives.
    const verifyGen = this._generation;
    const verifyBefore = this._lastVerifyAt;
    if (this.verifyAckTimeout) clearTimeout(this.verifyAckTimeout);
    this.verifyAckTimeout = setTimeout(() => {
      this.verifyAckTimeout = null;
      if (verifyGen !== this._generation || this._dontReconnect || !this.isConnected) return;
      if (this._lastVerifyAt === verifyBefore) {
        console.warn('[WS] No verify ack within timeout — forcing reconnect');
        this.connect(this._secret, true, { isReconnect: this._everConnected });
      }
    }, WS_VERIFY_TIMEOUT_MS);

    // Start pong heartbeat — ported from home.js:2349-2358
    this.pongInterval = setInterval(() => {
      this.send({ type: 'pong' });
    }, PONG_INTERVAL_MS);

    // Start time sync — ported from home.js:1114-1123. The reply cadence (TIME_SYNC_INTERVAL_MS,
    // 10s) doubles as the liveness heartbeat the watchdog below reads (_lastTimeSyncResponseAt).
    this.sendTimeSync();
    this.timeSyncInterval = setInterval(() => {
      this.sendTimeSync();
    }, TIME_SYNC_INTERVAL_MS);

    // Continuous foreground zombie-socket watchdog. Keyed off the last ANSWERED round-trip
    // (_lastTimeSyncResponseAt), NOT off arbitrary inbound: the server's unconditional 5s
    // `t` keepalive would otherwise keep a half-open socket (dead uplink, live downlink)
    // looking alive forever while our sends silently vanish. Seed it to now so a freshly
    // opened socket isn't tripped before its first round-trip lands.
    this._lastTimeSyncResponseAt = Date.now();
    this.livenessWatchdog = setInterval(() => {
      // Respect the _dontReconnect latch (UAC takeover): a background timer must never
      // passively fight another device for the session. An explicit foreground reopen still
      // recovers via handleAppStateChange, which intentionally ignores the latch.
      if (!this.isConnected || this._dontReconnect) return;
      // A confirming probe (verifyLiveness) is already in flight — let it resolve rather
      // than stacking a second one.
      if (this.livenessTimeout) return;
      // No round-trip completed within the window: the socket is SUSPECT. Don't tear it
      // down on this signal alone — a slow link or a brief JS-thread freeze can stall the
      // 30s timeSync without the connection actually being dead. Fire ONE confirming probe
      // (a fresh timeSync with a short grace) and reconnect only if THAT goes unanswered.
      if (Date.now() - this._lastTimeSyncResponseAt > WS_LIVENESS_MAX_SILENCE_MS) {
        console.warn('[WS] No server round-trip within liveness window — probing socket');
        this.verifyLiveness();
      }
    }, WS_LIVENESS_PING_INTERVAL_MS);
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
      // This drop will be followed by a reconnect; flag it so the eventual
      // verify fires the "Reconnected!" toast (only if we'd connected before —
      // a drop before the first verify isn't a "reconnect").
      if (this._everConnected) this._pendingReconnect = true;
      for (const handler of this.disconnectHandlers) {
        try {
          handler();
        } catch (err) {
          console.error('[WS] Disconnect handler error:', err);
        }
      }

      // Auto-reconnect — same flow as web. The disconnect handlers above flip
      // the store to `connecting` (yellow) so the indicator pulses while we
      // retry, instead of showing a hard red disconnect.
      console.log('[WS] Attempting reconnection...');
      const gen = ++this._generation;
      this.initWebsocket(WS_URL, WS_TIMEOUT_MS, this.reconnectBudget, gen).catch(
        (err) => {
          // Only the still-active generation should report failure — a newer
          // connect() supersedes us and owns the connection state.
          if (gen === this._generation && !this._dontReconnect) {
            console.error('[WS] Reconnection failed:', err);
            this.notifyReconnectFailed();
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
      // A timeSync REPLY is our liveness heartbeat: it proves a full round-trip just
      // completed (our send reached the server and came back). Both verifyLiveness and
      // the continuous watchdog capture-and-compare this timestamp. Crucially the `t`
      // keepalive below does NOT touch it, so it can't be forged by a half-open socket.
      this._lastTimeSyncResponseAt = Date.now();
    } else if (data.type === 't') {
      this.updateTimeOffsetFallback(data.t);
    }

    // Reconnect-toast bookkeeping (Fix C). A `verify` after we'd previously
    // connected, during a pending reconnect, is a successful RE-connection.
    if (data.type === 'verify') {
      // This socket is fully established — record it (the verify-ack timer
      // capture-compares _lastVerifyAt) and disarm that timer.
      this._lastVerifyAt = Date.now();
      if (this.verifyAckTimeout) {
        clearTimeout(this.verifyAckTimeout);
        this.verifyAckTimeout = null;
      }
      if (this._everConnected && this._pendingReconnect) {
        this.notifyReconnected();
      }
      this._everConnected = true;
      this._pendingReconnect = false;
    } else if (data.type === 'error') {
      // A UAC / auth error during a reconnect attempt is NOT a success — don't
      // let a later verify (e.g. a guest re-verify) misfire the toast.
      this._pendingReconnect = false;
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
    // Single choke point for the liveness watchdog — connect()/disconnect()/
    // handleDisconnect() all route through here, so a stale watchdog can never
    // force a reconnect against a newer connection.
    if (this.livenessTimeout) {
      clearTimeout(this.livenessTimeout);
      this.livenessTimeout = null;
    }
    // Tear down the continuous liveness watchdog too. connect() runs clearIntervals()
    // before re-opening, so the old watchdog is always cleared before setupConnection
    // starts a fresh one — no duplicate watchdogs can coexist.
    if (this.livenessWatchdog) {
      clearInterval(this.livenessWatchdog);
      this.livenessWatchdog = null;
    }
    // The verify-ack timer is per-connection; clear it here so a superseded attempt's
    // pending timer can't force a reconnect against a newer socket. setupConnection
    // re-arms it on the next open.
    if (this.verifyAckTimeout) {
      clearTimeout(this.verifyAckTimeout);
      this.verifyAckTimeout = null;
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

  /**
   * Forget the stored rejoinCode so the next verify reconnects as a fresh home
   * session instead of rejoining the game. Used when a mid-game drop sends the
   * user home: we don't want the server to replay them back into the game.
   */
  async clearRejoinCode(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(REJOIN_CODE_KEY);
    } catch (err) {
      console.error('[WS] Failed to clear rejoinCode:', err);
    }
  }
}

// Singleton export.
//
// DEV/HMR guard: when Fast Refresh hot-replaces THIS module, a brand-new
// WebSocketService is constructed while the PREVIOUS instance's socket is still
// open and authenticated. The server allows only one live connection per account,
// so the new socket's verify makes the server kick the old one with `uac`
// ("You logged in from another device") — even though it's the same single device.
// Before creating the replacement, tear the old instance down cleanly: stop its
// AppState listener and disconnect() (which nulls the old socket's onmessage so a
// stray `uac` never reaches the store, and closes it so the server frees the slot
// / moves us into the rejoin window). Production evaluates this module once, so the
// guard is inert there.
declare const __DEV__: boolean;
const _g = globalThis as unknown as { __wgWsService?: WebSocketService };

if (__DEV__ && _g.__wgWsService) {
  try {
    _g.__wgWsService.stopAppStateListener();
    _g.__wgWsService.disconnect();
  } catch {}
}

export const wsService = new WebSocketService();

if (__DEV__) {
  _g.__wgWsService = wsService;
}
