/**
 * In-match player count — the mobile counterpart of web's navbar `#playerCnt`
 * span (`components/ui/navbar.js`): a person icon followed by the number of
 * players in the current multiplayer game (`gameData.players.length`). Shown
 * next to the back button during a non-duel ("unranked"/party) match; duels
 * surface both players through the health bars instead.
 *
 * Wears the HUD's 44×44 / radius-12 silhouette so it sits flush with the back
 * and reload buttons, but reads as an info pill (neutral dark glass) rather than
 * an action button. Fades in on mount, collapsing to instant under Reduce Motion.
 */

import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { fontSizes } from '../../styles/theme';

interface PlayerCountBadgeProps {
  count: number;
}

export default function PlayerCountBadge({ count }: PlayerCountBadgeProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(280)}
      style={styles.pill}
      accessibilityRole="text"
      accessibilityLabel={`${count} players in match`}
    >
      <Ionicons name="person" size={16} color="rgba(255,255,255,0.9)" />
      <Text style={styles.count}>{count}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 44,
    minWidth: 52,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,18,28,0.62)',
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  count: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
    fontVariant: ['tabular-nums'],
  },
});
