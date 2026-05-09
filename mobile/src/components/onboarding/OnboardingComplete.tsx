import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
import ConfettiBurst from './ConfettiBurst';
import useAnimatedNumber from '../../hooks/useAnimatedNumber';

const NICE_LINES = [
  "You're a natural!",
  'You crushed it!',
  'Globetrotter in the making!',
  'Well played, explorer!',
  'That was impressive!',
];

export type OnboardingMode = 'classic' | 'country';

interface Props {
  visible: boolean;
  mode: OnboardingMode;
  points: number;
  onClassic: () => void;
  onDuel: () => void;
  onCommunityMaps: () => void;
  onCountryGuesser: () => void;
  onHome: () => void;
}

interface CardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  accent: string;
  onPress: () => void;
}

function ActionCard({ icon, title, desc, accent, onPress }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        { borderLeftColor: accent },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: `${accent}22`, borderColor: accent }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {desc}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.35)" />
    </Pressable>
  );
}

export default function OnboardingComplete({
  visible,
  mode,
  points,
  onClassic,
  onDuel,
  onCommunityMaps,
  onCountryGuesser,
  onHome,
}: Props) {
  const { width } = useWindowDimensions();
  const isClassic = mode === 'classic';
  const safePoints = Math.max(0, Math.round(points));
  const maxPoints = isClassic ? 15000 : 3000;

  // Score-hide rules — match components/onboardingComplete.js:98-101
  const hideScore = !isClassic && safePoints <= 1000;
  const hideMax = isClassic && safePoints < 5000;

  const niceMsg = useMemo(
    () => NICE_LINES[Math.floor(Math.random() * NICE_LINES.length)],
    // re-pick whenever the modal becomes visible
    [visible],
  );

  const { displayed: animatedPoints } = useAnimatedNumber(visible ? safePoints : 0, {
    duration: 900,
  });

  // Confetti trigger
  const [confettiKey, setConfettiKey] = useState(0);
  useEffect(() => {
    if (visible) setConfettiKey((k) => k + 1);
  }, [visible]);

  // Card slide-in
  const slide = useRef(new Animated.Value(40)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    slide.setValue(40);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const isWide = width > 480;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <ConfettiBurst trigger={confettiKey} />
        <Animated.View
          style={[
            styles.card,
            {
              maxWidth: isWide ? 460 : '94%',
              opacity: fade,
              transform: [{ translateY: slide }],
            },
          ]}
        >
          <View style={styles.trophyWrap}>
            <Ionicons name="trophy" size={48} color={colors.warning} />
          </View>

          <Text style={styles.title}>{niceMsg}</Text>

          {!hideScore && (
            <View style={styles.scoreRow}>
              <Text style={styles.score}>{animatedPoints.toLocaleString()}</Text>
              {!hideMax && (
                <Text style={styles.scoreMax}> / {maxPoints.toLocaleString()}</Text>
              )}
            </View>
          )}
          {!hideScore && <Text style={styles.scoreLabel}>points</Text>}

          <Text style={styles.prompt}>What would you like to try next?</Text>

          <View style={styles.cards}>
            {isClassic ? (
              <>
                <ActionCard
                  icon="map"
                  title="Keep Playing"
                  desc="Play a full 5-round match across the globe"
                  accent="#4ade80"
                  onPress={onClassic}
                />
                <ActionCard
                  icon="flash"
                  title="Find Duel"
                  desc="Compete live against other players"
                  accent="#fbbf24"
                  onPress={onDuel}
                />
                <ActionCard
                  icon="globe"
                  title="Community Maps"
                  desc="Discover thousands of player-created maps"
                  accent="#60a5fa"
                  onPress={onCommunityMaps}
                />
              </>
            ) : (
              <>
                <ActionCard
                  icon="flag"
                  title="Keep Exploring"
                  desc="Spot more countries and grow your streak!"
                  accent="#4ade80"
                  onPress={onCountryGuesser}
                />
                <ActionCard
                  icon="map"
                  title="Classic"
                  desc="Try the harder map-guessing experience"
                  accent="#fbbf24"
                  onPress={onClassic}
                />
                <ActionCard
                  icon="globe"
                  title="Community Maps"
                  desc="Discover thousands of player-created maps"
                  accent="#60a5fa"
                  onPress={onCommunityMaps}
                />
              </>
            )}
          </View>

          <Pressable
            onPress={onHome}
            style={({ pressed }) => [styles.homeBtn, pressed && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.homeBtnInner}
            >
              <Text style={styles.homeBtnText}>Main Menu</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: '#0f1d13',
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  trophyWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  score: {
    color: colors.white,
    fontSize: 40,
    fontFamily: 'Lexend-Bold',
  },
  scoreMax: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend',
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Medium',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.lg,
  },
  prompt: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Medium',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  cards: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: borderRadius.lg,
    borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
    marginBottom: 2,
  },
  cardDesc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  homeBtn: {
    width: '100%',
  },
  homeBtnInner: {
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  homeBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
  },
});
