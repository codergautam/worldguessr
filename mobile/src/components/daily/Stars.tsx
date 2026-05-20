import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { dailyColors } from './styles';

const TOTAL_MAX = 15000;

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

function starsFromPercent(percent: number): Tier[] {
  if (percent <= 20) return ['bronze'];
  if (percent <= 40) return ['bronze', 'bronze'];
  if (percent <= 50) return ['bronze', 'bronze', 'bronze'];
  if (percent <= 65) return ['silver', 'silver', 'silver'];
  if (percent <= 85) return ['gold', 'gold', 'gold'];
  return ['platinum', 'platinum', 'platinum'];
}

const COLORS: Record<Tier, string> = {
  bronze: dailyColors.bronze,
  silver: dailyColors.silver,
  gold: dailyColors.gold,
  platinum: '#b9f2ff',
};

function StarItem({ tier, delay }: { tier: Tier; delay: number }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 110 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.star, animatedStyle]}>
      <Ionicons name="star" size={32} color={COLORS[tier]} />
    </Animated.View>
  );
}

export default function Stars({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / TOTAL_MAX) * 100));
  const tiers = starsFromPercent(pct);
  return (
    <View style={styles.row}>
      {tiers.map((tier, i) => (
        <StarItem key={i} tier={tier} delay={i * 500} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 12,
  },
  star: {
    padding: 2,
  },
});
