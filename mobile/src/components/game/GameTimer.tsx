import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors } from '../../shared';
import { fontSizes, borderRadius, spacing } from '../../styles/theme';

interface GameTimerProps {
  timeRemaining: number;
  onTimeUp: () => void;
  isPaused?: boolean;
}

export default function GameTimer({ timeRemaining: initialTime, onTimeUp, isPaused }: GameTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Reset timer when initialTime changes (new round)
  useEffect(() => {
    setTimeRemaining(initialTime);
  }, [initialTime]);

  // Timer countdown
  useEffect(() => {
    if (isPaused || timeRemaining <= 0) return;

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
  }, [isPaused, timeRemaining, onTimeUp]);

  // Pulse animation when time is low
  useEffect(() => {
    if (timeRemaining <= 10 && timeRemaining > 0 && !isPaused) {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [timeRemaining, isPaused]);

  const getTimerColor = () => {
    if (timeRemaining <= 5) return colors.error;
    if (timeRemaining <= 10) return colors.warning;
    return colors.white;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}`;
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: pulseAnim }] },
        timeRemaining <= 10 && styles.containerUrgent,
      ]}
    >
      <Text style={[styles.time, { color: getTimerColor() }]}>
        {formatTime(timeRemaining)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    minWidth: 60,
    alignItems: 'center',
  },
  containerUrgent: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  time: {
    fontSize: fontSizes.lg,
    fontWeight: 'bold',
  },
});
