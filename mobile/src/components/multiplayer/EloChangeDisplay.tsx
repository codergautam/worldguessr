/**
 * Animated ELO change display for ranked duel results.
 * Shows old ELO → new ELO with animated delta.
 */

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';

interface EloChangeDisplayProps {
  oldElo: number;
  newElo: number;
  winner: boolean;
  draw: boolean;
}

export default function EloChangeDisplay({
  oldElo,
  newElo,
  winner,
  draw,
}: EloChangeDisplayProps) {
  const delta = newElo - oldElo;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const deltaColor = draw
    ? 'rgba(255, 255, 255, 0.6)'
    : winner
      ? colors.success
      : colors.error;

  const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>ELO RATING</Text>
      <View style={styles.row}>
        <Text style={styles.oldElo}>{oldElo}</Text>
        <Animated.View
          style={[
            styles.deltaContainer,
            {
              opacity: slideAnim,
              transform: [
                { scale: scaleAnim },
                {
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.arrow}>→</Text>
          <Text style={[styles.newElo, { color: deltaColor }]}>{newElo}</Text>
          <Text style={[styles.delta, { color: deltaColor }]}>
            ({deltaText})
          </Text>
        </Animated.View>
      </View>
      <Text style={[styles.resultLabel, { color: deltaColor }]}>
        {draw ? 'Draw' : winner ? 'Victory!' : 'Defeat'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  oldElo: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.xl,
    fontFamily: 'Lexend-Bold',
  },
  deltaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  arrow: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend',
  },
  newElo: {
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
  },
  delta: {
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
  },
  resultLabel: {
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
    marginTop: spacing.xs,
  },
});
