/**
 * Shared styling primitives for the toast + actionable-notification surfaces so
 * the whole in-app notification system reads as one cohesive component.
 *
 * Mirrors the web `react-toastify` dark theme look: dark translucent pill, a
 * type-colored left accent bar, icon, and a type-colored countdown progress bar.
 */

import { Platform, StyleSheet, ViewStyle } from 'react-native';
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';

export type ToastType = 'success' | 'error' | 'info';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Info blue used across the in-app notification system (matches web accent). */
export const INFO_ACCENT = '#60a5fa';

/** Accent color for a toast/notification type (left bar + icon + progress). */
export function accentForType(type: ToastType): string {
  if (type === 'success') return colors.success;
  if (type === 'error') return colors.error;
  return INFO_ACCENT;
}

/** Ionicon name for a toast/notification type. */
export function iconForType(type: ToastType): IoniconName {
  if (type === 'success') return 'checkmark-circle';
  if (type === 'error') return 'alert-circle';
  return 'information-circle';
}

/** Dark translucent pill background, tuned per-platform for legibility. */
export const PILL_BG =
  Platform.OS === 'android' ? 'rgba(20, 20, 20, 0.96)' : 'rgba(20, 20, 20, 0.9)';

/** Soft drop shadow shared by every notification surface. */
export const pillShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
  },
  android: { elevation: 8 },
}) as ViewStyle;

/**
 * Base pill style shared by toasts and actionable cards. Note: `overflow:
 * 'hidden'` clips the progress bar to the rounded corners.
 */
export const toastSharedStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    backgroundColor: PILL_BG,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderLeftWidth: 3,
    overflow: 'hidden',
    ...pillShadow,
  },
  message: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    flex: 1,
  },
  /** Countdown progress bar pinned to the bottom edge of the pill. */
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  progressFill: {
    height: '100%',
    borderBottomLeftRadius: borderRadius.lg,
  },
});
