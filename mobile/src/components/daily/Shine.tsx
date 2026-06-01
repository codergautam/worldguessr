import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, Easing } from 'react-native-reanimated';
import { withRepeat, withTiming } from './anims';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Sweeping diagonal highlight — a skewed white gradient strip that travels
 * across its (overflow:hidden) parent on a loop. Mirrors web's
 * `dailyShareShine` / `shimmerRibbon` swept-highlight. The parent must clip
 * overflow; the strip sweeps the full screen width so a small element only
 * lights up briefly each cycle.
 */
export default function Shine({ duration = 3000, intensity = 0.5 }: { duration?: number; intensity?: number }) {
  const { width } = useWindowDimensions();
  const stripW = Math.round(width * 0.32);
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [duration]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -stripW + p.value * (width + stripW) }, { skewX: '-18deg' }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.strip, { width: stripW }, style]}>
      <LinearGradient
        colors={['transparent', `rgba(255,255,255,${intensity})`, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    left: 0,
  },
});
