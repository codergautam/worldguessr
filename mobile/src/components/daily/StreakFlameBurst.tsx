import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { t } from '../../shared/locale';
import { dailyTimings } from './styles';

interface Props {
  streak: number;
  onDone: () => void;
}

interface Particle {
  id: number;
  dx: number;
  dy: number;
  delay: number;
  scale: number;
  duration: number;
}

function Ember({ p }: { p: Particle }) {
  const opacity = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const ms = p.duration * 1000;
    opacity.value = withDelay(
      p.delay * 1000,
      withSequence(
        withTiming(1, { duration: ms * 0.3 }),
        withTiming(0, { duration: ms * 0.7 }),
      ),
    );
    tx.value = withDelay(p.delay * 1000, withTiming(p.dx, { duration: ms, easing: Easing.out(Easing.cubic) }));
    ty.value = withDelay(p.delay * 1000, withTiming(p.dy, { duration: ms, easing: Easing.out(Easing.cubic) }));
    scale.value = withDelay(p.delay * 1000, withTiming(p.scale, { duration: ms * 0.3 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return <Animated.View style={[styles.ember, style]} />;
}

export default function StreakFlameBurst({ streak, onDone }: Props) {
  const backdropOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.5);
  const coreScale = useSharedValue(0.2);
  const coreOpacity = useSharedValue(0);

  useEffect(() => {
    const enter = dailyTimings.flameEntering;
    const hold = dailyTimings.flameHolding;
    const leave = dailyTimings.flameLeaving;

    backdropOpacity.value = withSequence(
      withTiming(1, { duration: enter, easing: Easing.out(Easing.cubic) }),
      withDelay(hold, withTiming(0, { duration: leave })),
    );
    glowOpacity.value = withSequence(
      withTiming(1, { duration: enter }),
      withDelay(hold, withTiming(0, { duration: leave })),
    );
    glowScale.value = withSequence(
      withTiming(1.5, { duration: enter }),
      withDelay(hold, withTiming(2, { duration: leave })),
    );
    coreScale.value = withTiming(1, { duration: enter, easing: Easing.out(Easing.back(1.5)) });
    coreOpacity.value = withSequence(
      withTiming(1, { duration: enter }),
      withDelay(hold, withTiming(0, { duration: leave })),
    );

    const timer = setTimeout(() => onDone(), dailyTimings.flameTotal);
    return () => clearTimeout(timer);
  }, []);

  const particles = useMemo<Particle[]>(() => {
    const out: Particle[] = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.2;
      const dist = 60 + Math.random() * 120;
      out.push({
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - Math.random() * 60,
        delay: Math.random() * 0.3,
        scale: 0.3 + Math.random() * 0.7,
        duration: 1.2 + Math.random() * 0.8,
      });
    }
    return out;
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: coreOpacity.value,
    transform: [{ scale: coreScale.value }],
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <Text style={styles.icon}>🔥</Text>
        <Text style={styles.number}>{streak}</Text>
        <Text style={styles.label}>
          {streak === 1 ? t('streakStartedBig') : t('streakExtendedBig')}
        </Text>
      </Animated.View>
      <View style={styles.particlesLayer} pointerEvents="none">
        {particles.map((p) => (
          <Ember key={p.id} p={p} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 11000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255,140,40,0.4)',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.9,
    shadowRadius: 60,
    elevation: 20,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 64,
    marginBottom: 6,
  },
  number: {
    color: '#fff',
    fontFamily: 'JockeyOne',
    fontSize: 96,
    lineHeight: 100,
    textShadowColor: '#ff7a1a',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  label: {
    color: '#ffd27a',
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
    letterSpacing: 2,
    marginTop: 4,
  },
  particlesLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ember: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffb060',
    shadowColor: '#ff7a1a',
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
});
