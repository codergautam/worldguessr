import { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Platform } from 'react-native';
import { colors } from '../../shared';
import { fontSizes } from '../../styles/theme';

interface GameTimerProps {
  timeRemaining: number;
  onTimeUp: () => void;
  isPaused?: boolean;
  roundKey?: number;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  showTimer?: boolean;
}

export default function GameTimer({
  timeRemaining: initialTime,
  onTimeUp,
  isPaused,
  roundKey,
  currentRound,
  totalRounds,
  totalScore,
  showTimer = true,
}: GameTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Reset timer when initialTime changes (new round)
  useEffect(() => {
    setTimeRemaining(initialTime);
  }, [initialTime, roundKey]);

  // Timer countdown
  useEffect(() => {
    if (!showTimer || isPaused || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showTimer, isPaused, timeRemaining, onTimeUp]);

  // Pulse animation when critical (<=5s)
  const isCritical = showTimer && timeRemaining <= 5 && timeRemaining > 0 && !isPaused;
  useEffect(() => {
    if (isCritical) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isCritical]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}`;
  };

  return (
    <Animated.View
      style={[
        styles.pill,
        isCritical && styles.pillCritical,
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <Text style={styles.roundLabel}>
        Round {currentRound} of {totalRounds}
      </Text>
      <Text style={styles.mainRow}>
        {showTimer && timeRemaining > 0 ? (
          <>
            <Text style={[styles.countdown, isCritical && styles.countdownCritical]}>
              {formatTime(timeRemaining)}s
            </Text>
            <Text style={styles.separator}> · </Text>
          </>
        ) : null}
        <Text style={styles.points}>{totalScore.toLocaleString()}</Text>
        <Text style={styles.pointsLabel}> pts</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    gap: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  pillCritical: {
    backgroundColor: 'rgba(220, 100, 100, 0.9)',
    borderColor: 'rgba(255, 200, 200, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(220, 100, 100, 0.4)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 20,
      },
    }),
  },
  roundLabel: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
    opacity: 0.75,
    letterSpacing: 0.6,
  },
  mainRow: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
    letterSpacing: 0.3,
  },
  countdown: {
    fontFamily: 'Lexend-SemiBold',
    fontVariant: ['tabular-nums'],
    color: colors.white,
  },
  countdownCritical: {
    color: '#fff',
  },
  separator: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  points: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
  },
  pointsLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'Lexend-SemiBold',
  },
});
