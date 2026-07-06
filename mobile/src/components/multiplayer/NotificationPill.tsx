/**
 * Presentational pill shared by toasts and actionable notifications: a dark
 * rounded card with a type-colored left accent bar, a leading icon, the message,
 * and optional trailing content (e.g. accept/decline buttons or a progress bar).
 *
 * Holds no animation or state — wrap it in an `Animated.View`/`GestureDetector`
 * at the call site to add motion or interaction.
 */

import type { ComponentProps, ReactNode } from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toastSharedStyles } from './toastStyles';

export default function NotificationPill({
  icon,
  accent,
  message,
  maxLines = 3,
  trailing,
  children,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  accent: string;
  message: string;
  /** Max message lines before truncation. */
  maxLines?: number;
  /** Inline content rendered after the message (e.g. action buttons). */
  trailing?: ReactNode;
  /** Absolutely-positioned overlay content (e.g. the progress bar). */
  children?: ReactNode;
}) {
  return (
    <View style={[toastSharedStyles.pill, { borderLeftColor: accent }]}>
      <Ionicons name={icon} size={20} color={accent} />
      <Text style={toastSharedStyles.message} numberOfLines={maxLines}>
        {message}
      </Text>
      {trailing}
      {children}
    </View>
  );
}
