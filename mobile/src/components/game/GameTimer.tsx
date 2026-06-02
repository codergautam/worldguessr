import { useEffect, useState } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../shared';
import { t } from '../../shared/locale';
import { fontSizes } from '../../styles/theme';
import useAnimatedNumber from '../../hooks/useAnimatedNumber';

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
  criticalEnabled?: boolean;
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
  criticalEnabled = true,
}: GameTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const pulseScale = useSharedValue(1);
  const isServerDriven = serverEndTime !== undefined && serverEndTime > 0;
  const { displayed: displayedScore, animating: scoreAnimating } = useAnimatedNumber(totalScore);

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
      // Match web (gameUI.js): floor to tenths so the displayed value never
      // rounds UP past the true remaining time (off-by-one at phase start).
      const remaining = Math.max(
        0,
        Math.floor((serverEndTime - Date.now() - timeOffset) / 100) / 10,
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
  const isInfiniteRound = initialTime === 86400000 && timeRemaining > 120;
  const shouldShowCountdown = showTimer && !isInfiniteRound && timeRemaining > 0;
  const isCritical = criticalEnabled && shouldShowCountdown && timeRemaining <= 5 && !isPaused;
  useEffect(() => {
    if (isCritical) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 500 }),
          withTiming(1, { duration: 500 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 150 });
    }
  }, [isCritical, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

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
        pulseStyle,
      ]}
    >
      <Text style={styles.roundLabel}>
        {isInfiniteRound
          ? t('roundSlashTotal', { round: currentRound, total: totalRounds })
          : t('roundOfTotal', { round: currentRound, total: totalRounds })}
      </Text>
      <Text style={styles.mainRow}>
        {shouldShowCountdown ? (
          <>
            <Text style={[styles.countdown, isCritical && styles.countdownCritical]}>
              {t('secondsShort', { secs: formatTime(timeRemaining) })}
            </Text>
            <Text style={styles.separator}> · </Text>
          </>
        ) : null}
        <Text style={[styles.points, scoreAnimating && styles.pointsAnimating]}>
          {displayedScore.toLocaleString()}
        </Text>
        <Text style={styles.pointsLabel}> {t('pts')}</Text>
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
    color: '#fecaca',
  },
  separator: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  points: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
  },
  pointsAnimating: {
    color: colors.successGlow,
    textShadowColor: 'rgba(34, 197, 94, 0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  pointsLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'Lexend-SemiBold',
  },
});
