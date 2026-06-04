import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

interface RevealViewProps {
  /** Drives the enter/exit animation. */
  visible: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Vertical offset (px) the content slides from on enter / to on exit.
   * Positive = starts below and slides up (banner); negative = starts above.
   */
  translateY?: number;
  durationIn?: number;
  durationOut?: number;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Mild fade + slide mount/unmount wrapper. Stays mounted through its exit
 * animation so hides are never abrupt, and freezes its last content while
 * exiting (so content that clears on state change doesn't blank mid-slide).
 *
 * Uses core Animated one-shot timings, which ALWAYS play regardless of the OS
 * "Reduce Motion" setting — solid, non-jarring transitions for every user.
 */
export default function RevealView({
  visible,
  children,
  style,
  translateY = 16,
  durationIn = 320,
  durationOut = 200,
  pointerEvents,
}: RevealViewProps) {
  const [rendered, setRendered] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const offset = useRef(new Animated.Value(visible ? 0 : translateY)).current;

  // Keep the last visible content so the exit slide renders it instead of null.
  const frozen = useRef(children);
  if (visible) frozen.current = children;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationIn,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(offset, {
          toValue: 0,
          duration: durationIn,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationOut,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(offset, {
          toValue: translateY,
          duration: durationOut,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, durationIn, durationOut, translateY, opacity, offset]);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[style, { opacity, transform: [{ translateY: offset }] }]}
      pointerEvents={pointerEvents}
    >
      {visible ? children : frozen.current}
    </Animated.View>
  );
}
