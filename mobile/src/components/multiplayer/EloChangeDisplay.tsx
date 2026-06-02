/**
 * Animated ELO change display for ranked duel results.
 */

import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../shared';
import { t } from '../../shared/locale';
import { spacing, fontSizes } from '../../styles/theme';

interface EloChangeDisplayProps {
  oldElo: number;
  newElo: number;
  winner: boolean;
  draw: boolean;
}

function getTier(elo: number): 'bronze' | 'silver' | 'gold' | 'platinum' {
  if (elo < 1200) return 'bronze';
  if (elo < 1600) return 'silver';
  if (elo < 2000) return 'gold';
  return 'platinum';
}

function getParticleCount(elo: number): number {
  const tier = getTier(elo);
  if (tier === 'platinum') return 4;
  if (tier === 'gold') return 3;
  if (tier === 'silver') return 2;
  return 1;
}

function getStarColor(elo: number): string {
  const tier = getTier(elo);
  if (tier === 'platinum') return '#b9f2ff';
  if (tier === 'gold') return '#ffd700';
  if (tier === 'silver') return '#c0c0c0';
  return '#cd7f32';
}

export default function EloChangeDisplay({
  oldElo,
  newElo,
  winner,
  draw,
}: EloChangeDisplayProps) {
  const delta = newElo - oldElo;
  const slide = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const particleCount = delta > 0 ? getParticleCount(newElo) : 0;
  const starColor = getStarColor(newElo);

  useEffect(() => {
    slide.value = withDelay(
      500,
      withTiming(1, {
        duration: 600,
        easing: Easing.out(Easing.back(1.5)),
      }),
    );
    scale.value = withDelay(
      500,
      withTiming(1, {
        duration: 600,
        easing: Easing.out(Easing.back(1.5)),
      }),
    );
    return () => {
      cancelAnimation(slide);
      cancelAnimation(scale);
    };
  }, [scale, slide]);

  const deltaStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [
      { scale: scale.value },
      { translateX: (1 - slide.value) * -20 },
    ],
  }));

  const deltaColor = draw
    ? 'rgba(255, 255, 255, 0.6)'
    : winner
      ? colors.success
      : colors.error;

  const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;

  return (
    <View style={styles.container}>
      {Array.from({ length: particleCount }).map((_, index) => (
        <StarParticle
          key={index}
          index={index}
          count={particleCount}
          color={starColor}
        />
      ))}
      <Text style={styles.label}>{t('eloRating')}</Text>
      <View style={styles.row}>
        <Text style={styles.oldElo}>{oldElo}</Text>
        <Animated.View style={[styles.deltaContainer, deltaStyle]}>
          <Text style={styles.arrow}>-&gt;</Text>
          <Text style={[styles.newElo, { color: deltaColor }]}>{newElo}</Text>
          <Text style={[styles.delta, { color: deltaColor }]}>
            ({deltaText})
          </Text>
        </Animated.View>
      </View>
      <Text style={[styles.resultLabel, { color: deltaColor }]}>
        {draw ? t('draw') : winner ? t('victory') : t('defeat')}
      </Text>
    </View>
  );
}

function StarParticle({
  index,
  count,
  color,
}: {
  index: number;
  count: number;
  color: string;
}) {
  const progress = useSharedValue(0);
  const angle = count === 1 ? 0 : -35 + (70 / Math.max(1, count - 1)) * index;
  const distance = 34 + index * 5;

  useEffect(() => {
    progress.value = withDelay(
      650 + index * 90,
      withSequence(
        withTiming(1, {
          duration: 520,
          easing: Easing.out(Easing.back(1.8)),
        }),
        withTiming(0, {
          duration: 520,
          easing: Easing.in(Easing.cubic),
        }),
      ),
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [index, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const radians = (angle * Math.PI) / 180;
    return {
      opacity: progress.value,
      transform: [
        { translateX: Math.sin(radians) * distance * progress.value },
        { translateY: -Math.cos(radians) * distance * progress.value },
        { scale: progress.value },
        { rotate: `${progress.value * (180 + index * 45)}deg` },
      ],
    };
  });

  return (
    <Animated.Text style={[styles.starParticle, { color, textShadowColor: color }, animatedStyle]}>
      ★
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    position: 'relative',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    textTransform: 'uppercase',
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
  starParticle: {
    position: 'absolute',
    top: 18,
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
