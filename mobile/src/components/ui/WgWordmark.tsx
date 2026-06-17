/**
 * WorldGuessr wordmark — plain "WorldGuessr" text in the same font as the home
 * screen title (JockeyOne), single color. Used in the top-left of the queue +
 * match-start overlays so the branded screens stay consistent with home.
 */

import { StyleSheet, Text, ViewStyle } from 'react-native';
import { colors } from '../../shared';

interface Props {
  /** 'sm' for compact overlays, 'md' (default) for the queue hero. */
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export default function WgWordmark({ size = 'md', style }: Props) {
  const fontSize = size === 'sm' ? 24 : 30;

  return (
    <Text style={[styles.word, { fontSize }, style]} numberOfLines={1}>
      WorldGuessr
    </Text>
  );
}

const styles = StyleSheet.create({
  word: {
    color: colors.white,
    fontFamily: 'JockeyOne',
    letterSpacing: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
});
