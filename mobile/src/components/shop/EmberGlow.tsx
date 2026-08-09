import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/* ===========================================================================
 *  THE EMBER — `fx: 'ember'` from src/shared/emotes.ts, drawn on this platform.
 *
 *  ONE EMOTE HAS ONE, and that is the point: the skull costs 200 Stamps against
 *  a ladder that otherwise stops at 150, so it has to look like the top of the
 *  ladder wherever it appears. Every surface that draws that glyph mounts this
 *  behind it — the shop's wheel cell, the shop's shelf card, the in-game picker
 *  button and the reaction that floats up mid-duel.
 *
 *  WHY IT IS NOT WHAT WEB DOES. Web animates a pair of drop-shadows
 *  (.emoteFx--ember in styles/globals.scss): a tight orange core breathing into
 *  a loose red bloom, 2.4s, plus a slow rise. React Native has neither a shadow
 *  radius it can animate nor a blur without a native dependency, so a literal
 *  port is not available. What IS available, and what this uses:
 *
 *    a soft disc     two stacked circles at low alpha, the outer wider and
 *                    dimmer, which is a poor man's radial falloff and reads as
 *                    one warm glow at 44px.
 *    OPACITY         natively animatable, so the breathing runs on the UI thread
 *                    and costs nothing on the JS side. Scale too — both are
 *                    transform/opacity, the only two properties this app
 *                    animates anywhere for exactly this reason.
 *    a text shadow   static, on the glyph itself, at the caller (see
 *                    cellGlyphEmber). textShadowRadius works on both platforms
 *                    but cannot be animated off the UI thread, so it holds the
 *                    core while this disc does the moving.
 *
 *  Same period as web's keyframes (2400ms) so the two clients breathe together
 *  if you ever look at them side by side.
 *
 *  REDUCED MOTION: the burn STAYS, the movement goes. ReduceMotion.System hands
 *  that decision to the OS setting, and the resting opacity is the bright end of
 *  the cycle rather than the dim one — a still ember should look lit.
 * ======================================================================== */

const PERIOD = 1200;

export default function EmberGlow({ size }: { size: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: PERIOD, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
      // -1 = forever, true = reverse, so it breathes rather than restarting with
      // a jump every cycle.
      -1,
      true,
      undefined,
      ReduceMotion.System,
    );
  }, [pulse]);

  const inner = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.4,
    transform: [{ scale: 0.98 + pulse.value * 0.1 }],
  }));

  const outer = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.22,
    transform: [{ scale: 1.05 + pulse.value * 0.18 }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.disc,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: 'rgba(230, 57, 70, 0.55)',
          },
          outer,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.disc,
          {
            width: size * 0.68,
            height: size * 0.68,
            borderRadius: size * 0.34,
            backgroundColor: 'rgba(255, 138, 42, 0.65)',
          },
          inner,
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Absolute and centred, so mounting one never moves the glyph it sits behind
  // and the caller needs no layout of its own.
  disc: {
    position: 'absolute',
    alignSelf: 'center',
  },
});
