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
import { useMultiplayerStore, queueTeardownState } from '../store/multiplayerStore';
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
  // The full queue slice, not just gameQueued — a 2v2 stage-2 drop must also
  // clear queueStage/queueMyId/lobbyIntent or the nav machine reads a stale
  // stage after reconnect.
  useMultiplayerStore.setState({ ...queueTeardownState });
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
  // The onDisconnect handler is registered once, so it can't close over the live
  // pathname. Mirror it into a ref it can read at fire time.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Track whether we've done the initial connect
  const hasConnected = useRef(false);

  // Subscribe WS messages → multiplayerStore
  useEffect(() => {
    const unsub = wsService.onMessage(handleMessage);
    return unsub;
  }, [handleMessage]);

  // Handle WS disconnect — ported from home.js:1882-1927 / MultiplayerProvider.
  // Flag the transient connection state (WsIndicator pulses yellow); the service
  // auto-reconnects underneath.
  //
  // A drop while in an active game/party (NOT the post-game results screen) sends
  // the user home: freezing them on an un-actionable game while we silently retry
  // was confusing. We leave the game — tear down inGame/gameData (the game screen's
  // `!inGame` effect pops home) — and reconnect like a home session: setInGame(false)
  // gives the in-flight retry the full budget so it keeps pulsing yellow instead of
  // giving up to red. The rejoinCode is deliberately KEPT (it used to be cleared
  // here): it's a guest session's ONLY rejoin identity, and the server rejoins
  // accounts via their secret regardless — so clearing it never stopped the replay
  // for logged-in users, it only stranded guests at home after a recoverable drop
  // (e.g. a server restart, whose gamestate snapshot keeps them rejoinable). If the
  // server still holds the session, its `game` replay flips inGame back on and
  // home's auto-nav re-enters — exactly like web, and exactly like the
  // onReconnecting housekeeping path below. A drop on home / results just flags
  // connecting.
  useEffect(() => {
    const unsub = wsService.onDisconnect(() => {
      const state = useMultiplayerStore.getState();
      useMultiplayerStore.setState({
        connected: false,
        verified: false,
        connecting: true,
        // A GENUINE mid-session drop (server died / network cut) — not a
        // housekeeping reconnect (those go through onReconnecting and never
        // fire this handler). WsIndicator surfaces this on every screen; it
        // stays set until the next verify so the whole drop→retry→red arc
        // remains visible even after the teardown below pops the user home.
        connectionDropped: true,
      });

      // Pre-match queue isn't recoverable — pop home (see tearDownPhantomQueue).
      if (tearDownPhantomQueue()) return;
      if (!state.inGame && !state.gameData) return;

      // Reviewing results (route reads from params, not the live game) — don't
      // yank the user off it; just keep reconnecting quietly.
      if (pathnameRef.current.startsWith('/game/results')) {
        state.pushToast({ key: 'connectionLostRecov', toastType: 'error' });
        return;
      }

      // Active game/party drop → leave and go home. setInGame(false) must run
      // BEFORE the service reads its reconnect budget (synchronous here, like
      // tearDownPhantomQueue) so the retry uses the full home budget.
      // queueTeardownState covers 2v2 stage-1: queued (gameQueued '2v2') while
      // still inside the staging lobby, so tearDownPhantomQueue's early-return
      // (inGame true) never handled it.
      wsService.setInGame(false);
      useMultiplayerStore.setState({
        inGame: false,
        gameData: null,
        emotes: [],
        ...queueTeardownState,
      });
      state.pushToast({ key: 'connectionLostRecov', toastType: 'error' });
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
        // Also reached DIRECTLY on a close under the terminal latch (uac /
        // failedToLogin) — without passing through onDisconnect/onReconnecting,
        // which are what used to clear `verified` on every other path here.
        verified: false,
        connecting: false,
        inGame: false,
        gameData: null,
        emotes: [],
        ...queueTeardownState,
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
      // Drop the preserved game state on a forced reconnect, mirroring the web
      // client whose socket `onclose` resets multiplayerState to initial
      // (MultiplayerProvider.js). The SERVER is the source of truth for whether
      // we're still in a game: it keeps a disconnected player rejoinable for only
      // ~30s (ws.js eviction loop), then deletes the player's session entirely. A
      // reopen past that window is a brand-new connection the server can't tie to
      // the old game, so it replies with `verify` but NOTHING about the game — no
      // `game` replay, no `gameShutdown`. We used to leave inGame/gameData mounted
      // "for the replay"; when the replay never came (the common case — an app is
      // easily backgrounded for >30s) the user was stranded on a frozen, dead game
      // screen, unable to interact. Clearing it here lets the game screen's
      // `!inGame` effect pop home immediately. If the server DOES still have the
      // game (we keep the rejoinCode, so a <30s rejoin still works), its `game`
      // replay flips inGame back on and home.tsx's auto-nav effect re-enters the
      // game — exactly like web restores its screen from the server payload.
      // tearDownPhantomQueue also clears a matchmaking queue (never restored on a drop).
      tearDownPhantomQueue();
      useMultiplayerStore.setState({
        connected: false,
        verified: false,
        connecting: true,
        // A reconnect starts from "not in a game"; only a server replay puts us
        // back. Matches web's onclose reset and the onDisconnect teardown above.
        // The queue slice must go too (stage-1 slips past tearDownPhantomQueue's
        // inGame early-return; a stage-2 rejoin gets re-synced by the server's
        // enter2v2Queue replay if the teammate kept searching).
        inGame: false,
        gameData: null,
        emotes: [],
        ...queueTeardownState,
      });
    });
    return unsub;
  }, []);

  // A reconnect SUCCEEDED — show the "Reconnected!" toast, but ONLY when we're in
  // a multiplayer context (active game, party lobby, or matchmaking queue) where the
  // connection actually matters. On home / singleplayer / daily a reconnect is just
  // a foreground-after-idle housekeeping event — onDisconnect stays silent there too
  // (it returns early before toasting), so the reconnect must be equally silent or
  // the user sees a lone "Reconnected!" pop after simply reopening the app. Game
  // rejoins are still covered: the server sends its own 'reconnected' toast through
  // pushReconnectedToast, and that dedupes against this one.
  useEffect(() => {
    const unsub = wsService.onReconnected(() => {
      const state = useMultiplayerStore.getState();
      if (!state.inGame && !state.gameData && !state.gameQueued) return;
      state.pushReconnectedToast();
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
      // Already connected with this secret — connect() is a no-op, so no fresh
      // `verify` will arrive to set connected/verified. Make sure we're not
      // stuck showing "connecting", and re-sync connected/verified from the live
      // socket: if it's genuinely open + verified (e.g. after a Fast-Refresh
      // store reset, or a non-terminal `error` that cleared the flags without
      // closing the socket), the store must reflect that or the home-screen
      // multiplayer buttons falsely report "Not connected".
      useMultiplayerStore.setState(
        wsService.isVerified
          ? { connecting: false, connected: true, verified: true }
          : { connecting: false },
      );
    } else {
      useMultiplayerStore.setState({ connecting: true });
      // The verify message handler in the store will set connected=true
      // and connecting=false once the server responds.
    }
  }, [secret, isLoading]);
}
