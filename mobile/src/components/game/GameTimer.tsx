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
  /** Server-driven mode: the server timestamp when the current phase ends */
  serverEndTime?: number;
  /** Time offset between client and server clocks (from wsService.timeOffset) */
  timeOffset?: number;
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
  serverEndTime,
  timeOffset = 0,
}: GameTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isServerDriven = serverEndTime !== undefined && serverEndTime > 0;

  // Reset timer when initialTime changes (new round) — local mode only
  useEffect(() => {
    if (!isServerDriven) {
      setTimeRemaining(initialTime);
    }
  }, [initialTime, roundKey, isServerDriven]);

  // Server-driven timer: calculate remaining from serverEndTime
  useEffect(() => {
    if (!isServerDriven || !showTimer) return;

    const update = () => {
      const remaining = Math.max(
        0,
        Math.round((serverEndTime - Date.now() - timeOffset) / 100) / 10,
      );
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        onTimeUp();
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [isServerDriven, serverEndTime, timeOffset, showTimer, onTimeUp]);

  // Local countdown timer — only when NOT server-driven
  useEffect(() => {
    if (isServerDriven) return;
    if (!showTimer || isPaused || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          clearInterval(interval);
          // Defer onTimeUp to avoid setState during render
          setTimeout(onTimeUp, 0);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isServerDriven, showTimer, isPaused, timeRemaining <= 0, onTimeUp]);

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
    if (mins > 0) {
      return `${mins}:${Math.floor(secs).toString().padStart(2, '0')}.${Math.round((secs % 1) * 10)}`;
    }
    return secs.toFixed(1);
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
