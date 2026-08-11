import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { Pressable } from '../ui/SfxPressable';
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
  /**
   * Host stall-relief (web gameUI.js timer__force-end parity): with the round
   * timer disabled, idle players hold the round open forever — this renders an
   * "End Round" button under the pill while the round is open-ended (the same
   * infinite-round condition that hides the countdown). Pass it only when the
   * viewer is the private-game host and state is 'guess'.
   */
  onForceEndRound?: () => void;
  /**
   * Placement seeding match (duel variant only): a persistent one-word tag
   * above the round label, so the player never loses track of what this game
   * is after the GetReady intro. Web parity: gameUI.js timer__placement-tag.
   */
  isPlacement?: boolean;
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

// ── Display rule (user ruling Aug 6, web parity) ────────────────────────────
// Whole seconds at 10 and above, tenths below:
//   ... 12, 11, 10, 9.9, 9.8 ... 0.1, 0.0
// Rounded UP, so the clock reads as a countdown: "1" means up to a second is
// left, and 0.0 appears only once the time is genuinely gone.
//
// `displayValue` quantizes to WHAT IS ON SCREEN, not to raw tenths. That is
// what keeps the cost down: above 10s the value only changes once a second, so
// this component re-renders once a second even though the clock looks ten times
// a second. Ticking at a flat 100ms (rather than sleeping to each boundary) is
// deliberate — see the note in components/roundTimer.js.
// "10" is the first value of the decimal phase, so it is on screen for 100ms
// like every decimal value (remaining 9.9-10.0s); the integers above it each
// get a full second. That is only safe because of TICK_MS below — see the note
// there and in components/roundTimer.js. Driven by a 100ms interval instead,
// "10" fails to appear at all in roughly 1 round in 4.
function displayValue(msLeft: number): number {
  const tenths = Math.max(0, Math.ceil(msLeft / 100) / 10);
  return tenths >= 10 ? Math.ceil(tenths) : tenths;
}

function formatCountdown(value: number): string {
  return value >= 10 ? String(Math.ceil(value)) : value.toFixed(1);
}

// Sampled at 30Hz, not at the 100ms rate the tenths actually change at. A timer
// polled at exactly its own change rate drifts past boundaries and silently
// drops values: MEASURED, a flat 100ms poll paints only ~69 of ~100 tenths
// under light JS-thread load, 30Hz paints ~90. Web uses rAF for the same reason
// (components/roundTimer.js); 30Hz is the RN equivalent already used elsewhere
// in this app (AnimatedCounter, roundOverScreen tickers). State still only
// changes when the DISPLAYED value changes, so this does not cost re-renders.
const TICK_MS = 33;

const IS_IOS = Platform.OS === 'ios';
const NORMAL_BG = Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent;
const NORMAL_BORDER = colors.primary;
// Web critical gradient is rgba(220,100,100)→rgba(200,80,80); a single mid red
// reads the same on a small pill.
const CRITICAL_BG = 'rgba(212, 92, 92, 0.92)';
const CRITICAL_BORDER = 'rgba(255, 200, 200, 0.55)';

