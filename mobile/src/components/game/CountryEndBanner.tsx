import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../shared';
import {
  continentFromCode,
  flagUrl,
  nameFromCode,
} from '../../shared/data/countryHelpers';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

interface Props {
  mode: 'country' | 'continent';
  /** ISO-2 of the actual location's country. */
  correctCountry: string;
  /** What the player tapped. ISO-2 in country mode, continent name in continent mode. */
  picked: string | null;
  /** 1000 if correct, 0 otherwise. */
  points: number;
  streak: number;
  round: number;
  totalRounds: number;
  onNext: () => void;
  /** When set, a 7-second progress bar runs and auto-fires onNext (used in onboarding). */
  autoAdvanceMs?: number;
  /** Called when the banner is the final round; influences "Next" copy. */
  isFinal?: boolean;
  /**
   * Optional landmark fact shown only during onboarding, matching the web
   * `onboardingFact1-3` strings from public/locales/en/common.json.
   */
  factText?: string;
}

const CORRECT_LINES = [
  "Nice one! You're a natural.",
  'Spot on! Right where it should be.',
  'Crushed it. Geography brain activated.',
  'Boom! Right country, right vibe.',
  'Perfect — the world is your map.',
];

const WRONG_SAME_LINES = [
  'So close — same neighborhood at least.',
  'Right region, wrong flag. Try again next time.',
  'You were in the area! Common confusion.',
  'A neighbor — easy mistake to make.',
];

const WRONG_DIFF_LINES = [
  'Way off, but you live to guess another day.',
  'Different continent entirely — happens to the best of us.',
  'Plot twist! Not even close.',
  'A bold guess. We respect the confidence.',
];

function pickLine(buf: string[]) {
  return buf[Math.floor(Math.random() * buf.length)];
}

export default function CountryEndBanner({
  mode,
  correctCountry,
  picked,
  points,
  streak,
  round,
  totalRounds,
  onNext,
  autoAdvanceMs,
  isFinal,
  factText,
}: Props) {
  const isCorrect = points > 0;
  const isContinent = mode === 'continent';

  const correctName = isContinent
    ? continentFromCode(correctCountry)
    : nameFromCode(correctCountry);

  const message = useMemo(() => {
    if (isCorrect) return pickLine(CORRECT_LINES);
    if (!picked || isContinent) return pickLine(WRONG_DIFF_LINES);
    const sameContinent = continentFromCode(picked) === continentFromCode(correctCountry);
    return sameContinent ? pickLine(WRONG_SAME_LINES) : pickLine(WRONG_DIFF_LINES);
    // re-pick only when the round actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, isCorrect]);

  // Slide-up entrance
  const slide = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    slide.setValue(60);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [round]);

  // Auto-advance progress bar
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!autoAdvanceMs) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: autoAdvanceMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    const t = setTimeout(onNext, autoAdvanceMs);
    return () => clearTimeout(t);
  }, [autoAdvanceMs, round]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity, transform: [{ translateY: slide }] },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.flagBox}>
          {isContinent ? (
            <Text style={styles.continentEmoji}>🌍</Text>
          ) : (
            <Image source={{ uri: flagUrl(correctCountry) }} style={styles.flag} resizeMode="cover" />
          )}
        </View>
        <View style={styles.textCol}>
          <Text style={styles.smallLabel}>
            Round {round}/{totalRounds} · {isCorrect ? 'Correct!' : 'Not quite'}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {correctName}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>
        <View style={styles.pointsCol}>
          <Text style={[styles.points, { color: isCorrect ? colors.successGlow : colors.errorGlow }]}>
            +{points}
          </Text>
          {streak > 0 && (
            <View style={styles.streakChip}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
        </View>
      </View>

      {factText ? <Text style={styles.fact}>{factText}</Text> : null}

      {autoAdvanceMs ? (
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      ) : null}

      <Pressable onPress={onNext} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nextBtn}
        >
          <Text style={styles.nextBtnText}>{isFinal ? 'View Results' : 'Next Round'}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Fully opaque so the GameSurface shim and this banner read as one
    // continuous block — no streetview bleed through the alpha.
    backgroundColor: '#0c1f12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flagBox: {
    width: 64,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flag: { width: '100%', height: '100%' },
  continentEmoji: { fontSize: 30 },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  smallLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Medium',
    marginBottom: 2,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
    marginBottom: 2,
  },
  message: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
  },
  fact: {
    color: 'rgba(255, 230, 170, 0.92)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    lineHeight: 19,
  },
  pointsCol: {
    alignItems: 'center',
    gap: 4,
  },
  points: {
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
  },
  streakChip: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  streakText: {
    color: colors.warning,
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.xs,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primary,
  },
  nextBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  nextBtnText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
  },
});
