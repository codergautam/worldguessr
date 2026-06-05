/**
 * WebSocket lifecycle hook — establishes and manages the WS connection.
 *
 * Should be called once in the root layout so the connection persists
 * across all screens. Ported from the web's Home component which manages
 * the WS connection at the top level.
 *
 * Responsibilities:
 *  - Connect on mount, disconnect on unmount
 *  - Pipe WS messages to multiplayerStore.handleMessage
 *  - React to auth changes (login/logout → reconnect)
 *  - Manage AppState listener for foreground reconnection
 *  - Handle disconnect: reset state, navigate home, show toast (home.js:1882-1927)
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { wsService } from '../services/websocket';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { useAuthStore } from '../store/authStore';

/**
 * Map the current expo-router pathname to one of the three screen values the
 * server accepts (`Player.setScreen` ignores anything else): 'home',
 * 'singleplayer', or 'multiplayer'. Used for presence / active-player counts.
 */
function pathnameToScreen(pathname: string): 'home' | 'singleplayer' | 'multiplayer' {
  // Multiplayer: queue, party lobby/create/join, and the unified game route
  // when launched as multiplayer (/game/multiplayer).
  if (
    pathname.startsWith('/queue') ||
    pathname.startsWith('/party') ||
    pathname.startsWith('/game/multiplayer')
  ) {
    return 'multiplayer';
  }
  // Singleplayer: SP game (/game/singleplayer), daily challenge, onboarding play.
  if (
    pathname.startsWith('/game/singleplayer') ||
    pathname.startsWith('/daily') ||
    pathname.startsWith('/onboarding')
  ) {
    return 'singleplayer';
  }
  // Everything else (tabs, settings, map detail, results, user) is "home".
  return 'home';
}

/**
 * The matchmaking queue is the one piece of multiplayer state the server NEVER
 * restores across a disconnect: ws.js clears `inQueue` / `playersInQueue` on every
 * socket close, handleReconnect (Player.js) replays only game state (`gameId`), and
 * a full server restart wipes the queue outright (even the gamestate-recovery path
 * resets `inQueue`). So a queued player who drops — brief blip, long background, or
 * server restart — is no longer in the queue once they reconnect; leaving the radar
 * spinning would strand them in a phantom queue that never matches.
 *
 * On ANY drop / forced reconnect while sitting in the PRE-MATCH queue (`gameQueued`
 * set, not yet matched into a game), tear the queue state down so the queue screen's
 * `!gameQueued && !inGame` effect pops the user home. They can re-queue once
 * reconnected. An in-progress game or party lobby (inGame / gameData) is untouched —
 * those DO get replayed by the server on reconnect, so we keep the screen mounted.
 *
 * Returns true if it tore a phantom queue down, so the caller can skip the generic
 * "Connection Lost. Reconnecting..." toast (we show the queue-specific one instead).
 */
function tearDownPhantomQueue(): boolean {
  const state = useMultiplayerStore.getState();
  if (!state.gameQueued || state.inGame || state.gameData) return false;
  // Drop the service's shortened in-game reconnect budget NOW (synchronously),
  // before the in-flight reconnect reads it: the disconnect / reconnecting handlers
  // run *before* handleDisconnect()/connect() read reconnectBudget, so flipping this
  // here makes the ongoing reconnect use the full home budget. The user is going
  // home, so it should retry like any home connection — important for a server
  // restart that takes longer than the ~30s in-game budget would tolerate. The
  // inMultiplayer effect would also do this, but only on a later async render.
  wsService.setInGame(false);
  useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
  state.pushToast({ key: 'queueLeftDisconnect', toastType: 'error' });
  return true;
}

