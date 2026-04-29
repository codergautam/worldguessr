import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "@/components/auth/auth";
import initWebsocket from "@/components/utils/initWebsocket";
import clientConfig from "@/clientConfig";
import gameStorage from "@/components/utils/localStorage";
import sendEvent from "@/components/utils/sendEvent";
import { getPlatform } from "@/components/utils/getPlatform";

export const initialMultiplayerState = {
  connected: false,
  connecting: false,
  verified: false,
  shouldConnect: false,
  gameQueued: false,
  inGame: false,
  nextGameQueued: false,
  enteringGameCode: false,
  nextGameType: null,
  maxRetries: 50,
  currentRetry: 0,
  createOptions: {
    rounds: 5,
    timePerRound: 30,
    location: "all",
    displayLocation: "All countries",
    progress: false,
  },
  joinOptions: {
    gameCode: null,
    progress: false,
    error: false,
  },
};

const MultiplayerCtx = createContext(null);

const NOOP_CTX = {
  ws: null,
  setWs: () => {},
  multiplayerState: initialMultiplayerState,
  setMultiplayerState: () => {},
  subscribeMessages: () => () => {},
  sendMessage: () => false,
  ensureConnected: () => {},
};

function sendVerify(ws) {
  if (typeof window === "undefined" || !ws || ws.readyState !== 1) return;
  const inCrazyGames = window.location.search.includes("crazygames");

  if (inCrazyGames) {
    if (window.verifyPayload) {
      try {
        ws.send(window.verifyPayload);
      } catch (e) {}
    }
    return;
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let secret = "not_logged_in";
  try {
    const s = window.localStorage.getItem("wg_secret");
    if (s) secret = s;
  } catch (e) {}

  if (secret !== "not_logged_in") {
    window.verified = true;
  }

  const hasPartyLink = new URLSearchParams(window.location.search).has("party");
  try {
    ws.send(
      JSON.stringify({
        type: "verify",
        secret,
        tz,
        rejoinCode: gameStorage.getItem("rejoinCode"),
        skipRejoin: hasPartyLink || undefined,
        platform: getPlatform(),
      })
    );
  } catch (e) {}
}

export function MultiplayerProvider({ children }) {
  const [ws, setWs] = useState(null);
  const [multiplayerState, setMultiplayerState] = useState(initialMultiplayerState);
  // Lazy-connect gate: provider lives in _app.js (so the connection survives
  // route changes), but pages that don't need WS — /banned, /leaderboard,
  // /maps, /mod, /learn, /user, /svEmbed, /privacy-* — should NOT open one
  // just because they happened to render. A consumer (Home) calls
  // ensureConnected() on mount to flip this flag to true; once flipped, it
  // stays true for the rest of the tab's lifetime so navigating from / to
  // /leaderboard and back doesn't churn the socket. Named `connectionEnabled`
  // to avoid clashing with the vestigial `multiplayerState.shouldConnect`
  // field (set in three places, read nowhere).
  const [connectionEnabled, setConnectionEnabled] = useState(false);

  // Stable refs so handlers attached on the WS object can read the latest values
  // without re-binding on every render.
  const wsRef = useRef(null);
  const messageHandlersRef = useRef(new Set());
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  const ensureConnected = useCallback(() => {
    setConnectionEnabled((prev) => (prev ? prev : true));
  }, []);

  const subscribeMessages = useCallback((handler) => {
    messageHandlersRef.current.add(handler);
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  const sendMessage = useCallback((msg) => {
    const w = wsRef.current;
    if (w && w.readyState === 1) {
      try {
        w.send(typeof msg === "string" ? msg : JSON.stringify(msg));
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }, []);

  // Connect / reconnect loop. Runs whenever ws is null and we're not already
  // connecting (which mirrors the prior in-Home logic). Lives in the provider
  // so route changes between pages don't tear down the connection.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!connectionEnabled) return;
    if (ws) return;
    if (multiplayerState.connecting || multiplayerState.connected) return;
    if (window.dontReconnect) return;

    let cancelled = false;

    (async () => {
      try {
        setMultiplayerState((prev) => ({
          ...prev,
          connecting: true,
          shouldConnect: false,
          currentRetry: 1,
        }));

        let newWs = null;
        let currentAttempt = 1;
        const maxAttempts = 50;

        while (currentAttempt <= maxAttempts && !newWs && !cancelled) {
          try {
            setMultiplayerState((prev) => ({ ...prev, currentRetry: currentAttempt }));
            newWs = await initWebsocket(clientConfig().websocketUrl, null, 5000, 0);
            break;
          } catch (error) {
            console.log(`Connection attempt ${currentAttempt}/${maxAttempts} failed`);
            if (currentAttempt < maxAttempts) {
              currentAttempt++;
              await new Promise((resolve) => setTimeout(resolve, 5000));
            } else {
              throw error;
            }
          }
        }

        if (cancelled) {
          if (newWs) {
            try {
              newWs.close();
            } catch (e) {}
          }
          return;
        }

        if (newWs && newWs.readyState === 1) {
          // Attach handlers BEFORE setWs / sending verify so we never miss the
          // verify response in the gap between socket open and the consumer
          // wiring up its own subscriber.
          attachWsHandlers(newWs);

          setWs(newWs);
          setMultiplayerState((prev) => ({
            ...prev,
            connected: true,
            connecting: false,
            currentRetry: 0,
            error: false,
          }));

          sendVerify(newWs);
        } else {
          console.error("WebSocket connection failed after all retries");
          setMultiplayerState((prev) => ({
            ...prev,
            connected: false,
            connecting: false,
            error: true,
          }));
        }
      } catch (error) {
        console.error("WebSocket connection failed:", error);
        setMultiplayerState((prev) => ({
          ...prev,
          connected: false,
          connecting: false,
          error: true,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately NOT depending on multiplayerState.connecting / .connected:
    // we set those ourselves inside the IIFE, which would otherwise trigger
    // the cleanup, flip `cancelled` to true, and cause us to close the
    // freshly-opened socket without ever calling setWs (especially visible on
    // slow wifi where `await initWebsocket` takes longer). The in-body guards
    // against re-entry are still safe because the only other way this effect
    // re-fires is `ws` changing (close → null → reconnect) or connectionEnabled
    // flipping, both of which happen outside the IIFE.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionEnabled, ws]);

  // Attach onmessage / onclose / onerror to a freshly-created socket. The
  // onmessage handler does the connection-level state updates (verify, cnt,
  // error/uac) directly — those need to happen even if no consumer is mounted.
  // Game-level messages are forwarded to all subscribed handlers.
  function attachWsHandlers(socket) {
    socket.onmessage = (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch (e) {
        return;
      }

      if (data.type === "verify") {
        setMultiplayerState((prev) => ({
          ...prev,
          connected: true,
          connecting: false,
          verified: true,
          guestName: data.guestName,
        }));
        if (data.rejoinCode) {
          try {
            gameStorage.setItem("rejoinCode", data.rejoinCode);
          } catch (e) {}
        }
      } else if (data.type === "cnt") {
        setMultiplayerState((prev) => ({ ...prev, playerCount: data.c }));
      } else if (data.type === "error") {
        setMultiplayerState((prev) => ({
          ...prev,
          connecting: false,
          connected: false,
          shouldConnect: false,
          error: data.message,
        }));
        if (data.message === "uac") {
          window.dontReconnect = true;
        }
        if (data.failedToLogin) {
          window.dontReconnect = true;
          try {
            signOut();
          } catch (e) {}
        }
        // Note: server will close the socket itself after sending uac. We do
        // not call ws.close() here to avoid racing with the server-side close.
      }

      // Forward to all subscribers (Home consumes these for translated toasts,
      // game-state updates, time sync, chat, etc.).
      messageHandlersRef.current.forEach((handler) => {
        try {
          handler(data);
        } catch (e) {
          console.error("WS subscriber threw:", e);
        }
      });
    };

    socket.onclose = () => {
      console.log("ws closed");
      if (typeof window !== "undefined" && !window.isPageClosing) {
        try {
          sendEvent("multiplayer_disconnect");
        } catch (e) {}
      }
      setWs(null);
      setMultiplayerState((prev) => ({
        ...initialMultiplayerState,
        maxRetries: prev.maxRetries,
        currentRetry: prev.currentRetry,
      }));
    };

    socket.onerror = () => {
      console.log("ws error");
      if (typeof window !== "undefined" && !window.isPageClosing) {
        try {
          sendEvent("multiplayer_disconnect");
        } catch (e) {}
      }
      setWs(null);
      setMultiplayerState((prev) => ({
        ...initialMultiplayerState,
        maxRetries: prev.maxRetries,
        currentRetry: prev.currentRetry,
      }));
    };
  }

  const value = {
    ws,
    setWs,
    multiplayerState,
    setMultiplayerState,
    subscribeMessages,
    sendMessage,
    ensureConnected,
  };

  return <MultiplayerCtx.Provider value={value}>{children}</MultiplayerCtx.Provider>;
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerCtx);
  if (!ctx) return NOOP_CTX;
  return ctx;
}

export default MultiplayerProvider;
