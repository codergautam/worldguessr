import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { signOut } from "@/components/auth/auth";
import initWebsocket from "@/components/utils/initWebsocket";
import { usesPanorama } from "../../shared/modes/catalog.js";
import clientConfig from "@/clientConfig";
import gameStorage from "@/components/utils/localStorage";
import sendEvent from "@/components/utils/sendEvent";
import { getPlatform } from "@/components/utils/getPlatform";
import { isCrazyGamesHost } from "@/components/utils/getPlatform";

export const initialMultiplayerState = {
  connected: false,
  connecting: false,
  verified: false,
  gameQueued: false,
  inGame: false,
  nextGameQueued: false,
  // Which pre-game lobby screen the multiplayer screen is showing:
  // null | 'join' (code entry) | 'party' | '2v2' (created with that intent)
  lobbyIntent: null,
  nextGameType: null,
  maxRetries: 50,
  currentRetry: 0,
  // Pending received friend requests. Count only — see the "friends" branch in
  // attachWsHandlers. Feeds the badge on the player card's Friends menu row.
  friendRequestCount: 0,
  createOptions: {
    rounds: 5,
    timePerRound: 30,
    location: "all",
    displayLocation: "All countries",
    // Quiz mode + region (shared/modes/catalog.js). Always sent explicitly:
    // the server keeps its current value for a missing field.
    mode: "classic",
    region: "all",
    progress: false,
  },
  joinOptions: {
    gameCode: null,
    progress: false,
    error: false,
  },
};

// A drop in a game or lobby keeps that screen for a short time, so a network
// blip that the server's rejoin heals does not tear the game down and build
// it again. The screen is reset only when the rejoin fails.
const HOLD_MS = 10000; // no socket by then: show "Connecting" as before
const REPLAY_WAIT_MS = 2000; // verified, and the server sent no game: it is gone

const MultiplayerCtx = createContext(null);

const NOOP_CTX = {
  ws: null,
  setWs: () => {},
  multiplayerState: initialMultiplayerState,
  setMultiplayerState: () => {},
  subscribeMessages: () => () => {},
  sendMessage: () => false,
  ensureConnected: () => {},
  rejoinPending: () => false,
  socketOpen: () => false,
  leaveHeldGame: () => {},
};

