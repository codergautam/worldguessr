import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors } from '../../shared';
import { t } from '../../shared/locale';
import type { BlinkState } from '../../hooks/useBlinkPhase';
import { blinkCovers, BLINK_COUNTDOWN_STEP_MS } from '@shared/game/blink';
import { blinkDigitSize, blinkPromptSize, GAME_HUD_MAX_FONT_MULT } from '../../styles/webType';

// Blink round blur over the pano plus the centered text. Web parity, value
// for value: the blurred canvas/iframe in customStreetView.js / streetView.js
// and components/blink/BlinkCountdown.js + styles/blink.css. Covers the pano in
// every phase but the reveal and the answer (blinkCovers); the re-blur after
// the reveal eases like web's `filter 220ms ease-out`. The tint keeps the pano unreadable even where
// Android blur degrades (the one deliberate difference from web's blur filter).
const FADE_MS = 220;
const FADE_EASING = Easing.bezier(0, 0, 0.58, 1); // CSS `ease-out`
// blink.css: cubic-bezier(0.2, 0.8, 0.2, 1) on both the digit and the prompt.
const POP_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);
const PROMPT_MS = 320;
const RM = ReduceMotion.System;

// One countdown digit, remounted per step (keyed by count) like web's keyed
// <span>. Ports @keyframes blinkDigitPop over BLINK_COUNTDOWN_STEP_MS:
//   0% { opacity 0, scale 1.6 } 30% { 1, 1 } 80% { 1, 1 } 100% { 0, 0.9 }
// CSS applies the timing function per keyframe segment, so each leg eases on
// its own. Ends at opacity 0 (web's `both` fill) so the step boundary never
// flashes the old digit back in. Reduced motion: static, like web's
// `animation: none`.
function BlinkDigit({ count, size }: { count: number; size: number }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const scale = useSharedValue(reduced ? 1 : 1.6);
  useEffect(() => {
    if (reduced) return;
    const step = BLINK_COUNTDOWN_STEP_MS;
    const inMs = step * 0.3;
    const holdMs = step * 0.5;
    const outMs = step * 0.2;
    opacity.value = withSequence(
      withTiming(1, { duration: inMs, easing: POP_EASING }),
      withTiming(1, { duration: holdMs }),
      withTiming(0, { duration: outMs, easing: POP_EASING }),
    );
    scale.value = withSequence(
      withTiming(1, { duration: inMs, easing: POP_EASING }),
      withTiming(1, { duration: holdMs }),
      withTiming(0.9, { duration: outMs, easing: POP_EASING }),
    );
    // Mount-only: a new count is a new component (key), not a prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.Text
      style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.1) }, style]}
      maxFontSizeMultiplier={GAME_HUD_MAX_FONT_MULT}
      accessibilityRole="timer"
    >
      {count}
    </Animated.Text>
  );
}

// "Time's up! Make your guess". Ports @keyframes blinkPromptIn (320ms):
// from { opacity 0, translateY(12px) scale(0.96) } to { none }.
function BlinkPrompt({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) progress.value = withTiming(1, { duration: PROMPT_MS, easing: POP_EASING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }, { scale: 0.96 + 0.04 * progress.value }],
  }));
  return (
    <Animated.Text
      style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.1) }, style]}
      maxFontSizeMultiplier={GAME_HUD_MAX_FONT_MULT}
      accessibilityLiveRegion="polite"
    >
      {t('blinkGuessNow')}
    </Animated.Text>
  );
}

export default function BlinkVeil({ blink, hasGuess }: { blink: BlinkState; hasGuess: boolean }) {
  const covered = blinkCovers(blink);
  const { width, height } = useWindowDimensions();
  const opacity = useSharedValue(covered ? 1 : 0);
  // Web parity (streetView.js / customStreetView.js): the reveal snaps open
  // (a 0.3s round would otherwise be mostly fade) and only the re-blur after
  // the reveal eases. Covering from anything else (a new round's loading,
  // the answer screen) also snaps, so a fresh pano never shows through a
  // half-faded veil.
  const prevPhaseRef = useRef(blink?.phase);
  useEffect(() => {
    const fromReveal = prevPhaseRef.current === 'reveal';
    prevPhaseRef.current = blink?.phase;
    if (covered && fromReveal) {
      opacity.value = withTiming(1, { duration: FADE_MS, easing: FADE_EASING, reduceMotion: RM });
    } else {
      opacity.value = covered ? 1 : 0;
    }
  }, [covered, blink?.phase, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!blink) return null;
  return (
    <>
      {/* Swallows touches while covered so the blurred pano can't be dragged
          (web sets pointer-events:none on the pano while blurred). The veil's
          container holds only the pano, so no control is ever blocked. */}
      <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents={covered ? 'auto' : 'none'}>
        <BlurView
          intensity={100}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
      </Animated.View>
      {/* Text sits outside the veil's fade, as on web (.blink-center is its
          own layer, not part of the blurred pano). */}
      <View style={styles.center} pointerEvents="none">
        {blink.phase === 'countdown' && (
          <BlinkDigit key={blink.count} count={blink.count} size={blinkDigitSize(width, height)} />
        )}
      </View>
      {/* .blink-center--prompt: upper third, padding-top 18vh. A '%' padding
          in RN resolves against WIDTH, which put it at ~8vh on a phone. */}
      <View style={[styles.upper, { paddingTop: Math.round(height * 0.18) }]} pointerEvents="none">
        {blink.phase === 'blurred' && !hasGuess && <BlinkPrompt size={blinkPromptSize(width, height)} />}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  tint: { backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.4)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  upper: { ...StyleSheet.absoluteFillObject, alignItems: 'center', paddingHorizontal: 16 },
  text: {
    color: colors.white,
    // Web: .blink-center__digit/__prompt are font-weight 900 Lexend.
    fontFamily: 'Lexend-Black',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 4 },
  },
});
