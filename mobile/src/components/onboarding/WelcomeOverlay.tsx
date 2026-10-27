import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../ui/SfxPressable';
import { colors, t } from '../../shared';
import { onboardingAnalytics } from '../../services/onboardingAnalytics';

interface Props {
  visible: boolean;
  onModeSelected: (mode: 'country' | 'classic') => void;
  onSkip: () => void;
}

// Port of web's welcome screen (components/welcomeOverlay.js +
// .welcome-modal* in styles/globals.scss): a full-screen splash over the
// blurred round-1 pano, no card. Title, copy, choices and skip rise in one
// after another; the exit fades everything together.
const STAGGER_COUNT = 4;
const STAGGER_MS = 80;
const EXIT_MS = 300;
const RISE_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const BLUR_INTENSITY = Platform.OS === 'android' ? 24 : 40;
// The exit animates blur intensity rather than a parent's opacity: iOS
// UIVisualEffectView renders incorrectly under any ancestor alpha < 1.
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export default function WelcomeOverlay({ visible, onModeSelected, onSkip }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  // The backdrop is dark from the first frame (it covers the loading pano);
  // only the exit fades it.
  const exit = useRef(new Animated.Value(1)).current;
  const content = useRef(new Animated.Value(0)).current;
  const items = useRef(
    Array.from({ length: STAGGER_COUNT }, () => new Animated.Value(0)),
  ).current;
  const rises = useRef(
    Array.from({ length: STAGGER_COUNT }, () => new Animated.Value(0)),
  ).current;
  // One exit per overlay: a second tap during the fade must not commit twice.
  const dismissedRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    onboardingAnalytics.shown();
    dismissedRef.current = false;
    exit.setValue(1);
    content.setValue(0);
    items.forEach((v) => v.setValue(0));
    rises.forEach((v) => v.setValue(0));
    // Transforms run on the JS driver: native-driven transforms on freshly
    // mounted touch targets can desync hit-testing (first tap ignored).
    Animated.parallel([
      Animated.timing(content, {
        toValue: 1,
        duration: 300,
        easing: Easing.ease,
        useNativeDriver: false,
      }),
      ...items.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 500,
          delay: i * STAGGER_MS,
          easing: Easing.ease,
          useNativeDriver: false,
        }),
      ),
      ...rises.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 600,
          delay: i * STAGGER_MS,
          easing: RISE_EASING,
          useNativeDriver: false,
        }),
      ),
    ]).start();
  }, [visible]);

  const dismiss = (cb: () => void) => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.timing(exit, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.ease,
      useNativeDriver: false,
    }).start(() => cb());
  };

  // Rendered as a regular absolute View (not RN's Modal) so siblings in the
  // parent screen — login + join-party buttons — can stack on top of it.
  if (!visible) return null;

  // Web breakpoint: side-by-side choices above 600px, stacked below.
  const isNarrow = width <= 600;
  const titleSize = Math.min(80, Math.max(42, width * 0.07));
  const descSize = Math.min(20, Math.max(16, width * 0.018));

  const itemStyle = (i: number) => ({
    opacity: items[i],
    transform: reduceMotion
      ? []
      : [{ translateY: rises[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <AnimatedBlurView
        intensity={exit.interpolate({ inputRange: [0, 1], outputRange: [0, BLUR_INTENSITY] })}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      {/* Web's rgba(0,0,0,0.62) over the blur; also keeps the copy legible
          if Android blur degrades. */}
      <Animated.View style={[styles.tintScrim, { opacity: exit }]} pointerEvents="none" />
      <Animated.ScrollView
        style={[styles.scrollWrap, { opacity: exit }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: content,
              transform: reduceMotion
                ? []
                : [{ scale: content.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.title,
              { fontSize: titleSize, lineHeight: titleSize * 1.05 },
              itemStyle(0),
            ]}
          >
            {t('welcomeTitle')}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.desc,
              { fontSize: descSize, lineHeight: descSize * 1.5 },
              isNarrow && styles.descNarrow,
              itemStyle(1),
            ]}
          >
            {t('welcomeDesc')}
          </Animated.Text>

          <Animated.View style={[styles.modes, isNarrow && styles.modesNarrow, itemStyle(2)]}>
            <Pressable
              onPress={() => dismiss(() => onModeSelected('country'))}
              style={({ pressed }) => [
                styles.modeBtnWrap,
                !isNarrow && styles.modeBtnWrapRow,
                styles.recommendedShadow,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#3fb950', '#2e9a3f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.modeBtn, isNarrow && styles.modeBtnNarrow, styles.modeBtnRecommended]}
              >
                {/* Web's inset 0 1px 0 rgba(255,255,255,0.25) highlight. */}
                <View style={styles.recommendedHighlight} pointerEvents="none" />
                <Text style={styles.modeIcon}>🏳️</Text>
                <View style={styles.modeText}>
                  <Text style={styles.modeTitle}>{t('countryGuesser')}</Text>
                  <Text style={[styles.modeSub, styles.modeSubRecommended]}>
                    {t('countryGuessrDesc')}
                  </Text>
                </View>
              </LinearGradient>
              {/* Badge lives outside the gradient so its negative `top` isn't
                  clipped by the rounded mask on iOS/Android. */}
              <View style={styles.recommendedBadgeRow} pointerEvents="none">
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>{t('recommended')}</Text>
                </View>
              </View>
            </Pressable>

            <Pressable
              onPress={() => dismiss(() => onModeSelected('classic'))}
              style={({ pressed }) => [
                styles.modeBtnWrap,
                !isNarrow && styles.modeBtnWrapRow,
                styles.classicShadow,
                pressed && styles.pressed,
              ]}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.modeBtn,
                    isNarrow && styles.modeBtnNarrow,
                    styles.modeBtnClassic,
                    pressed && styles.modeBtnClassicPressed,
                  ]}
                >
                  <Text style={styles.modeIcon}>🗺️</Text>
                  <View style={styles.modeText}>
                    <Text style={styles.modeTitle}>{t('classic')}</Text>
                    <Text style={styles.modeSub}>{t('classicDesc')}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>

          <Animated.View style={itemStyle(3)}>
            <Pressable
              onPress={() => dismiss(onSkip)}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.skip}>{t('skipTutorial')}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    // Above GameSurface's loading overlay (z 2000) so the welcome screen
    // shows immediately, even while the first panorama is still painting.
    // Below the always-visible login/join-party toolbar (z 2100) so those
    // buttons stay tappable on top of the dim.
    zIndex: 2050,
    elevation: 60,
  },
  tintScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  scrollWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignItems: 'center',
  },
  title: {
    color: colors.white,
    fontFamily: 'JockeyOne',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 24,
  },
  desc: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: 'Lexend',
    textAlign: 'center',
    maxWidth: 560,
    marginBottom: 40,
  },
  descNarrow: {
    marginBottom: 28,
  },
  modes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 28,
    // Room for the recommended badge (top: -11) above the first button.
    paddingTop: 11,
    width: '100%',
  },
  modesNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 14,
    marginBottom: 18,
  },
  modeBtnWrap: {
    position: 'relative',
  },
  modeBtnWrapRow: {
    flex: 1,
    maxWidth: 300,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  modeBtnNarrow: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  modeBtnRecommended: {
    borderColor: '#56d364',
  },
  recommendedHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  modeBtnClassic: {
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modeBtnClassicPressed: {
    borderColor: 'rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  // iOS-only shadows: Android elevation on a translucent background draws a
  // rectangular artifact through it.
  recommendedShadow: Platform.select({
    ios: {
      shadowColor: '#3fb950',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
    },
    default: {},
  }),
  classicShadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    },
    default: {},
  }),
  recommendedBadgeRow: {
    position: 'absolute',
    top: -11,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    elevation: 3,
  },
  recommendedBadge: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
  },
  recommendedText: {
    color: '#1a7f37',
    fontFamily: 'Lexend-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modeIcon: {
    fontSize: 29,
  },
  modeText: {
    flex: 1,
  },
  modeTitle: {
    color: colors.white,
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    marginBottom: 2,
  },
  modeSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontFamily: 'Lexend',
  },
  modeSubRecommended: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  skip: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 16,
    fontFamily: 'Lexend',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});
