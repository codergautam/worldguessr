import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../shared';
import {
  continentFromCode,
  continentKey,
  flagUrl,
  nameFromCode,
} from '../../shared/data/countryHelpers';
import { getCurrentLanguage, localeString, t } from '../../shared';
import { sound } from '../../services/sound';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
import { useGameUiScale } from '../../styles/responsive';

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
  hideQuip?: boolean;
}

const QUIP_KEYS = {
  correct: Array.from({ length: 24 }, (_, i) => `quipCorrect${i + 1}`),
  wrongSameContinent: Array.from({ length: 20 }, (_, i) => `quipWrongSame${i + 1}`),
  wrongDiffContinent: Array.from({ length: 24 }, (_, i) => `quipWrongDiff${i + 1}`),
} as const;

type QuipTier = keyof typeof QUIP_KEYS;

function pickQuipKey(tier: QuipTier) {
  const pool = QUIP_KEYS[tier];
  return pool[Math.floor(Math.random() * pool.length)];
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
  hideQuip,
}: Props) {
  const isCorrect = points > 0;
  const isContinent = mode === 'continent';

  // The dock background spans full width (painted by GameSurface), but the
  // content is centered and width-capped so it stays a readable block instead
  // of spreading edge-to-edge on wide / landscape screens ("don't take too much
  // width"). Landscape also goes vertically compact so the dock doesn't eat the
  // short viewport — mirrors web's landscape banner tightening.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // Only compact the banner on SHORT viewports (landscape phones); an iPad in
  // landscape is tall enough to keep the comfortable layout. Matches the
  // ClassicEndBanner / web `max-height: 500px` treatment.
  const compactLandscape = landscape && height <= 500;
  // Tablet scale — fixed theme px (title 18, points 24, …) read small on iPad;
  // bump them (and paddings) up. Phones unaffected (sc is 1.0×).
  const { sc, isTablet } = useGameUiScale();
  const contentMaxWidth = Math.min(width, isTablet ? 840 : 720);
  const centered = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: contentMaxWidth };

  // Localized display name (web endBanner.js:424-425 — continents go through
  // the continentKey locale map, countries through nameFromCode with the
  // active language). Raw continent names stay English in the game LOGIC
  // (picked/correct comparisons); only the label is translated.
  const correctName = isContinent
    ? t(continentKey(continentFromCode(correctCountry)))
    : nameFromCode(correctCountry, getCurrentLanguage());

  const message = useMemo(() => {
    if (isCorrect) return localeString(pickQuipKey('correct'));
    if (!picked || isContinent) return localeString(pickQuipKey('wrongDiffContinent'));
    const sameContinent = continentFromCode(picked) === continentFromCode(correctCountry);
    return localeString(pickQuipKey(sameContinent ? 'wrongSameContinent' : 'wrongDiffContinent'));
    // re-pick only when the round actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, isCorrect]);

  // The subtext line: a funny quip after a real pick, or a plain "you didn't
  // guess" note when the round timed out with no pick (parity with classic SP).
  // Onboarding hides it wholesale via hideQuip (shows a landmark fact instead).
  const forgotToGuess = picked == null;
  const noteText = forgotToGuess ? t('didntGuess', undefined, "You didn't guess") : message;
  const showNote = !hideQuip;

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
    const t = setTimeout(() => {
      // A programmatic advance sounds like a manual Next press (web
      // endBanner.js:112 — the delegated click listener can't hear it).
      sound.click();
      onNext();
    }, autoAdvanceMs);
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
        compactLandscape && styles.wrapLandscape,
        isTablet && !compactLandscape && {
          paddingHorizontal: sc(spacing.lg),
          paddingTop: sc(spacing.lg),
          paddingBottom: sc(spacing.lg),
          gap: sc(spacing.md),
        },
        { opacity, transform: [{ translateY: slide }] },
      ]}
    >
      <View style={[styles.row, centered, isTablet && { gap: sc(spacing.md) }]}>
        <View style={[styles.flagBox, isTablet && { width: sc(64), height: sc(44) }]}>
          {isContinent ? (
            <Text style={[styles.continentEmoji, { fontSize: sc(30) }]}>🌍</Text>
          ) : (
            <Image source={{ uri: flagUrl(correctCountry) }} style={styles.flag} resizeMode="cover" />
          )}
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.smallLabel, { fontSize: sc(fontSizes.xs) }]}>
            {t('round', { r: round, mr: totalRounds })} · {isCorrect ? t('correctExclaim', undefined, 'Correct!') : t('notQuite', undefined, 'Not quite')}
          </Text>
          <Text style={[styles.title, { fontSize: sc(fontSizes.lg) }]} numberOfLines={1}>
            {correctName}
          </Text>
          {showNote && (
            <Text style={[styles.message, { fontSize: sc(fontSizes.sm) }]} numberOfLines={2}>
              {noteText}
            </Text>
          )}
        </View>
        <View style={styles.pointsCol}>
          <Text style={[styles.points, { fontSize: sc(fontSizes['2xl']), color: isCorrect ? colors.successGlow : colors.errorGlow }]}>
            +{points}
          </Text>
          {streak > 0 && (
            <View style={styles.streakChip}>
              <Text style={[styles.streakText, { fontSize: sc(fontSizes.xs) }]}>🔥 {streak}</Text>
            </View>
          )}
        </View>
      </View>

      {factText ? <Text style={[styles.fact, { fontSize: sc(fontSizes.sm), lineHeight: sc(19) }, centered]}>{factText}</Text> : null}

      {autoAdvanceMs ? (
        <View style={[styles.progressTrack, centered]}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      ) : null}

      <Pressable onPress={onNext} style={({ pressed }) => [centered, pressed && { opacity: 0.85 }]}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.nextBtn,
            compactLandscape && styles.nextBtnLandscape,
            isTablet && !compactLandscape && { paddingVertical: sc(spacing.md) },
          ]}
        >
          <Text style={[styles.nextBtnText, { fontSize: sc(fontSizes.md) }]}>{isFinal ? t('viewResults') : t('nextRound')}</Text>
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
  // Landscape: trim the vertical footprint so the dock stays low-profile on a
  // short viewport (web's landscape banner tightening).
  wrapLandscape: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
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
  nextBtnLandscape: {
    paddingVertical: spacing.sm,
  },
  nextBtnText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
  },
});
