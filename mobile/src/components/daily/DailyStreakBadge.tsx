import { useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { withRepeat, withSequence, withTiming } from './anims';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../../shared/locale';
import { dailyColors, dailyTimings } from './styles';

export type StreakVariant = 'default' | 'pulsing' | 'at-risk' | 'done';

interface Props {
  streak: number;
  variant?: StreakVariant;
  size?: 'sm' | 'lg';
  align?: 'flex-start' | 'center' | 'flex-end';
}

export default function DailyStreakBadge({ streak, variant = 'default', size = 'sm', align = 'flex-start' }: Props) {
  const scale = useSharedValue(1);
  const brightness = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(brightness);
    if (variant === 'pulsing') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: dailyTimings.streakPulse / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: dailyTimings.streakPulse / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else if (variant === 'at-risk') {
      brightness.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
      brightness.value = withTiming(1, { duration: 200 });
    }
    return () => {
      cancelAnimation(scale);
      cancelAnimation(brightness);
    };
  }, [variant]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: brightness.value,
  }));

  if (!streak || streak <= 0) return null;

  const diamond = streak >= 30;
  // Gradient stops mirror web .daily-streak-pill variants exactly.
  const colors: readonly [string, string, ...string[]] =
    variant === 'done'
      ? ['#8be0a0', '#3ea35a']
      : variant === 'at-risk'
      ? ['#ff8a4c', '#dc3545']
      : diamond
      ? ['#e4f9ff', '#b9f2ff', '#5ed0e6']
      : [dailyColors.streakOrangeLight, dailyColors.streakOrange, dailyColors.streakOrangeDark];

  const textColor =
    variant === 'at-risk' ? '#fff' : variant === 'done' ? '#072814' : diamond ? '#083644' : '#1a0a00';
  const fontSize = size === 'lg' ? 16 : 13;

  return (
    <Animated.View style={[styles.wrap, { alignSelf: align }, animatedStyle]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pill}
      >
        <Text style={[styles.icon, { fontSize: fontSize + 2 }]} accessibilityElementsHidden>
          {variant === 'done' ? '✓' : '🔥'}
        </Text>
        <Text style={[styles.label, { fontSize, color: textColor }]}>
          {streak === 1 ? t('streakOne') : t('streakDays', { count: streak })}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 4,
  },
  icon: {
    lineHeight: 18,
  },
  label: {
    fontFamily: 'Lexend-SemiBold',
  },
});
