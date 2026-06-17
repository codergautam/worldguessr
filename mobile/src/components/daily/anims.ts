import {
  withTiming as rnWithTiming,
  withSpring as rnWithSpring,
  withDelay as rnWithDelay,
  withRepeat as rnWithRepeat,
  withSequence as rnWithSequence,
  ReduceMotion,
  type WithTimingConfig,
  type WithSpringConfig,
  type AnimationCallback,
} from 'react-native-reanimated';

/**
 * Reanimated honours the OS "Reduce Motion" accessibility setting by default —
 * with it on, every animation snaps straight to its end value (no fades, no
 * star pops, no shimmer). The Daily Challenge UI is animation-forward by design
 * (web parity), so these wrappers force `ReduceMotion.Never` on every primitive
 * AND its modifiers (withRepeat/withSequence/withDelay each check it too).
 *
 * Use these in the daily components in place of the raw reanimated functions.
 */
const RM = ReduceMotion.Never;

export function withTiming(toValue: number, config: WithTimingConfig = {}, callback?: AnimationCallback): number {
  return rnWithTiming(toValue, { ...config, reduceMotion: RM }, callback);
}

export function withSpring(toValue: number, config: WithSpringConfig = {}, callback?: AnimationCallback): number {
  return rnWithSpring(toValue, { ...config, reduceMotion: RM }, callback);
}

export function withDelay(delayMs: number, animation: number): number {
  return (rnWithDelay as any)(delayMs, animation, RM);
}

// IMPORTANT: looping / idle animations (pulses, shimmer, shine) are the ONLY
// users of withRepeat, and they intentionally DO respect the OS reduce-motion
// setting (default System) — forcing them on made the UI far busier than web.
// Only the one-shot entrances above (timing/spring/delay/sequence) always play.
export function withRepeat(
  animation: number,
  numberOfReps = 2,
  reverse = false,
  callback?: AnimationCallback,
): number {
  return (rnWithRepeat as any)(animation, numberOfReps, reverse, callback);
}

export function withSequence(...animations: number[]): number {
  return (rnWithSequence as any)(RM, ...animations);
}
