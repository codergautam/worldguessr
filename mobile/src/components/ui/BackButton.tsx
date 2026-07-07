/**
 * Shared red/black gradient back button used across the app (game HUD,
 * results, onboarding, queue). Single source of truth for the navbar-style
 * "back" affordance so every screen looks identical.
 */

import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../shared';
import { haptics } from '../../services/haptics';

// Canonical brand gradient for the back/leave button (matches web's red navbar btn).
const BACK_GRADIENT = [
  'rgba(156,82,39,0.9)',
  'rgba(91,29,29,0.9)',
  'rgba(255,112,112,0.9)',
] as const;

interface BackButtonProps {
  onPress: () => void;
  /** Icon glyph — defaults to an X (close); a bare back arrow tested as confusing. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional wrapper style (positioning, margins). */
  style?: StyleProp<ViewStyle>;
}

export default function BackButton({ onPress, icon = 'close', style }: BackButtonProps) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
        style,
      ]}
    >
      <LinearGradient
        colors={BACK_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Ionicons name={icon} size={22} color={colors.white} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.4,
    borderColor: '#85200c',
  },
});
