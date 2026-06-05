/**
 * Animated ELO change display for ranked duel results.
 *
 * Mirrors the web duel header (components/roundOverScreen.js `elo-container`):
 * an "ELO:" label, the NEW rating counting up/down from the old value, and the
 * delta in green/red. No old→new arrow, no parentheses, and no duplicate
 * Victory/Defeat label — that title already sits above this in the header.
 */

import { useEffect, useState } from 'react';
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
  const particleCount = delta > 0 ? getParticleCount(newElo) : 0;
  const starColor = getStarColor(newElo);

  // Count the rating up/down from old → new (web parity: `animatedElo`). Capped
  // at 60 steps so a large swing still finishes in ~1.2s without lagging.
  const [animatedElo, setAnimatedElo] = useState(oldElo);
  useEffect(() => {
    if (oldElo === newElo) {
      setAnimatedElo(newElo);
      return;
    }
    const DURATION = 1200;
    const START_DELAY = 350; // let the "Victory/Defeat" title land first
    const steps = Math.min(Math.abs(delta), 60);
    const stepMs = DURATION / steps;
    let i = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    setAnimatedElo(oldElo);
    const startTimer = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setAnimatedElo(i >= steps ? newElo : Math.round(oldElo + (delta * i) / steps));
        if (i >= steps && interval) clearInterval(interval);
      }, stepMs);
    }, START_DELAY);
    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [oldElo, newElo, delta]);

  // Subtle pop-in on the value row.
  const slide = useSharedValue(0);
  const scale = useSharedValue(0.6);
  useEffect(() => {
    slide.value = withDelay(150, withTiming(1, { duration: 350 }));
    scale.value = withDelay(
      150,
      withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.6)) }),
    );
    return () => {
      cancelAnimation(slide);
      cancelAnimation(scale);
    };
  }, [scale, slide]);

  const displayStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ scale: scale.value }],
  }));

  // Web colours the delta purely by sign (`eloChange >= 0 ? green : red`).
  const deltaColor = delta >= 0 ? colors.success : colors.error;
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
      <Text style={styles.label}>{t('elo')}:</Text>
      <Animated.View style={[styles.row, displayStyle]}>
        <Text style={styles.value}>{animatedElo}</Text>
        <Text style={[styles.delta, { color: deltaColor }]}>{deltaText}</Text>
      </Animated.View>
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
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  value: {
    color: colors.white,
    fontSize: fontSizes['3xl'],
    fontFamily: 'Lexend-Bold',
  },
  delta: {
    fontSize: fontSizes.xl,
    fontFamily: 'Lexend-SemiBold',
  },
  starParticle: {
    position: 'absolute',
    top: 10,
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
