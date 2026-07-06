import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dailyColors } from './styles';

// Uses React Native's CORE Animated (not Reanimated) on purpose: it ignores the
// OS "Reduce Motion" setting, so the star pop ALWAYS plays — matching web and
// the in-game animations, which the user confirmed work with Reduce Motion on.

const TOTAL_MAX = 15000;
const ENTER_DELAY = 220; // let the modal settle, THEN pop the stars in (so it's seen)
const STAGGER = 180;

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
  bronze: dailyColors.bronze, // #b6b2b2
  silver: dailyColors.silver, // #CD7F32
  gold: dailyColors.gold, // 'gold'
  platinum: '#b9f2ff',
};

// Per-tier glow — mirrors web's drop-shadow on .daily-header-star. Tight so the
// stars read crisp, not fuzzy.
const GLOW: Record<Tier, { color: string; radius: number } | null> = {
  bronze: null,
  silver: { color: 'rgba(205,127,50,0.5)', radius: 4 },
  gold: { color: 'rgba(255,215,0,0.6)', radius: 5 },
  platinum: { color: 'rgba(185,242,255,0.7)', radius: 6 },
};

const STAR_SIZE = 30; // web 1.8rem

function StarItem({ tier, delay }: { tier: Tier; delay: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, delay, friction: 5, tension: 130, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, delay, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const glow = GLOW[tier];

  return (
    <Animated.View style={[styles.star, { opacity, transform: [{ scale }] }]}>
      {tier === 'platinum' ? (
        <Image
          source={require('../../../assets/platinum_star.png')}
          style={styles.platImg}
          resizeMode="contain"
        />
      ) : (
        <Ionicons
          name="star"
          size={STAR_SIZE}
          color={COLORS[tier]}
          style={
            glow
              ? { textShadowColor: glow.color, textShadowRadius: glow.radius, textShadowOffset: { width: 0, height: 0 } }
              : undefined
          }
        />
      )}
    </Animated.View>
  );
}

export default function Stars({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / TOTAL_MAX) * 100));
  const tiers = starsFromPercent(pct);
  return (
    <View style={styles.row}>
      {tiers.map((tier, i) => (
        <StarItem key={`${tier}-${i}`} tier={tier} delay={ENTER_DELAY + i * STAGGER} />
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
  platImg: {
    width: STAR_SIZE,
    height: STAR_SIZE,
    shadowColor: '#b9f2ff',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
