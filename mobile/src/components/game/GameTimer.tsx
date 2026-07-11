import { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../shared';
import { t } from '../../shared/locale';
import { fontSizes } from '../../styles/theme';
import { useGameUiScale } from '../../styles/responsive';
import useAnimatedNumber from '../../hooks/useAnimatedNumber';
import { playSfx, stopSfx } from '../../services/sound';

interface GameTimerProps {
  timeRemaining: number;
  onTimeUp: () => void;
  isPaused?: boolean;
  roundKey?: number;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  showTimer?: boolean;
  /** Server-driven mode: the server timestamp when the current phase ends */
  serverEndTime?: number;
  /** Time offset between client and server clocks (from wsService.timeOffset) */
  timeOffset?: number;
  criticalEnabled?: boolean;
  /**
   * True once the player has placed a pin / submitted their guess for the round.
   * Mirrors web's `!pinPoint` guard (gameUI.js): the critical red-warning state
   * calms down the instant a guess exists, so a guessed player isn't nagged.
   */
  hasGuess?: boolean;
  /**
   * 'duel' renders a single compact line ("Round #1 / 5 - 23.5 seconds") with no
   * score — the duel score IS the player's health (shown in the health bars).
   * Mirrors web's `.timer.duel` (gameUI.js). 'default' keeps the two-line
   * round + animated-score pill used by singleplayer / casual multiplayer.
   */
  variant?: 'default' | 'duel';
}

// ── Motion policy ───────────────────────────────────────────────────────────
// Web's `.timer.critical` is a STATIC scale(1.05) + red skin, while the separate
// `timerPulse` keyframe breathes the GLOW + BRIGHTNESS (never the scale). We
// replicate that exactly: one shared value drives the smooth in/out skin
// transition (web's `transition: all`), another drives the looping breathe.
//
// Every animation here forces `ReduceMotion.Never` so the warning reads
// identically — and stays smooth — for reduce-motion users (the user explicitly
// asked for this; it matches the DuelHUD / Daily "functional motion always
// plays" policy).
const RM = ReduceMotion.Never;
const SKIN_MS = 300; // matches web .timer `transition: all 0.3s`
const BREATHE_MS = 500; // matches web `timerPulse 1s` (500ms each direction)

const IS_IOS = Platform.OS === 'ios';
const NORMAL_BG = Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent;
const NORMAL_BORDER = colors.primary;
// Web critical gradient is rgba(220,100,100)→rgba(200,80,80); a single mid red
// reads the same on a small pill.
const CRITICAL_BG = 'rgba(212, 92, 92, 0.92)';
const CRITICAL_BORDER = 'rgba(255, 200, 200, 0.55)';

export default function GameTimer({
  timeRemaining: initialTime,
  onTimeUp,
  isPaused,
  roundKey,
  currentRound,
  totalRounds,
  totalScore,
  showTimer = true,
  serverEndTime,
  timeOffset = 0,
  criticalEnabled = true,
  hasGuess = false,
  variant = 'default',
}: GameTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  // Tablet scale: this HUD pill uses fixed theme px (md/xs) that read small on an
  // iPad. Bump the text + pill padding up. Phones: sc is 1.0× (no-op).
  const { sc, isTablet } = useGameUiScale();
  // critical: 0 = normal skin, 1 = red critical skin (smoothly tweened).
  const critical = useSharedValue(0);
  // breathe: 0↔1 loop while critical, drives glow/brightness only.
  const breathe = useSharedValue(0);
  const isServerDriven = serverEndTime !== undefined && serverEndTime > 0;
  const { displayed: displayedScore, animating: scoreAnimating } = useAnimatedNumber(totalScore);

  // Reset timer when initialTime changes (new round) — local mode only
  useEffect(() => {
    if (!isServerDriven) {
      setTimeRemaining(initialTime);
    }
  }, [initialTime, roundKey, isServerDriven]);

  // Server-driven timer: calculate remaining from serverEndTime
  useEffect(() => {
    if (!isServerDriven || !showTimer) return;

    const update = () => {
      // Match web (gameUI.js): floor to tenths so the displayed value never
      // rounds UP past the true remaining time (off-by-one at phase start).
      const remaining = Math.max(
        0,
        Math.floor((serverEndTime - Date.now() - timeOffset) / 100) / 10,
      );
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        onTimeUp();
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [isServerDriven, serverEndTime, timeOffset, showTimer, onTimeUp]);

  // Local countdown timer — only when NOT server-driven
  useEffect(() => {
    if (isServerDriven) return;
    if (!showTimer || isPaused || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          clearInterval(interval);
          // Defer onTimeUp to avoid setState during render
          setTimeout(onTimeUp, 0);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isServerDriven, showTimer, isPaused, timeRemaining <= 0, onTimeUp]);

  // Critical when <=5s — mirrors web's full guard set: time window, not paused
  // (web `!showAnswer`), state===guess (`criticalEnabled`), AND no guess yet
  // (web `!pinPoint`). Placing a pin / guessing instantly calms the warning.
  const isInfiniteRound = initialTime === 86400000 && timeRemaining > 120;
  // Show the countdown all the way down to 0.0 (web renders `.toFixed(1)` with
  // no `> 0` gate on the multiplayer/duel timers — only the red critical skin
  // stops at `> 0`). Hiding at exactly 0.0 was the flash the user reported.
  const shouldShowCountdown = showTimer && !isInfiniteRound;
  const isCritical =
    criticalEnabled &&
    shouldShowCountdown &&
    timeRemaining <= 5 &&
    timeRemaining > 0 &&
    !isPaused &&
    !hasGuess;

  // Round-clock ticking bed: the last-5s window, one shot per round, and —
  // unlike the red critical skin — deliberately NOT gated on having guessed
  // (user ruling: a locked-in player still hears the reveal closing in).
  // Stopped the moment the window exits (early round advance, pause) and on
  // unmount, so ticks can never play over the reveal.
  const inTickingWindow =
    criticalEnabled && shouldShowCountdown && timeRemaining <= 5 && timeRemaining > 0 && !isPaused;
  const tickingRoundRef = useRef<number | string | null>(null);
  useEffect(() => {
    if (inTickingWindow) {
      if (tickingRoundRef.current !== (roundKey ?? 'round')) {
        tickingRoundRef.current = roundKey ?? 'round';
        // Web mix (gameUI.js): fixed pitch — a wobbling clock reads broken —
        // at a bed level under the one-shots.
        playSfx('ticking', { pitchJitter: 0, volume: 0.6 });
      }
      return;
    }
    // Re-arm on window exit: within a round time only moves forward, so the
    // window can only re-enter via a pause (map modal) — clearing here lets
    // the bed resume for the remaining seconds instead of staying silent.
    tickingRoundRef.current = null;
    stopSfx('ticking');
  }, [inTickingWindow, roundKey]);
  useEffect(() => () => stopSfx('ticking'), []);

  // Drive the two shared values off `isCritical`. The skin tweens smoothly both
  // ways; the breathe loop only runs while critical (and is cancelled + reset
  // when it ends so it never lingers mid-pulse).
  useEffect(() => {
    critical.value = withTiming(isCritical ? 1 : 0, {
      duration: SKIN_MS,
      reduceMotion: RM,
    });

    if (isCritical) {
      breathe.value = withRepeat(
        withSequence(
          RM,
          withTiming(1, { duration: BREATHE_MS, reduceMotion: RM }),
          withTiming(0, { duration: BREATHE_MS, reduceMotion: RM }),
        ),
        -1,
        false,
        undefined,
        RM,
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(0, { duration: SKIN_MS, reduceMotion: RM });
    }
  }, [isCritical, critical, breathe]);

  // Pill skin: bg + border colour + a STATIC scale(1.05) when critical (web
  // `.timer.critical { transform: scale(1.05) }`), plus the breathing glow.
  // iOS animates the real shadow (glow); the brightness overlay below carries
  // the breathe on Android where coloured shadows aren't available.
  const pillAnimStyle = useAnimatedStyle(() => {
    const c = critical.value;
    const p = breathe.value;
    // NOTE: branch on the captured `IS_IOS` constant — `Platform.select` is a
    // non-worklet JS function and throws if called on the UI thread.
    if (IS_IOS) {
      return {
        backgroundColor: interpolateColor(c, [0, 1], [NORMAL_BG, CRITICAL_BG]),
        borderColor: interpolateColor(c, [0, 1], [NORMAL_BORDER, CRITICAL_BORDER]),
        transform: [{ scale: interpolate(c, [0, 1], [1, 1.05]) }],
        shadowColor: interpolateColor(
          c,
          [0, 1],
          ['rgba(0,0,0,1)', 'rgba(220,100,100,1)'],
        ),
        shadowOpacity: 0.35 + c * (0.25 + p * 0.45),
        shadowRadius: 16 + c * (6 + p * 14),
      };
    }
    return {
      backgroundColor: interpolateColor(c, [0, 1], [NORMAL_BG, CRITICAL_BG]),
      borderColor: interpolateColor(c, [0, 1], [NORMAL_BORDER, CRITICAL_BORDER]),
      transform: [{ scale: interpolate(c, [0, 1], [1, 1.05]) }],
    };
  });

  // Breathing "brightness" overlay — a faint white wash that swells at the top
  // of each breath, standing in for web's `filter: brightness(1.1)`. Clipped to
  // the pill radius; pointer-events off so it never eats touches.
  const glowOverlayStyle = useAnimatedStyle(() => ({
    opacity: critical.value * (0.04 + breathe.value * 0.08),
  }));

  // Countdown / duel text colour tweens white → soft red in lockstep with the
  // skin (web colours the text via the same `transition: all`).
  const criticalTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(critical.value, [0, 1], [colors.white, '#fecaca']),
  }));

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${Math.floor(secs).toString().padStart(2, '0')}.${Math.round((secs % 1) * 10)}`;
    }
    return secs.toFixed(1);
  };

  // Duel: one compact line, no score. Mirrors web gameUI.js:1033-1037 — show the
  // round-only label for the "infinite round" sentinel, otherwise round + seconds.
  if (variant === 'duel') {
    return (
      <Animated.View style={[styles.pill, styles.pillDuel, isTablet && { paddingHorizontal: sc(20), paddingVertical: sc(10), borderRadius: sc(16) }, pillAnimStyle]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.glowOverlay, glowOverlayStyle]}
          pointerEvents="none"
        />
        <Animated.Text style={[styles.duelText, { fontSize: sc(fontSizes.md) }, criticalTextStyle]}>
          {isInfiniteRound
            ? t('round', { r: currentRound, mr: totalRounds })
            : t('roundTimer', { r: currentRound, mr: totalRounds, t: timeRemaining.toFixed(1) })}
        </Animated.Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.pill, isTablet && { paddingHorizontal: sc(20), paddingTop: sc(8), paddingBottom: sc(12), borderRadius: sc(16) }, pillAnimStyle]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.glowOverlay, glowOverlayStyle]}
        pointerEvents="none"
      />
      <Text style={[styles.roundLabel, { fontSize: sc(fontSizes.xs) }]}>
        {t('round', { r: currentRound, mr: totalRounds })}
      </Text>
      <Text style={[styles.mainRow, { fontSize: sc(fontSizes.md) }]}>
        {shouldShowCountdown ? (
          <>
            <Animated.Text style={[styles.countdown, criticalTextStyle]}>
              {t('secondsShort', { secs: formatTime(timeRemaining) })}
            </Animated.Text>
            <Text style={styles.separator}> · </Text>
          </>
        ) : null}
        <Text style={[styles.points, scoreAnimating && styles.pointsAnimating]}>
          {displayedScore.toLocaleString()}
        </Text>
        <Text style={styles.pointsLabel}> {t('pts')}</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: NORMAL_BG,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderWidth: 2,
    borderColor: NORMAL_BORDER,
    alignItems: 'center',
    gap: 2,
    // Base shadow; iOS animates these values up while critical (the glow).
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  glowOverlay: {
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  pillDuel: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  duelText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  roundLabel: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
    opacity: 0.75,
    letterSpacing: 0.6,
  },
  mainRow: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
    letterSpacing: 0.3,
  },
  countdown: {
    fontFamily: 'Lexend-SemiBold',
    fontVariant: ['tabular-nums'],
    color: colors.white,
  },
  separator: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  points: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
  },
  pointsAnimating: {
    color: colors.successGlow,
    textShadowColor: 'rgba(34, 197, 94, 0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  pointsLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'Lexend-SemiBold',
  },
});
