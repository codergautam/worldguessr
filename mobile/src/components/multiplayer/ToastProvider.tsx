/**
 * Toast notification surface for server-driven multiplayer events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, t } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';
import { useMultiplayerStore, ToastData } from '../../store/multiplayerStore';

const TOAST_DURATION = 4000;
const HIDDEN_Y = -120;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function ToastProvider() {
  const insets = useSafeAreaInsets();
  const latestToast = useMultiplayerStore((s) => s.latestToast);
  const [visible, setVisible] = useState(false);
  const [currentToast, setCurrentToast] = useState<ToastData | null>(null);
  const translateY = useSharedValue(HIDDEN_Y);
  const opacity = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (finishTimer.current) {
      clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    translateY.value = withTiming(HIDDEN_Y, {
      duration: 250,
      easing: Easing.in(Easing.cubic),
    });
    opacity.value = withTiming(0, { duration: 200 });
    finishTimer.current = setTimeout(() => {
      setVisible(false);
      setCurrentToast(null);
    }, 260);
  }, [clearTimers, opacity, translateY]);

  useEffect(() => {
    clearTimers();

    if (!latestToast) {
      dismiss();
      return;
    }

    setCurrentToast(latestToast);
    setVisible(true);
    translateY.value = HIDDEN_Y;
    opacity.value = 0;
    translateY.value = withTiming(0, {
      duration: 300,
      easing: Easing.out(Easing.back(1.2)),
    });
    opacity.value = withTiming(1, { duration: 180 });
    hideTimer.current = setTimeout(dismiss, TOAST_DURATION);
  }, [clearTimers, dismiss, latestToast, opacity, translateY]);

  useEffect(() => clearTimers, [clearTimers]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || !currentToast) return null;

  const message = t(currentToast.key, currentToast.vars, currentToast.message);

  const iconName: IoniconName =
    currentToast.toastType === 'success'
      ? 'checkmark-circle'
      : currentToast.toastType === 'error'
        ? 'alert-circle'
        : 'information-circle';

  const iconColor =
    currentToast.toastType === 'success'
      ? colors.success
      : currentToast.toastType === 'error'
        ? colors.error
        : '#60a5fa';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
        },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={dismiss}
        style={({ pressed }) => [styles.toast, { borderLeftColor: iconColor }, pressed && styles.toastPressed]}
      >
        <Ionicons name={iconName} size={20} color={iconColor} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10000,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: Platform.OS === 'android'
      ? 'rgba(20, 20, 20, 0.95)'
      : 'rgba(20, 20, 20, 0.88)',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  toastPressed: {
    opacity: 0.85,
  },
  text: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    flex: 1,
  },
});