function GameTimer({
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
  onForceEndRound,
  isPlacement,
}: GameTimerProps) {
  // Seed from serverEndTime when server-driven so the very first render already
  // has a number. On duel reconnect the partial `game` snapshot carries
  // nextEvtTime (serverEndTime) but NOT timePerRound, so `initialTime` arrives
  // undefined — the update effect below only runs post-render, so without this
  // the duel variant would `undefined.toFixed(1)` and crash the whole tree.
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    if (serverEndTime !== undefined && serverEndTime > 0) {
      return displayValue(serverEndTime - Date.now() - timeOffset);
    }
    return initialTime ?? 0;
  });
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
      setTimeRemaining(initialTime ?? 0);
    }
  }, [initialTime, roundKey, isServerDriven]);

  // Live inputs read through refs, not deps (ported from web gameUI.js). Without
  // this, `onTimeUp` changes identity every time the pin moves (its useCallback
  // in app/game/[id].tsx depends on guessPosition), which tore down and rebuilt
  // the clock — and reset its phase — mid-round on every map tap.
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;
  const timeOffsetRef = useRef(timeOffset);
  timeOffsetRef.current = timeOffset;

  // Server-driven timer: calculate remaining from serverEndTime
  useEffect(() => {
    if (!isServerDriven || !showTimer) return;

    const update = () => {
      const next = displayValue(serverEndTime - Date.now() - timeOffsetRef.current);
      // Bail out when the DISPLAYED value hasn't moved. Above 10s that means
      // one re-render per second out of ten ticks.
      setTimeRemaining((prev) => (prev === next ? prev : next));
      if (next <= 0) onTimeUpRef.current();
    };

    update();
    const interval = setInterval(update, TICK_MS);
    return () => clearInterval(interval);
  }, [isServerDriven, serverEndTime, showTimer]);

  // Local countdown timer — only when NOT server-driven
  useEffect(() => {
    if (isServerDriven) return;
    if (!showTimer || isPaused || timeRemaining <= 0) return;

    // Deadline-based, not `prev - 0.1`. The old decrementing clock accumulated
    // every millisecond the JS thread was busy, so local rounds ran long. The
    // deadline is re-anchored whenever this effect arms, which is exactly when
    // a round starts or a pause ends.
    const deadline = Date.now() + timeRemaining * 1000;
    let interval: ReturnType<typeof setInterval> | null = null;

    const update = () => {
      const next = displayValue(deadline - Date.now());
      setTimeRemaining((prev) => (prev === next ? prev : next));
      if (next <= 0) {
        if (interval) clearInterval(interval);
        // Defer onTimeUp to avoid setState during render
        setTimeout(() => onTimeUpRef.current(), 0);
      }
    };

    interval = setInterval(update, TICK_MS);
    return () => { if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServerDriven, showTimer, isPaused, timeRemaining <= 0, roundKey]);

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

  // Hoisted out of the render body: these were fresh object literals on every
  // tick, so each countdown update re-diffed and re-uploaded the whole pill's
  // props even though nothing about the layout had changed.
  const duelTabletStyle = useMemo(
    () => (isTablet ? { paddingHorizontal: sc(20), paddingVertical: sc(10), borderRadius: sc(16) } : null),
    [isTablet, sc],
  );
  const defaultTabletStyle = useMemo(
    () => (isTablet ? { paddingHorizontal: sc(20), paddingTop: sc(8), paddingBottom: sc(12), borderRadius: sc(16) } : null),
    [isTablet, sc],
  );
  const duelRoundLabelStyle = useMemo(() => ({ fontSize: sc(fontSizes.xs) }), [sc]);
  const duelPlacementTagStyle = useMemo(() => ({ fontSize: sc(9) }), [sc]);
  const duelCountdownStyle = useMemo(
    () => ({ fontSize: sc(fontSizes['3xl']), minWidth: sc(64) }),
    [sc],
  );
  const roundLabelStyle = useMemo(() => ({ fontSize: sc(fontSizes.xs) }), [sc]);
  const mainRowStyle = useMemo(() => ({ fontSize: sc(fontSizes.md) }), [sc]);
  const forceEndTextStyle = useMemo(() => ({ fontSize: sc(fontSizes.xs) }), [sc]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    // Above a minute there is no decimal to show — the tenths only appear in
    // the last 10 seconds now, which is always inside the mins === 0 branch.
    if (mins > 0) {
      return `${mins}:${Math.floor(secs).toString().padStart(2, '0')}`;
    }
    return formatCountdown(seconds);
  };

  // Duel: one compact line, no score. Mirrors web gameUI.js:1033-1037 — show the
  // round-only label for the "infinite round" sentinel, otherwise round + seconds.
  if (variant === 'duel') {
    return (
      <Animated.View style={[styles.pill, styles.pillDuel, duelTabletStyle, pillAnimStyle]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.glowOverlay, glowOverlayStyle]}
          pointerEvents="none"
        />
        {/* Placement seeding match: persistent tag above the round footnote —
            the clock stays the hero. */}
        {isPlacement && (
          <Text style={[styles.duelPlacementTag, duelPlacementTagStyle]}>
            {t('placementMatch').toUpperCase()}
          </Text>
        )}
        <Text style={[styles.duelRoundLabel, duelRoundLabelStyle]}>
          {t('round', { r: currentRound, mr: totalRounds })}
        </Text>
        {!isInfiniteRound && (
          <Animated.Text style={[styles.duelCountdown, duelCountdownStyle, criticalTextStyle]}>
            {t('secondsShort', { secs: formatCountdown(timeRemaining) })}
          </Animated.Text>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.pill, defaultTabletStyle, pillAnimStyle]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.glowOverlay, glowOverlayStyle]}
        pointerEvents="none"
      />
      <Text style={[styles.roundLabel, roundLabelStyle]}>
        {t('round', { r: currentRound, mr: totalRounds })}
      </Text>
      <Text style={[styles.mainRow, mainRowStyle]}>
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
      {isInfiniteRound && onForceEndRound && (
        <Pressable
          onPress={onForceEndRound}
          style={({ pressed }) => [styles.forceEndBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.forceEndText, forceEndTextStyle]}>{t('endRound')}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// The ticking state lives inside this component, so its props are already
// stable during a round — memo just stops the host screen's own re-renders
// (every websocket message) from rebuilding the pill for nothing.
export default memo(GameTimer);

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
  // Duel pill: two lines, matching web's .timer.duel .timer--two-line. It used
  // to be one sentence ("Round #1 / 5 - 47 seconds") at fontSizes.md, which was
  // ~200px wide — the exact number the DUEL_TIMER middle-gap gate in
  // app/game/[id].tsx was sized around. Two lines put the clock front and
  // centre and roughly halve the width. The bars carry the state in a duel, so
  // the round line is deliberately pushed further back than the shared
  // roundLabel style.
  duelRoundLabel: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
    opacity: 0.55,
    letterSpacing: 0.6,
  },
  // Placement tag above the round footnote — one step smaller and dimmer
  // than duelRoundLabel (web parity: .timer__placement-tag).
  duelPlacementTag: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
    fontSize: 9,
    opacity: 0.5,
    letterSpacing: 1.1,
  },
  duelCountdown: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes['3xl'],
    // tabular-nums + a minWidth floor: the pill is centred in the bar gap, so
    // a width change from 100s -> 47s -> 9.9s would shift both edges at once.
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    letterSpacing: 0.3,
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
  // Host "End Round" stall-relief button (web .timer__force-end).
  forceEndBtn: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  forceEndText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
  },
});
