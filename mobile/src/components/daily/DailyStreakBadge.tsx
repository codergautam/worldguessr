import { useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../../shared/locale';
import { dailyColors, dailyTimings } from './styles';

export type StreakVariant = 'default' | 'pulsing' | 'at-risk' | 'done';

interface Props {
  streak: number;
  variant?: StreakVariant;
  size?: 'sm' | 'lg';
}

export default function DailyStreakBadge({ streak, variant = 'default', size = 'sm' }: Props) {
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
  const colors: [string, string, string] =
    variant === 'done'
      ? ['#5cba60', '#3da041', '#2a7a30']
      : variant === 'at-risk'
      ? [dailyColors.streakRed, '#a02030', '#7a1820']
      : diamond
      ? [dailyColors.diamondLight, dailyColors.diamondDark, '#3aa4b8']
      : [dailyColors.streakOrangeLight, dailyColors.streakOrange, dailyColors.streakOrangeDark];

  const fontSize = size === 'lg' ? 16 : 13;

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pill}
      >
        <Text style={[styles.icon, { fontSize: fontSize + 2 }]} accessibilityElementsHidden>
          {variant === 'done' ? '✓' : '🔥'}
        </Text>
        <Text style={[styles.label, { fontSize, color: diamond || variant === 'at-risk' ? '#fff' : '#1a0a00' }]}>
          {streak === 1 ? t('streakOne') : t('streakDays', { count: streak })}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
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
