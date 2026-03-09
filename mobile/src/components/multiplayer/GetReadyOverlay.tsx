/**
 * Fullscreen overlay shown during the "getready" phase before each round.
 * Shows round number, countdown, and generation progress.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { colors } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';

interface GetReadyOverlayProps {
  round: number;
  totalRounds: number;
  /** Server timestamp when getready phase ends */
  nextEvtTime: number;
  /** Client-server time offset */
  timeOffset: number;
  /** Number of locations generated so far */
  generated: number;
}

export default function GetReadyOverlay({
  round,
  totalRounds,
  nextEvtTime,
  timeOffset,
  generated,
}: GetReadyOverlayProps) {
  const [countdown, setCountdown] = useState(5);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Countdown from server time
  useEffect(() => {
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((nextEvtTime - Date.now() - timeOffset) / 1000),
      );
      setCountdown(remaining);
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [nextEvtTime, timeOffset]);

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Text style={styles.roundLabel}>ROUND {round} OF {totalRounds}</Text>
      <Text style={styles.getReady}>Get Ready!</Text>
      <Text style={styles.countdown}>{countdown}</Text>

      {generated < totalRounds && (
        <Text style={styles.generating}>
          Loading locations... {generated}/{totalRounds}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  roundLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 3,
    marginBottom: spacing.md,
  },
  getReady: {
    color: colors.white,
    fontSize: 36,
    fontFamily: 'Lexend-Bold',
    marginBottom: spacing.lg,
  },
  countdown: {
    color: colors.primary,
    fontSize: 72,
    fontFamily: 'Lexend-Bold',
  },
  generating: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    marginTop: spacing.xl,
  },
});
