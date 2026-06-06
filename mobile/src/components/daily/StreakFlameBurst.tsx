import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { withTiming, withDelay, withSequence, withRepeat } from './anims';
import { t } from '../../shared/locale';
import { dailyTimings, dailyColors } from './styles';

interface Props {
  streak: number;
  onDone: () => void;
}

const GLOW_SIZE = 340;
const RING_SIZE = 300;

// Warm vignette (mirrors web's `radial-gradient(circle, rgba(60,20,0,.85), rgba(0,0,0,.95))`).
const BACKDROP_STOPS = [
  { offset: '0%', color: '#3c1400', opacity: 0.82 },
  { offset: '100%', color: '#000000', opacity: 0.96 },
] as const;

// Soft ember-orange core glow (mirrors web's blurred `.daily-flame-glow`). A
// real radial falloff via SVG — replaces the old flat disc that read as a hard
// circle on device.
const GLOW_STOPS = [
  { offset: '0%', color: '#ffb13c', opacity: 0.6 },
  { offset: '42%', color: '#ff5a00', opacity: 0.22 },
  { offset: '72%', color: '#ff5a00', opacity: 0 },
] as const;

/** Static SVG radial fill; animate scale/opacity on the wrapping Animated.View. */
function RadialFill({
  width,
  height,
  id,
  stops,
}: {
  width: number;
  height: number;
  id: string;
  stops: readonly { offset: string; color: string; opacity: number }[];
}) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          {stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

interface Particle {
  id: number;
  dx: number;
  dy: number;
  delay: number;
  scale: number;
  duration: number;
}

// Glowing ember: concentric halo→mid→core circles fake the radial falloff of
// web's layered box-shadow, so each particle reads as a soft spark, not a flat dot.
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

  return (
    <Animated.View style={[styles.emberWrap, style]}>
      <View style={styles.emberHalo} />
      <View style={styles.emberMid} />
      <View style={styles.emberCore} />
    </Animated.View>
  );
}

export default function StreakFlameBurst({ streak, onDone }: Props) {
  const { width, height } = useWindowDimensions();

  const backdropOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.5);
  const glowPulse = useSharedValue(1);
  const ringScale = useSharedValue(0.2);
  const ringOpacity = useSharedValue(0);
  const coreScale = useSharedValue(0.2);
  const coreOpacity = useSharedValue(0);
  const flameFloat = useSharedValue(0);
  const flameBreathe = useSharedValue(1);

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
      withTiming(1.4, { duration: enter, easing: Easing.out(Easing.cubic) }),
      withDelay(hold, withTiming(1.9, { duration: leave })),
    );
    // Gentle breathing while it holds — overlays the enter/leave scale above.
    glowPulse.value = withDelay(
      enter,
      withRepeat(withTiming(1.1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true),
    );

    // One-shot shockwave ring on entrance.
    ringScale.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    ringOpacity.value = withSequence(
      withTiming(0.55, { duration: 140 }),
      withTiming(0, { duration: 760, easing: Easing.out(Easing.quad) }),
    );

    coreScale.value = withTiming(1, { duration: enter, easing: Easing.out(Easing.back(1.6)) });
    coreOpacity.value = withSequence(
      withTiming(1, { duration: enter }),
      withDelay(hold, withTiming(0, { duration: leave })),
    );

    // Idle flame flicker — float + breathe, like web's `dailyFlameFloat`.
    flameFloat.value = withRepeat(
      withTiming(-8, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    flameBreathe.value = withRepeat(
      withTiming(1.09, { duration: 820, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
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
    transform: [{ scale: glowScale.value * glowPulse.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: coreOpacity.value,
    transform: [{ scale: coreScale.value }],
  }));
  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: flameFloat.value }, { scale: flameBreathe.value }],
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <RadialFill width={width} height={height} id="flameBackdrop" stops={BACKDROP_STOPS} />
      </Animated.View>

      <Animated.View style={[styles.glow, glowStyle]}>
        <RadialFill width={GLOW_SIZE} height={GLOW_SIZE} id="flameGlow" stops={GLOW_STOPS} />
      </Animated.View>

      <Animated.View style={[styles.ring, ringStyle]} />

      <Animated.View style={[styles.core, coreStyle]}>
        <Animated.Text style={[styles.icon, flameStyle]}>🔥</Animated.Text>
        <Text style={styles.number}>{streak}</Text>
        <Text style={styles.label}>
          {streak === 1 ? t('streakStartedLabel') : t('streakExtended')}
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
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2.5,
    borderColor: dailyColors.streakOrange,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 64,
    lineHeight: 72,
    marginBottom: 6,
  },
  number: {
    color: '#fff',
    fontFamily: 'JockeyOne',
    fontSize: 96,
    lineHeight: 100,
    fontVariant: ['tabular-nums'],
    textShadowColor: dailyColors.streakOrange,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 28,
  },
  label: {
    color: dailyColors.streakOrangeLight,
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    marginTop: 4,
  },
  particlesLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emberWrap: {
    position: 'absolute',
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emberHalo: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,90,0,0.22)',
  },
  emberMid: {
    position: 'absolute',
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: 'rgba(255,150,50,0.55)',
  },
  emberCore: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ffe6bd',
  },
});