// skipRejoin: the player left the game while the socket was down, so the
// server must drop the seat, not replay the game.
function sendVerify(ws, skipRejoin) {
  if (typeof window === "undefined" || !ws || ws.readyState !== 1) return;
  const inCrazyGames = isCrazyGamesHost();

  if (inCrazyGames) {
    if (window.verifyPayload) {
      try {
        // The payload was built once; a guest's rejoin code may be newer.
        const payload = JSON.parse(window.verifyPayload);
        payload.rejoinCode = gameStorage.getItem("rejoinCode");
        if (skipRejoin) payload.skipRejoin = true;
        ws.send(JSON.stringify(payload));
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
        skipRejoin: skipRejoin || hasPartyLink || undefined,
        platform: getPlatform(),
        // This bundle can render team parties / 2v2 duels; the server locks
        // team surfaces to clients that announce this (rollout gate).
        teamSupport: true,
        // Same gate for the quiz modes (flags / shapes / languages).
        quizModes: true,
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
  // /leaderboard and back doesn't churn the socket.
  const [connectionEnabled, setConnectionEnabled] = useState(false);

  // Stable refs so handlers attached on the WS object can read the latest values
  // without re-binding on every render.
  const wsRef = useRef(null);
  const messageHandlersRef = useRef(new Set());
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);
  const stateRef = useRef(multiplayerState);
  useEffect(() => {
    stateRef.current = multiplayerState;
  }, [multiplayerState]);
  // { held, deadline, replay } from a drop in a game until its rejoin is
  // settled; `held` is true while the game is still on screen.
  const holdRef = useRef(null);
  // The player left a held game: the next verify says so (see sendVerify).
  const skipRejoinRef = useRef(false);

  // The connection fields stay; everything about the game goes.
  const dropGame = () => setMultiplayerState((prev) => ({
    ...initialMultiplayerState,
    connected: prev.connected,
    connecting: prev.connecting,
    verified: prev.verified,
    guestName: prev.guestName,
    playerCount: prev.playerCount,
    friendRequestCount: prev.friendRequestCount,
    maxRetries: prev.maxRetries,
    currentRetry: prev.currentRetry,
  }));
  const tellRejoinFailed = (lost) => messageHandlersRef.current.forEach((handler) => {
    try {
      handler({ type: "rejoinFailed", lost });
    } catch (e) {}
  });
  const clearHold = () => {
    const hold = holdRef.current;
    if (!hold) return null;
    clearTimeout(hold.deadline);
    clearTimeout(hold.replay);
    holdRef.current = null;
    return hold;
  };
  // True from a drop in a held game until its rejoin is settled. A message
  // for the game cannot reach the server before that.
  const rejoinPending = useCallback(() => !!holdRef.current, []);
  // Back during the hold. The caller clears the game state.
  const leaveHeldGame = useCallback(() => {
    clearHold();
    skipRejoinRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // No socket by the deadline: the game comes off the screen.
  const armDeadline = (hold) => {
    hold.deadline = setTimeout(() => {
      if (holdRef.current !== hold || !hold.held) return;
      hold.held = false;
      // The game already went another way (the player's own exit).
      if (!stateRef.current.inGame) return;
      dropGame();
      tellRejoinFailed(true);
    }, HOLD_MS);
  };
  // For a caller that cannot wait for the `ws` state to render.
  const socketOpen = useCallback(() => !!wsRef.current, []);
  const socketDropped = () => {
    if (typeof window !== "undefined" && !window.isPageClosing) {
      try {
        sendEvent("multiplayer_disconnect");
      } catch (e) {}
    }
    setWs(null);
    wsRef.current = null;
    const st = stateRef.current;
    const canHold = typeof window !== "undefined" && !window.dontReconnect && !window.isPageClosing;
    // `connecting` from this same update when the connect loop will run, so
    // the status icon does not show "disconnected" for one frame first.
    const reset = (prev) => ({
      ...initialMultiplayerState,
      connecting: canHold,
      maxRetries: prev.maxRetries,
      currentRetry: prev.currentRetry,
    });
    // Street View games only: a quiz round locks an answer on one click, and
    // a click with no socket would be lost.
    if (!canHold || !(holdRef.current || (st.inGame && st.gameData && usesPanorama(st.gameData.mode)))) {
      clearHold();
      setMultiplayerState(reset);
      return;
    }
    if (holdRef.current) {
      // A second drop before the rejoin was settled. The first deadline
      // stands, unless a verify reply had stopped it.
      const hold = holdRef.current;
      clearTimeout(hold.replay);
      hold.replay = null;
      if (hold.held && !hold.deadline) armDeadline(hold);
    } else {
      const hold = { held: true, replay: null };
      armDeadline(hold);
      holdRef.current = hold;
    }
    const held = holdRef.current.held;
    setMultiplayerState((prev) => (held && prev.inGame
      ? { ...prev, connected: false, connecting: true, verified: false }
      : reset(prev)));
  };

  const ensureConnected = useCallback(() => {
    // Self-embed guard: if this page is running inside an iframe of ITSELF
    // (e.g. a pano iframe whose src was once assigned "" and resolved to the
    // site's own URL), opening a WS here would present the same account
    // secret twice and get the REAL tab 'uac'-kicked ("logged in from
    // another device").
    //
    // A self-embed always loads the embedding document's OWN URL, so the
    // ancestor is same-origin AND at the same pathname. Origin alone is not
    // enough: zip portals (DuckMath, and any host that unpacks the Poki-style
    // build on its own domain) wrap index.html in a same-origin loader page
    // (pre.html → ./index.html), and that used to trip this guard so the WS
    // never opened and every multiplayer button showed "Not Connected".
    // Third-party embeds (CrazyGames, Poki, CMG) are cross-origin: reading
    // an ancestor's location throws, which ends the walk and connects.
    try {
      if (typeof window !== "undefined" && window.self !== window.top) {
        let ancestor = window.parent;
        for (let depth = 0; depth < 8; depth++) {
          // Throws on a cross-origin ancestor: nothing above it can be us.
          if (ancestor.location.origin === window.location.origin
            && ancestor.location.pathname === window.location.pathname) {
            return;
          }
          if (ancestor === window.top) break;
          ancestor = ancestor.parent;
        }
      }
    } catch (e) { /* cross-origin ancestor — a real embed, connect normally */ }
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
    // No `connecting` check: a drop sets it itself (see socketDropped), and
    // a loop that is already running never sees `ws` change under it.
    if (multiplayerState.connected) return;
    if (window.dontReconnect) return;

    let cancelled = false;

    (async () => {
      try {
        setMultiplayerState((prev) => ({
          ...prev,
          connecting: true,
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

          // Now, not after the render: a reply can arrive first.
          wsRef.current = newWs;
          setWs(newWs);
          setMultiplayerState((prev) => ({
            ...prev,
            connected: true,
            connecting: false,
            currentRetry: 0,
            error: false,
          }));

          sendVerify(newWs, skipRejoinRef.current);
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

      const hold = holdRef.current;
      if (hold && data.type === "verify") {
        // The server replays the game right after this when the seat is kept.
        // The socket is back, so the replay wait decides now, not the deadline.
        if (hold.held) {
          clearTimeout(hold.deadline);
          hold.deadline = null;
        }
        clearTimeout(hold.replay);
        hold.replay = setTimeout(() => {
          if (holdRef.current !== hold) return;
          clearHold();
          // After the deadline the player was already told and sent home.
          if (!hold.held || !stateRef.current.inGame) return;
          dropGame();
          tellRejoinFailed(false);
        }, REPLAY_WAIT_MS);
      } else if (hold && data.type === "game") {
        clearHold();
        // The same round carries on in place. Anything else (the game moved
        // on while we were away) goes through the fresh-rejoin path.
        const was = stateRef.current.gameData;
        const loc = (gd) => gd?.locations?.[data.curRound - 1];
        if (hold.held && (!was || was.state !== data.state || was.curRound !== data.curRound || was.code !== data.code
          || loc(was)?.lat !== loc(data)?.lat || loc(was)?.long !== loc(data)?.long)) {
          data.rejoinFresh = true;
        }
      } else if (hold && data.type === "gameShutdown") {
        clearHold();
        // The game on screen ended while we were away: home says so.
        if (hold.held) data.afterDrop = true;
      }

      if (data.type === "verify") {
        skipRejoinRef.current = false;
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
        // Identity guard, same as the friends branch below: the server sends
        // this on a fixed cadence and the count is usually unchanged; without
        // the guard every beat minted a new context value and re-rendered
        // every multiplayerState consumer in the tree.
        setMultiplayerState((prev) => (prev.playerCount === data.c ? prev : { ...prev, playerCount: data.c }));
      } else if (data.type === "friends") {
        // JUST THE COUNT, for the player card's Friends badge. The friends
        // button used to sit in the corner permanently; it is a menu row now,
        // so a pending request has to announce itself from outside the menu or
        // it is invisible until you go looking.
        //
        // Deliberately NOT the arrays. components/friendModal.js subscribes to
        // this same message for the full lists and owns every mutation on them;
        // it needs the arrays, this needs one integer, and lifting its state up
        // here to save that integer would mean rewiring a working modal.
        const cnt = Array.isArray(data.receivedRequests) ? data.receivedRequests.length : 0;
        setMultiplayerState((prev) => (prev.friendRequestCount === cnt ? prev : { ...prev, friendRequestCount: cnt }));
      } else if (data.type === "error") {
        setMultiplayerState((prev) => ({
          ...prev,
          connecting: false,
          connected: false,
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
      // game-state updates, time sync, etc.).
      messageHandlersRef.current.forEach((handler) => {
        try {
          handler(data);
        } catch (e) {
          console.error("WS subscriber threw:", e);
        }
      });
    };

    // Once per socket: an error is followed by a close.
    let dropped = false;
    const onDrop = () => {
      if (dropped) return;
      dropped = true;
      socketDropped();
    };
    socket.onclose = onDrop;

    socket.onerror = onDrop;
  }

  // Memoized: this provider is mounted in _app.js above the entire app, so a
  // fresh object here hands every consumer a new context value on every
  // provider render and defeats any memo boundary that reads the context.
  const value = useMemo(() => ({
    ws,
    setWs,
    multiplayerState,
    setMultiplayerState,
    subscribeMessages,
    sendMessage,
    ensureConnected,
    rejoinPending,
    socketOpen,
    leaveHeldGame,
  }), [ws, setWs, multiplayerState, setMultiplayerState, subscribeMessages, sendMessage, ensureConnected, rejoinPending, socketOpen, leaveHeldGame]);

  return <MultiplayerCtx.Provider value={value}>{children}</MultiplayerCtx.Provider>;
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerCtx);
  if (!ctx) return NOOP_CTX;
  return ctx;
}

export default MultiplayerProvider;
