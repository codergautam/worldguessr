/**
 * WebSocket connection status indicator.
 * Ported from web's wsIcon.js — pulsating broadcast icon.
 *
 * - Hidden when connected (fast connect)
 * - Yellow pulsating after 3s of connecting
 * - Red when disconnected
 * - Green briefly when reconnected after showing yellow/red
 */

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMultiplayerStore } from '../../store/multiplayerStore';

const COLOR_CONNECTED = '#22c55e';
const COLOR_CONNECTING = '#f59e0b';
const COLOR_DISCONNECTED = '#ef4444';

export default function WsIndicator() {
  const insets = useSafeAreaInsets();
  const connected = useMultiplayerStore((s) => s.connected);
  const connecting = useMultiplayerStore((s) => s.connecting);

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
        // Just started connecting — hide, then re-show (yellow) after 3s so a
        // fast (re)connect never flashes the icon. Matches web's wsIcon.js.
        connectingStartTime.current = Date.now();
        setShowIcon(false);
        connectingTimer.current = setTimeout(() => {
          setShowIcon(true);
        }, 3000);
      }
    } else if (!connected) {
      // Real disconnect — show red immediately, but ONLY if we've previously
      // been connected. On the very first render we're in (false,false) limbo
      // before useWebSocket flips connecting:true; flashing red there is just
      // noise.
      if (hasEverConnected.current) {
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
  }, [connected, connecting]);

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
