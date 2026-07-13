/**
 * WebSocket connection status indicator.
 * Ported from web's wsIcon.js — pulsating broadcast icon.
 *
 * - Hidden when connected (fast connect)
 * - Yellow pulsating after 3s of connecting
 * - Red when disconnected
 * - Green briefly when reconnected after showing yellow/red
 *
 * Visibility rules (a deliberate deviation from web, whose navbar shows the icon
 * on every screen except onboarding):
 *
 *  - In a MULTIPLAYER context (active game, party lobby, matchmaking queue):
 *    the full behavior above.
 *  - Everywhere else, HOUSEKEEPING transitions stay hidden: a
 *    foreground-after-idle reconnect or a login/logout secret swap is background
 *    presence maintenance, not something to surface (no yellow pulse, no green
 *    "reconnected" flash — mirroring the silenced reconnect toast).
 *  - BUT a genuine connection problem surfaces on EVERY screen except
 *    onboarding, matching web: an established socket dropping
 *    (`connectionDropped` — instant yellow while auto-reconnect retries), a
 *    cold-start connect that can't establish (yellow after the 3s reveal —
 *    healthy app-open connects finish first and never show), and the
 *    hard-disconnected end state (red — retry budget exhausted, or a terminal
 *    uac/auth error). Gating these on the multiplayer context made red
 *    UNREACHABLE: every path that reaches connected:false/connecting:false also
 *    tears down inGame/gameData/queue in the same store update (onDisconnect
 *    pops the user home; onReconnectFailed clears both together), so the gate
 *    always hid the icon before red could ever render.
 */

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMultiplayerStore } from '../../store/multiplayerStore';

const COLOR_CONNECTED = '#22c55e';
const COLOR_CONNECTING = '#f59e0b';
const COLOR_DISCONNECTED = '#ef4444';

