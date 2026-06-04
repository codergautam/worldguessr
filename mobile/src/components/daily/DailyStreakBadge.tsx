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
  // Background mirrors web's .daily-streak-pill cascade. `.diamond` is the LAST
  // single-class rule in daily.scss, so for streak >= 30 it overrides the
  // done/at-risk/default backgrounds regardless of variant — diamond always
  // wins. The variant still drives the icon + animation below (diamond sets no
  // animation of its own on web).
  const colors: readonly [string, string, ...string[]] = diamond
    ? ['#e4f9ff', '#b9f2ff', '#5ed0e6']
    : variant === 'done'
    ? ['#8be0a0', '#3ea35a']
    : variant === 'at-risk'
    ? ['#ff8a4c', '#dc3545']
    : [dailyColors.streakOrangeLight, dailyColors.streakOrange, dailyColors.streakOrangeDark];

  // Web puts the middle stop at 60% (e.g. `#ff7a1a 60%`); the two 3-stop
  // variants (default orange + diamond) need explicit locations so RN doesn't
  // fall back to an even 0/50/100 split. 2-stop variants use the default.
  const locations: readonly [number, number, ...number[]] | undefined =
    colors.length === 3 ? [0, 0.6, 1] : undefined;

  // White text across all variants to match web's home-nav pill rendering.
  const textColor = '#fff';
  const fontSize = size === 'lg' ? 16 : 13;

  return (
    <Animated.View style={[styles.wrap, { alignSelf: align }, animatedStyle]}>
      <LinearGradient
        colors={colors}
        locations={locations}
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
    // Web: letter-spacing: 0.02em (~0.26px at 13px).
    letterSpacing: 0.26,
    // Keep white text legible on the lighter (orange/diamond) gradients.
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
