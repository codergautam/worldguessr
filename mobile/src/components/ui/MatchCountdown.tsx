/**
 * Polished match-start countdown: a draining SVG progress ring around a big
 * number that pops on every tick. Shared by GetReadyOverlay (duels) and the
 * GameLoadingOverlay countdown path (casual round 1) so the "game starting in
 * X…" moment looks the same everywhere.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../shared';
import { fontSizes, spacing } from '../../styles/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Remaining seconds — may be fractional (drives the ring); displayed as ceil. */
  seconds: number;
  /** Ring window length; auto-grows to the largest value seen if a tick exceeds it. */
  totalSeconds?: number;
  label?: string;
  sublabel?: string;
  footnote?: string;
  /** Ring + number color. */
  accent?: string;
}

const SIZE = 184;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function MatchCountdown({
  seconds,
  totalSeconds = 5,
  label,
  sublabel,
  footnote,
  accent = colors.success,
}: Props) {
  // Grow the ring window to the largest remaining value we've observed so the
  // ring starts full even when we mount a beat into the countdown.
  const maxRef = useRef(totalSeconds);
  maxRef.current = Math.max(maxRef.current, seconds);
  const progress = maxRef.current > 0 ? Math.max(0, Math.min(1, seconds / maxRef.current)) : 0;

  // The `seconds` prop can momentarily arrive as 0 on the first render (the
  // parent's countdown state initialises to 0 before its timer effect runs).
  // Track the first real (>0) value so the ring always begins full and only
  // drains, instead of painting empty and visibly filling up.
  const syncedRef = useRef(false);

  const display = seconds > 0
    ? Math.ceil(seconds)
    : syncedRef.current
      ? 0                                       // genuinely reached zero
      : Math.max(1, Math.ceil(maxRef.current)); // pre-sync: show the full window

  // The `seconds` prop only updates every ~100ms (10 steps/sec), which makes the
  // ring visibly step. Drive the dash offset through an Animated.Value and glide
  // to each new target with a linear tween so it interpolates to 60fps. The ring
  // holds full until the first real value, then snaps to the true starting fill
  // (no visible fill-up) and only ever drains from there. Duration sits just over
  // the poll interval so a tween is always in flight, bridging the gaps rather
  // than snapping and pausing.
  const progressAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!syncedRef.current) {
      if (seconds > 0) {
        syncedRef.current = true;
        progressAnim.setValue(progress); // snap to the real starting fill
      }
      return; // hold full until the countdown actually starts
    }
    const anim = Animated.timing(progressAnim, {
      toValue: progress,
      duration: 130,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset isn't a native-driver prop
    });
    anim.start();
    return () => anim.stop();
  }, [progress, seconds, progressAnim]);

  const offset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C, 0],
  });

  // Pop the number on each integer change.
  const pop = useRef(new Animated.Value(1)).current;
  const lastRef = useRef(display);
  useEffect(() => {
    if (display !== lastRef.current) {
      lastRef.current = display;
      pop.setValue(0.72);
      Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [display, pop]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.ringWrap, { width: SIZE, height: SIZE }]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            fill="none"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Animated.Text style={[styles.number, { color: accent, transform: [{ scale: pop }] }]}>
            {display}
          </Animated.Text>
        </View>
      </View>

      {!!label && <Text style={styles.label}>{label}</Text>}
      {!!sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      {!!footnote && <Text style={styles.footnote}>{footnote}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontSize: 84,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 },
  },
  label: {
    color: colors.white,
    fontSize: 30,
    fontFamily: 'Lexend-Bold',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  sublabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  footnote: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