export function useWebSocket() {
  const secret = useAuthStore((s) => s.secret);
  const isLoading = useAuthStore((s) => s.isLoading);
  const handleMessage = useMultiplayerStore((s) => s.handleMessage);
  const verified = useMultiplayerStore((s) => s.verified);
  // Are we currently in a multiplayer game / party / matchmaking queue? Drives the
  // service's shortened in-game reconnect budget.
  const inMultiplayer = useMultiplayerStore(
    (s) => s.inGame || !!s.gameData || !!s.gameQueued,
  );
  const pathname = usePathname();

  // Track whether we've done the initial connect
  const hasConnected = useRef(false);

  // Subscribe WS messages → multiplayerStore
  useEffect(() => {
    const unsub = wsService.onMessage(handleMessage);
    return unsub;
  }, [handleMessage]);

  // Handle WS disconnect — ported from home.js:1882-1927 / MultiplayerProvider.
  // A WS drop is RECOVERABLE: the service immediately auto-reconnects and the
  // server replays our live game within its 30s reconnect window. So we must NOT
  // tear down inGame/gameData here — doing so popped the user out of the game
  // (via the game screen's `!inGame` effect) and then bounced them back in when
  // the fresh snapshot arrived: the "screen home → multiplayer" thrash and the
  // "is the game over or am I still in it?" confusion. We only flag the transient
  // connection state (WsIndicator pulses yellow) + show a recoverable toast; the
  // screen stays mounted and re-syncs from the reconnect snapshot. Hard teardown
  // happens only when reconnection truly gives up (onReconnectFailed below).
  useEffect(() => {
    const unsub = wsService.onDisconnect(() => {
      const state = useMultiplayerStore.getState();
      useMultiplayerStore.setState({
        connected: false,
        verified: false,
        connecting: true,
      });
      // Pre-match queue isn't recoverable — pop the user home rather than leaving a
      // phantom radar spinning (see tearDownPhantomQueue). An active game / party
      // lobby IS replayed on reconnect, so for those we keep the screen mounted and
      // just flag a recoverable drop.
      if (!tearDownPhantomQueue() && (state.inGame || state.gameData)) {
        state.pushToast({ key: 'connectionLostRecov', toastType: 'error' });
      }
    });
    return unsub;
  }, []);

  // Auto-reconnection exhausted all retries — NOW it's a real disconnect. Drop
  // from "connecting" (yellow) to disconnected (red) AND tear the game down:
  // clearing inGame/gameQueued lets each multiplayer screen's own state-driven
  // effect pop home (game/[id] on `!inGame`, queue on `!gameQueued && !inGame`).
  useEffect(() => {
    const unsub = wsService.onReconnectFailed(() => {
      useMultiplayerStore.setState({
        connected: false,
        connecting: false,
        inGame: false,
        gameData: null,
        gameQueued: false,
        emotes: [],
      });
    });
    return unsub;
  }, []);

  // A reconnect of an established session STARTED (foreground reopen / liveness /
  // post-drop force-reconnect). Flip to "connecting" so the WsIcon goes yellow +
  // pulsing — WITHOUT the "Connection Lost" toast (that's reserved for genuine
  // mid-session drops via onDisconnect above). The next verify flips us back to
  // connected (green) and fires onReconnected below.
  useEffect(() => {
    const unsub = wsService.onReconnecting(() => {
      // A forced reconnect (foreground after a long background, or a zombie-socket
      // liveness failure) means our socket was already gone — so the server has
      // dropped us from any matchmaking queue. Pop home instead of showing a dead
      // radar; an active game / party lobby is left mounted for the replay.
      tearDownPhantomQueue();
      useMultiplayerStore.setState({
        connected: false,
        verified: false,
        connecting: true,
      });
    });
    return unsub;
  }, []);

  // A reconnect SUCCEEDED — show the universal "Reconnected!" toast. This fires
  // for EVERY successful reconnect (home, queue, in-game), not just game rejoins
  // (which is all the server-sent toast covered). pushReconnectedToast dedupes so
  // the server's game-rejoin toast and this one collapse into a single toast.
  useEffect(() => {
    const unsub = wsService.onReconnected(() => {
      useMultiplayerStore.getState().pushReconnectedToast();
    });
    return unsub;
  }, []);

  // Keep the service informed whether we're in a multiplayer game / party / queue
  // so it shortens the auto-reconnect budget there: a drop we can't recover within
  // a few attempts tears the game down (onReconnectFailed) and pops the user home
  // instead of spinning for minutes. On home the full budget keeps presence alive.
  useEffect(() => {
    wsService.setInGame(inMultiplayer);
  }, [inMultiplayer]);

  // Report the current screen to the server for presence / active-player
  // counting (mirrors web home.js which sends `{ type:'screen', screen }` on
  // every screen change). Gated on `verified`; the dep on `verified` also
  // re-sends the current screen after a reconnect, since the server resets a
  // freshly-(re)connected player's screen to 'home'.
  useEffect(() => {
    if (!verified) return;
    wsService.send({ type: 'screen', screen: pathnameToScreen(pathname) });
  }, [pathname, verified]);

  // Connect / reconnect when auth state changes
  useEffect(() => {
    // Wait for auth to finish loading before connecting
    if (isLoading) return;

    // Connect with the current secret (null = guest)
    wsService.connect(secret);
    hasConnected.current = true;

    // Start listening for app foreground/background
    wsService.startAppStateListener();

    return () => {
      // Don't disconnect on cleanup — the connection should persist.
      // Only stop the AppState listener.
      wsService.stopAppStateListener();
    };
  }, [secret, isLoading]);

  // Update multiplayerStore connection status based on wsService.
  // Only flag `connecting` when connect() will actually (re)establish a
  // socket. If we're already connected with this secret, connect() skips and
  // no fresh `verify` arrives to clear the flag — leaving it stuck true. With
  // `connected` also true the WsIndicator would render a permanent green icon.
  useEffect(() => {
    if (isLoading) return;

    if (wsService.isConnectedWith(secret)) {
      // Already connected with this secret — connect() is a no-op. Make sure
      // we're not stuck showing "connecting".
      useMultiplayerStore.setState({ connecting: false });
    } else {
      useMultiplayerStore.setState({ connecting: true });
      // The verify message handler in the store will set connected=true
      // and connecting=false once the server responds.
    }
  }, [secret, isLoading]);
}
