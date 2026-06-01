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
import { useRouter } from 'expo-router';
import { wsService } from '../services/websocket';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { useAuthStore } from '../store/authStore';

export function useWebSocket() {
  const secret = useAuthStore((s) => s.secret);
  const isLoading = useAuthStore((s) => s.isLoading);
  const handleMessage = useMultiplayerStore((s) => s.handleMessage);
  const router = useRouter();

  // Track whether we've done the initial connect
  const hasConnected = useRef(false);

  // Subscribe WS messages → multiplayerStore
  useEffect(() => {
    const unsub = wsService.onMessage(handleMessage);
    return unsub;
  }, [handleMessage]);

  // Handle WS disconnect — ported from home.js:1882-1927 / MultiplayerProvider.
  // Reset multiplayer state, navigate home if in multiplayer screen, show toast.
  useEffect(() => {
    const unsub = wsService.onDisconnect(() => {
      const state = useMultiplayerStore.getState();

      // Reset multiplayer state (like web's onclose handler), but mark
      // `connecting: true` — onDisconnect only fires when the service is about
      // to auto-reconnect, so the WsIndicator should pulse yellow (connecting),
      // not show a hard red disconnect. This mirrors the web, where onclose
      // resets state and the reconnect loop immediately sets connecting:true.
      useMultiplayerStore.setState({
        connected: false,
        verified: false,
        connecting: true,
        inGame: false,
        gameData: null,
        gameQueued: false,
        emotes: [],
      });

      // If was in a multiplayer game/lobby, navigate home and show toast
      if (state.inGame || state.gameQueued || state.gameData) {
        useMultiplayerStore.setState({
          latestToast: {
            key: 'connectionLostRecov',
            toastType: 'error',
            timestamp: Date.now(),
          },
        });
        try {
          router.dismissAll();
        } catch {
          // Navigation may fail if already on home
        }
      }
    });
    return unsub;
  }, [router]);

  // When auto-reconnection finally gives up, drop from "connecting" (yellow)
  // to a real disconnected state (red).
  useEffect(() => {
    const unsub = wsService.onReconnectFailed(() => {
      useMultiplayerStore.setState({ connected: false, connecting: false });
    });
    return unsub;
  }, []);

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
