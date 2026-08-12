import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const CARD_CELEBRATION_MS = 1450;
/** Gold frame + light sweep mounted inside the one card whose purchase landed. */
export function PurchaseCardCelebration({ trigger }: { trigger: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: CARD_CELEBRATION_MS,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
    return () => cancelAnimation(progress);
  }, [progress, trigger]);

  const frameStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.06, 0.72, 1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{
      scale: interpolate(
        progress.value,
        [0, 0.12, 0.42, 1],
        [0.965, 1.018, 1, 1],
        Extrapolation.CLAMP,
      ),
    }],
  }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.05, 0.15, 0.54, 0.64], [0, 0.72, 0.72, 0]),
    transform: [
      { translateX: interpolate(progress.value, [0.05, 0.64], [-220, 220]) },
      { rotate: '18deg' },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.cardFrame, frameStyle]}
      accessibilityElementsHidden
    >
      <View style={styles.shineClip}>
        <Animated.View style={[styles.shine, shineStyle]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,244,194,0.72)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardFrame: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    borderWidth: 2,
    borderColor: '#F6C453',
    borderRadius: 16,
    shadowColor: '#F6C453',
    shadowOpacity: 0.68,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  shineClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: -48,
    bottom: -48,
    left: '50%',
    width: 68,
  },
});
