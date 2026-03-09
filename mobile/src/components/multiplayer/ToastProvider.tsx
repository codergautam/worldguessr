/**
 * Simple toast notification system for multiplayer events.
 * Subscribes to multiplayerStore.latestToast and shows animated banners.
 * Uses locale strings from public/locales/en/common.json for messages.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';
import { useMultiplayerStore, ToastData } from '../../store/multiplayerStore';
import localeStrings from '../../shared/locales-en.json';

const TOAST_DURATION = 3000;

/** Look up a toast key in locale strings and interpolate {{var}} placeholders */
function resolveToastMessage(key: string, vars?: Record<string, string | number>): string {
  const template = (localeStrings as Record<string, string>)[key];
  if (!template) return key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName) =>
    vars[varName] !== undefined ? String(vars[varName]) : `{{${varName}}}`
  );
}

export default function ToastProvider() {
  const insets = useSafeAreaInsets();
  const latestToast = useMultiplayerStore((s) => s.latestToast);
  const [visible, setVisible] = useState(false);
  const [currentToast, setCurrentToast] = useState<ToastData | null>(null);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!latestToast) return;

    // Clear previous timer
    if (hideTimer.current) clearTimeout(hideTimer.current);

    setCurrentToast(latestToast);
    setVisible(true);

    // Slide in
    slideAnim.setValue(-100);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();

    // Auto-hide
    hideTimer.current = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        setCurrentToast(null);
      });
    }, TOAST_DURATION);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [latestToast?.timestamp]);

  if (!visible || !currentToast) return null;

  const message = resolveToastMessage(currentToast.key, currentToast.vars);

  const iconName =
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
        : colors.primary;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.toast, { borderLeftColor: iconColor }]}>
        <Ionicons name={iconName as any} size={20} color={iconColor} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
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
  text: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    flex: 1,
  },
});
