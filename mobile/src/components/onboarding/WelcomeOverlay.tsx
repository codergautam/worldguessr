import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, t } from '../../shared';
import { onboardingAnalytics } from '../../services/onboardingAnalytics';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

interface Props {
  visible: boolean;
  onModeSelected: (mode: 'country' | 'classic') => void;
  onSkip: () => void;
}

export default function WelcomeOverlay({ visible, onModeSelected, onSkip }: Props) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (!visible) return;
    onboardingAnalytics.shown();
    fade.setValue(0);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Subtle fade-up via a near-1 starting scale + matching duration —
      // no springy bounce, just a clean reveal.
      Animated.timing(scale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const dismiss = (cb: () => void) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => cb());
  };

  // Three responsive forks. `isLandscape` triggers a side-by-side mode layout
  // and tighter vertical rhythm so the card never overflows on a phone in
  // landscape (where height ~ 390). `isWide` separately handles tablet
  // portrait. `isShort` clamps hero/font sizes when there isn't much height.
  const isLandscape = width > height && height < 600;
  const isWide = width > 480;
  const isShort = height < 560;

  // Rendered as a regular absolute View (not RN's Modal) so siblings in the
  // parent screen — login + join-party buttons — can stack on top of it.
  if (!visible) return null;

  // Phone-landscape gets a wider card; tablet portrait gets the standard
  // 460-wide column; phone-portrait fills 92% of the screen.
  const cardMaxWidth = isLandscape ? Math.min(720, width - 48) : isWide ? 460 : '92%';

  return (
    <Animated.View
      style={[styles.backdrop, { opacity: fade }]}
      pointerEvents="auto"
    >
      <ScrollView
        style={styles.scrollWrap}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            styles.card,
            isLandscape && styles.cardLandscape,
            isShort && styles.cardShort,
            { maxWidth: cardMaxWidth, transform: [{ scale }] },
          ]}
        >
          <Text style={[styles.hero, isShort && styles.heroShort]}>🌍</Text>
          <Text style={[styles.title, isShort && styles.titleShort]}>
            {t('welcomeTitle')}
          </Text>
          <Text style={[styles.desc, isShort && styles.descShort]}>
            {t('welcomeDesc')}
          </Text>

          <View style={[styles.modes, isLandscape && styles.modesLandscape]}>
            <Pressable
              onPress={() => dismiss(() => onModeSelected('country'))}
              style={({ pressed }) => [
                styles.modeBtnWrap,
                isLandscape && styles.modeBtnWrapLandscape,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <LinearGradient
                colors={['#1a4423', '#0e2814']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.modeBtn, isLandscape && styles.modeBtnLandscape]}
              >
                <Text style={[styles.modeIcon, isLandscape && styles.modeIconLandscape]}>🏳️</Text>
                <View style={styles.modeText}>
                  <Text style={[styles.modeTitle, isLandscape && styles.modeTitleLandscape]}>
                    {t('countryGuesser')}
                  </Text>
                  <Text style={styles.modeSub}>{t('countryGuessrDesc')}</Text>
                </View>
              </LinearGradient>
              {/* Badge lives outside the gradient so its negative `top` isn't
                  clipped by the rounded mask on iOS/Android. */}
              <View style={styles.recommendedBadge} pointerEvents="none">
                <Text style={styles.recommendedText}>{t('recommended')}</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => dismiss(() => onModeSelected('classic'))}
              style={({ pressed }) => [
                isLandscape && styles.modeBtnWrapLandscape,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <LinearGradient
                colors={['#1a3344', '#0e1d28']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.modeBtn, isLandscape && styles.modeBtnLandscape]}
              >
                <Text style={[styles.modeIcon, isLandscape && styles.modeIconLandscape]}>🗺️</Text>
                <View style={styles.modeText}>
                  <Text style={[styles.modeTitle, isLandscape && styles.modeTitleLandscape]}>
                    {t('classic')}
                  </Text>
                  <Text style={styles.modeSub}>{t('classicDesc')}</Text>
                </View>
              </LinearGradient>
            </Pressable>
          </View>

          <Pressable
            onPress={() => dismiss(onSkip)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.skip}>{t('skipTutorial')}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    // Above GameSurface's loading overlay (z 2000) so the welcome modal
    // shows immediately, even while the first panorama is still painting.
    // Below the always-visible login/join-party toolbar (z 2100) so those
    // buttons stay tappable on top of the dim.
    zIndex: 2050,
    elevation: 60,
  },
  scrollWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: '#101e14',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  cardLandscape: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  cardShort: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  hero: {
    fontSize: 56,
    marginBottom: spacing.xs,
  },
  heroShort: {
    fontSize: 36,
    marginBottom: 0,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  titleShort: {
    fontSize: fontSizes.xl,
    marginBottom: spacing.xs,
  },
  desc: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  descShort: {
    marginBottom: spacing.md,
    fontSize: fontSizes.xs,
    lineHeight: 17,
  },
  modes: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    // Top breathing room so the recommended badge (which sits above the
    // first button at top:-10) has somewhere to live.
    marginTop: spacing.sm,
  },
  modesLandscape: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modeBtnWrap: {
    position: 'relative',
  },
  modeBtnWrapLandscape: {
    flex: 1,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: spacing.md,
    minHeight: 72,
  },
  modeBtnLandscape: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    minHeight: 0,
  },
  modeIconLandscape: {
    fontSize: 22,
  },
  modeTitleLandscape: {
    fontSize: fontSizes.md,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    // Keep the badge above the gradient on Android (where stacking can be
    // platform-dependent). zIndex + elevation cover both platforms.
    zIndex: 2,
    elevation: 3,
  },
  recommendedText: {
    color: '#1a1300',
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    
  },
  modeIcon: {
    fontSize: 32,
  },
  modeText: {
    flex: 1,
  },
  modeTitle: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
    marginBottom: 2,
  },
  modeSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  skip: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
