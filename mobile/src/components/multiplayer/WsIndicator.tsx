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

  const prevConnected = useRef(connected);
  const prevConnecting = useRef(connecting);
  const connectingStartTime = useRef<number | null>(null);
  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pulse animation loop
  useEffect(() => {
    if (!showIcon || connected) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
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
        // Just started connecting — wait 3s before showing
        connectingStartTime.current = Date.now();
        connectingTimer.current = setTimeout(() => {
          setShowIcon(true);
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }, 3000);
      }
    } else if (!connected) {
      // Disconnected — show red immediately
      setShowIcon(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (connected && !wasConnected) {
      // Just reconnected
      const timeSinceConnecting = connectingStartTime.current
        ? Date.now() - connectingStartTime.current
        : 0;

      if (timeSinceConnecting >= 3000 && showIcon) {
        // Was showing indicator — show green briefly then slide out
        hideTimer.current = setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: 80,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => setShowIcon(false));
        }, 1500);
      } else {
        // Fast connect — stay hidden
        setShowIcon(false);
        slideAnim.setValue(80);
      }
      connectingStartTime.current = null;
    } else if (connected) {
      // Already connected — hide
      setShowIcon(false);
      slideAnim.setValue(80);
    }

    prevConnected.current = connected;
    prevConnecting.current = connecting;
  }, [connected, connecting]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (connectingTimer.current) clearTimeout(connectingTimer.current);
    };
  }, []);

  if (!showIcon) return null;

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
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
});
