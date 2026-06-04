/**
 * Toast notification surface for server-driven events.
 *
 * Renders a top-center stack of toasts (queue lives in `multiplayerStore.toasts`)
 * that mirrors the web `react-toastify` dark theme look & feel:
 *   - dark pill, type-colored left accent + icon
 *   - linear countdown progress bar in the type accent color
 *   - bounce-in entrance (react-toastify `bounceInRight` easing) + slide/fade exit
 *   - swipe horizontally to dismiss (springs back if not past threshold)
 *   - press-and-hold pauses the auto-dismiss + progress (matches web pauseOnHover)
 * Stacked toasts re-flow smoothly via Reanimated layout transitions.
 */

import { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  LinearTransition,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { t } from '../../shared';
import { spacing } from '../../styles/theme';
import { useMultiplayerStore, ToastData } from '../../store/multiplayerStore';
import { accentForType, iconForType, toastSharedStyles } from './toastStyles';
import NotificationPill from './NotificationPill';

/** Default auto-dismiss when the toast doesn't specify one (web default 5s). */
const DEFAULT_DURATION = 4500;
/** react-toastify `bounceInRight` keyframe easing. */
const BOUNCE_EASING = Easing.bezier(0.215, 0.61, 0.355, 1);
/**
 * Always play these animations even when the OS "Reduce Motion" setting is on —
 * they're brief, essential UI feedback (and the web toasts ignore the setting).
 * Without this, Reanimated disables withTiming/layout transitions and toasts
 * just pop in/out with no motion.
 */
const NO_REDUCE = ReduceMotion.Never;
/** Horizontal travel before a swipe counts as a dismiss. */
const SWIPE_THRESHOLD = 80;
/** How far off-screen the toast flies when entering/exiting. */
const OFFSET_X = 400;

export default function ToastProvider() {
  const insets = useSafeAreaInsets();
  const toasts = useMultiplayerStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: insets.top + spacing.sm }]}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastItem({ toast }: { toast: ToastData }) {
  const dismissToast = useMultiplayerStore((s) => s.dismissToast);

  const duration = toast.autoClose ?? DEFAULT_DURATION;
  const accent = accentForType(toast.toastType);
  const iconName = iconForType(toast.toastType);
  const message = t(toast.key, toast.vars, toast.message);

  // Entrance: bounce/slide in from the right + fade.
  const translateX = useSharedValue(OFFSET_X);
  const opacity = useSharedValue(0);
  const progress = useSharedValue(1);

  // Auto-dismiss timer bookkeeping (supports pause-on-press / resume).
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exiting = useRef(false);

  const clearTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const remove = useCallback(() => {
    dismissToast(toast.id);
  }, [dismissToast, toast.id]);

  const beginExit = useCallback(
    (toRight = true) => {
      if (exiting.current) return;
      exiting.current = true;
      clearTimer();
      translateX.value = withTiming(toRight ? OFFSET_X : -OFFSET_X, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
        reduceMotion: NO_REDUCE,
      });
      opacity.value = withTiming(
        0,
        { duration: 200, reduceMotion: NO_REDUCE },
        (finished) => {
          if (finished) runOnJS(remove)();
        },
      );
    },
    [clearTimer, opacity, remove, translateX],
  );

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer();
      startedAt.current = Date.now();
      remaining.current = ms;
      progress.value = withTiming(0, {
        duration: ms,
        easing: Easing.linear,
        reduceMotion: NO_REDUCE,
      });
      hideTimer.current = setTimeout(() => beginExit(true), ms);
    },
    [beginExit, clearTimer, progress],
  );

  const pause = useCallback(() => {
    if (exiting.current) return;
    clearTimer();
    remaining.current = Math.max(
      0,
      remaining.current - (Date.now() - startedAt.current),
    );
    // Freeze the progress bar at its current position.
    cancelAnimation(progress);
  }, [clearTimer, progress]);

  const resume = useCallback(() => {
    if (exiting.current) return;
    startTimer(remaining.current);
  }, [startTimer]);

  // Mount: play entrance + kick off the countdown.
  useEffect(() => {
    translateX.value = withTiming(0, {
      duration: 420,
      easing: BOUNCE_EASING,
      reduceMotion: NO_REDUCE,
    });
    opacity.value = withTiming(1, { duration: 200, reduceMotion: NO_REDUCE });
    startTimer(duration);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe-to-dismiss (horizontal). Springs back if not past threshold.
  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(pause)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 600) {
        runOnJS(beginExit)(e.translationX >= 0);
      } else {
        translateX.value = withTiming(0, { duration: 180, reduceMotion: NO_REDUCE });
        runOnJS(resume)();
      }
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(beginExit)(true);
  });

  const composed = Gesture.Exclusive(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, progress.value) * 100}%`,
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(NO_REDUCE)}
      style={[styles.itemWrap, animatedStyle]}
    >
      <GestureDetector gesture={composed}>
        <NotificationPill icon={iconName} accent={accent} message={message}>
          <View style={toastSharedStyles.progressTrack}>
            <Animated.View
              style={[
                toastSharedStyles.progressFill,
                { backgroundColor: accent },
                progressStyle,
              ]}
            />
          </View>
        </NotificationPill>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10000,
    alignItems: 'center',
    gap: spacing.xs,
  },
  itemWrap: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'stretch',
  },
});