export default function WsIndicator() {
  const insets = useSafeAreaInsets();
  const connected = useMultiplayerStore((s) => s.connected);
  const connecting = useMultiplayerStore((s) => s.connecting);
  const connectionDropped = useMultiplayerStore((s) => s.connectionDropped);
  // Transient connection states only surface in a multiplayer context (active
  // game, party lobby, or matchmaking queue); genuine failures surface anywhere.
  // See the file header and the guard at the top of the status effect below.
  const inMultiplayer = useMultiplayerStore(
    (s) => s.inGame || !!s.gameData || !!s.gameQueued,
  );
  // Web hides the icon during onboarding (navbar: shown={screen !== 'onboarding'});
  // a connection radar over the first-run tutorial is noise. Same here.
  const pathname = usePathname();
  const inOnboarding = pathname.startsWith('/onboarding');

  const [showIcon, setShowIcon] = useState(false);
  const slideAnim = useRef(new Animated.Value(80)).current; // off-screen right
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Initialize the prev-refs to the IDLE state (false/false), NOT the current
  // store value. WsIndicator lives behind the splash/loading gate in _layout, so
  // on a slow connect it mounts AFTER useWebSocket has already flipped
  // `connecting:true`. Seeding these refs from the live value would make the first
  // effect run see `wasConnecting===true`, miss the false→true edge, and never
  // schedule the 3s reveal timer — leaving the yellow icon permanently hidden.
  // Pretending we were idle before mount lets that first run detect the edge and
  // reveal normally.
  const prevConnected = useRef(false);
  const prevConnecting = useRef(false);
  const connectingStartTime = useRef<number | null>(null);
  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've ever reached a connected state. Until then, the
  // (connected=false, connecting=false) state is just the pre-bootstrap
  // limbo before useWebSocket sets connecting:true — NOT a real disconnect,
  // so we mustn't flash the red indicator on every cold start.
  const hasEverConnected = useRef(false);
  // Track whether a connect attempt has ever STARTED. Distinguishes the
  // pre-bootstrap (false,false) limbo above from the (false,false) that follows
  // a cold-start connect exhausting its whole retry budget against an
  // unreachable server — that one IS a real disconnect and must go red, even
  // though we never managed to connect.
  const hasEverStartedConnecting = useRef(false);

  // Pulse animation loop
  useEffect(() => {
    if (!showIcon || connected) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showIcon, connected]);

  useEffect(() => {
    if (connecting) hasEverStartedConnecting.current = true;

    // A genuine connection problem overrides the multiplayer-only gate (except
    // during onboarding — web hides the icon there too):
    //  - hardDisconnected: not connected and not even retrying. The red state.
    //    It can only be reached AFTER the multiplayer teardown (onReconnectFailed
    //    / terminal error clear inGame/gameData in the same update that clears
    //    `connecting`), so it MUST bypass the gate or it never renders.
    //  - connectionDropped: an established socket dropped for real and the
    //    service is retrying — pulse yellow immediately wherever the user is.
    //    Housekeeping reconnects never set this flag, so those stay silent.
    //  - Still trying to establish the session's FIRST connection (cold start
    //    against a slow/unreachable server): surface it like web does — the
    //    3s reveal timer below filters every healthy app-open connect, so only
    //    genuinely struggling connects show. Housekeeping stays exempt because
    //    it requires hasEverConnected.
    const hardDisconnected =
      !connected &&
      !connecting &&
      (hasEverConnected.current || hasEverStartedConnecting.current);
    const surfaceAnywhere =
      hardDisconnected ||
      connectionDropped ||
      (connecting && !hasEverConnected.current);

    // Otherwise, outside multiplayer the radar never shows — kill any in-flight
    // reveal/hold and stay hidden. This is what silences the yellow→green flash a
    // home-screen foreground-after-idle reconnect would otherwise produce. We still
    // keep the prev-refs in sync and record hasEverConnected so that when the user
    // DOES enter multiplayer, the first genuine drop can flash yellow instantly.
    if (inOnboarding || (!inMultiplayer && !surfaceAnywhere)) {
      if (connected) hasEverConnected.current = true;
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (connectingTimer.current) {
        clearTimeout(connectingTimer.current);
        connectingTimer.current = null;
      }
      connectingStartTime.current = null;
      setShowIcon(false);
      prevConnected.current = connected;
      prevConnecting.current = connecting;
      return;
    }

    const wasConnected = prevConnected.current;
    const wasConnecting = prevConnecting.current;

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (connectingTimer.current) {
      clearTimeout(connectingTimer.current);
      connectingTimer.current = null;
    }

    if (connecting) {
      if (!wasConnecting) {
        connectingStartTime.current = Date.now();
        if (hasEverConnected.current && !connected) {
          // A genuine mid-session RECONNECT: the socket actually dropped, so the
          // store cleared `connected` (onDisconnect / onReconnecting) BEFORE
          // flipping `connecting`. Show the yellow indicator INSTANTLY — the user
          // needs to know they're offline the moment it happens (e.g. just bounced
          // home from a multiplayer game) — not 3s later.
          setShowIcon(true);
        } else {
          // First app-open connect, OR a CONTROLLED reconnect that still holds a
          // live socket — `connected` is still true because we tore the old socket
          // down cleanly (login/logout swaps the secret via connect(reconnect:false);
          // the auth-change effect flips `connecting` without ever clearing
          // `connected`). Hide, then reveal (yellow) only after 3s if still pending,
          // so the fast secret-swap reconnect clears this timer first and never
          // flashes the icon in/out. Matches web's wsIcon.js.
          setShowIcon(false);
          connectingTimer.current = setTimeout(() => {
            setShowIcon(true);
          }, 3000);
        }
      }
    } else if (!connected) {
      // Real disconnect — show red immediately. hardDisconnected (computed
      // above; connecting is false in this branch) excludes only the mount-time
      // (false,false) limbo before useWebSocket flips connecting:true — flashing
      // red on every cold start would be noise. A cold-start connect that
      // exhausted its retry budget without EVER connecting passes via
      // hasEverStartedConnecting: that's a real outage, not limbo.
      if (hardDisconnected) {
        setShowIcon(true);
      }
    } else if (connected && !wasConnected) {
      hasEverConnected.current = true;
      // Just reconnected
      const timeSinceConnecting = connectingStartTime.current
        ? Date.now() - connectingStartTime.current
        : 0;

      if (timeSinceConnecting >= 3000 && showIcon) {
        // Was showing indicator — keep visible (green) briefly then hide
        hideTimer.current = setTimeout(() => {
          setShowIcon(false);
        }, 1500);
      } else {
        // Fast connect — stay hidden
        setShowIcon(false);
      }
      connectingStartTime.current = null;
    } else if (connected) {
      // Already connected — hide
      setShowIcon(false);
    }

    prevConnected.current = connected;
    prevConnecting.current = connecting;
  }, [connected, connecting, connectionDropped, inMultiplayer, inOnboarding]);

  // Drive slide animation after React commits the new showIcon state.
  // Starting animations inline above could fire before the View is mounted,
  // making the icon pop in (or never slide) instead of gliding from off-screen.
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: showIcon ? 0 : 80,
      duration: 350,
      easing: showIcon ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showIcon, slideAnim]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (connectingTimer.current) clearTimeout(connectingTimer.current);
    };
  }, []);

  // NOTE: do NOT return null when hidden — that would unmount the View and
  // cancel the slide-out animation. We keep it mounted and let `slideAnim`
  // translate it off-screen (translateX: 80).

  const color = connected
    ? COLOR_CONNECTED
    : connecting
      ? COLOR_CONNECTING
      : COLOR_DISCONNECTED;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 100,
          transform: [{ translateX: slideAnim }, { scale: pulseAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.icon, { borderColor: color }]}>
        <Ionicons name="radio" size={24} color={color} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 15,
    zIndex: 9999,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
});
