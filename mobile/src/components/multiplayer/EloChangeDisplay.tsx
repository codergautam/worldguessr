/**
 * Animated rating display for ranked duel results.
 *
 * Mirrors the web duel header (components/roundOverScreen.js `elo-container`):
 * an "ELO:" label, the NEW rating counting up/down from the old value, and the
 * delta in green/red. No old→new arrow, no parentheses, and no duplicate
 * Victory/Defeat label — that title already sits above this in the header.
 *
 * RATING V2. This component used to style itself off `elo < 2000`, which was
 * the v1 "quadruple the winner's gain" ramp. That zone NO LONGER EXISTS: v2
 * computes ONE integer transfer and hands it to both players with opposite
 * signs, so a win of +N always pairs with a loss of -N. Under the new scale the
 * whole ladder lives roughly in 100..1800 and even the top player is ~1600 —
 * every single player would have fallen inside the old `< 2000` branch, making
 * the "you're in the boost zone" styling a permanent lie. It is gone. Nothing
 * here may key off an absolute rating threshold again.
 *
 * Flourish is now keyed to the LEAGUE, and the league is taken from the SERVER
 * whenever the server told us one (see resolveLeague) so a seasonal re-anchor
 * of the cutoffs needs no store release.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../shared';
import { t } from '../../shared/locale';
import { getActiveLeagues, resolveLeague, type ServerLeague } from '../../shared/user/leagues';
import { spacing, fontSizes } from '../../styles/theme';

interface EloChangeDisplayProps {
  oldElo: number;
  newElo: number;
  winner: boolean;
  draw: boolean;
  /**
   * The league as the SERVER computed it for `newElo`. Preferred over the local
   * cutoff table whenever present — pass `user.league` straight through.
   */
  serverLeague?: ServerLeague;
  /**
   * Placement match: this result SEEDED the rating rather than transferring it.
   * Renders the "Placement match" label and reframes the jump from the entry
   * rating to the seed as an placement outcome, not a +N win bonus.
   */
  placement?: boolean;
}

/** Ease-out cubic — the classic count-up curve, front-loaded. */
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
/** Ease-in-out cubic — puts a single digit change at the MIDPOINT. See below. */
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/**
 * How much sparkle a win earns: the league's position in the ladder, 1-based.
 * Derived from the ACTIVE table's ordering rather than hardcoded thresholds, so
 * adding or re-anchoring a tier can never leave this branch behind.
 */
function getParticleCount(league: { name: string }): number {
  const names = Object.values(getActiveLeagues()).map((l) => l.name);
  const idx = names.indexOf(league.name);
  // Unknown (server-only) tier => treat as mid-ladder rather than zero sparkle.
  return idx < 0 ? 2 : Math.min(4, idx + 1);
}

export default function EloChangeDisplay({
  oldElo,
  newElo,
  winner,
  draw,
  serverLeague,
  placement = false,
}: EloChangeDisplayProps) {
  const delta = newElo - oldElo;
  const league = useMemo(() => resolveLeague(newElo, serverLeague), [newElo, serverLeague]);
  // Placement seeds are not a "win", so they get no victory sparkle — the
  // rating jump is the reveal. Otherwise sparkle only on an actual gain.
  const particleCount = !placement && delta > 0 ? getParticleCount(league) : 0;
  const starColor = league.light ?? league.color;

  // Count the rating up/down from old → new (web parity: components/roundOverScreen.js).
  //
  // FIXED DURATION, NOT FIXED STEP SIZE — the same correction the web counter
  // needed. The previous version derived its cadence from |Δ| (`stepMs =
  // DURATION / steps`), which was fine when a duel moved 60-600 points but is
  // wrong on the v2 scale: a Δ of 1 collapsed to a SINGLE 1200ms tick, i.e. the
  // number sat still for one and a half seconds and then teleported. Now the
  // count always takes COUNT_MS regardless of the swing, and the curve does the
  // work the digits cannot.
  //
  // WHY TWO CURVES: easeOutCubic front-loads, so with Δ=1 the only digit change
  // lands at ~20% and the rest is dead air. Below SMALL_DELTA we use
  // easeInOutCubic, which puts that change at the midpoint of the pop-in
  // flourish below. Large swings (a placement seed jumps ~300 at once) keep the
  // classic front-loaded count-up.
  const [animatedElo, setAnimatedElo] = useState(oldElo);
  useEffect(() => {
    if (oldElo === newElo) {
      setAnimatedElo(newElo);
      return;
    }
    const COUNT_MS = 1000;
    const START_DELAY = 350; // let the "Victory/Defeat" title land first
    const SMALL_DELTA = 8;
    const ease = Math.abs(delta) < SMALL_DELTA ? easeInOutCubic : easeOutCubic;

    let interval: ReturnType<typeof setInterval> | null = null;
    let last = oldElo;
    setAnimatedElo(oldElo);

    const startTimer = setTimeout(() => {
      const startedAt = Date.now();
      // 33ms (30Hz), not per-frame: nobody can read digits changing faster, and
      // every tick is a React commit on the JS thread that also drives the
      // results screen's reanimated work.
      interval = setInterval(() => {
        const progress = Math.min((Date.now() - startedAt) / COUNT_MS, 1);
        const value = progress >= 1 ? newElo : Math.round(oldElo + delta * ease(progress));
        // Only commit when a digit actually changes. On the v2 scale a ±3 swing
        // is 3 commits across the whole second instead of 30.
        if (value !== last) {
          last = value;
          setAnimatedElo(value);
        }
        if (progress >= 1 && interval) {
          clearInterval(interval);
          interval = null;
        }
      }, 33);
    }, START_DELAY);

    // Both timers cancelled: a fast rematch remounts/re-runs this with new
    // values, and a surviving interval would keep writing the previous duel's
    // rating over the new one.
    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [oldElo, newElo, delta]);

  // Subtle pop-in on the value row.
  const slide = useSharedValue(0);
  const scale = useSharedValue(0.6);
  useEffect(() => {
    slide.value = withDelay(150, withTiming(1, { duration: 350 }));
    scale.value = withDelay(
      150,
      withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.6)) }),
    );
    return () => {
      cancelAnimation(slide);
      cancelAnimation(scale);
    };
  }, [scale, slide]);

  const displayStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ scale: scale.value }],
  }));

  // Colour purely by SIGN — the transfer is symmetric, so there is no third
  // case to style and no magnitude threshold worth reacting to.
  const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.error : colors.textSecondary;
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <View style={styles.container}>
      {Array.from({ length: particleCount }).map((_, index) => (
        <StarParticle
          key={index}
          index={index}
          count={particleCount}
          color={starColor}
        />
      ))}
      {placement && (
        <Text style={styles.placementLabel}>
          {t('placementMatch')}
        </Text>
      )}
      <Text style={styles.label}>{t('elo')}:</Text>
      <Animated.View style={[styles.row, displayStyle]}>
        <Text style={styles.value}>{animatedElo}</Text>
        {/* A placement SEEDS the rating rather than transferring it, so the
            jump from the entry rating is not a "+N you earned" — showing one
            would read as a gigantic win bonus. Show the tier instead. */}
        {placement ? (
          <Text style={[styles.delta, { color: starColor }]}>{league.name}</Text>
        ) : (
          <Text style={[styles.delta, { color: deltaColor }]}>{deltaText}</Text>
        )}
      </Animated.View>
    </View>
  );
}

function StarParticle({
  index,
  count,
  color,
}: {
  index: number;
  count: number;
  color: string;
}) {
  const progress = useSharedValue(0);
  const angle = count === 1 ? 0 : -35 + (70 / Math.max(1, count - 1)) * index;
  const distance = 34 + index * 5;

  useEffect(() => {
    progress.value = withDelay(
      650 + index * 90,
      withSequence(
        withTiming(1, {
          duration: 520,
          easing: Easing.out(Easing.back(1.8)),
        }),
        withTiming(0, {
          duration: 520,
          easing: Easing.in(Easing.cubic),
        }),
      ),
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [index, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const radians = (angle * Math.PI) / 180;
    return {
      opacity: progress.value,
      transform: [
        { translateX: Math.sin(radians) * distance * progress.value },
        { translateY: -Math.cos(radians) * distance * progress.value },
        { scale: progress.value },
        { rotate: `${progress.value * (180 + index * 45)}deg` },
      ],
    };
  });

  return (
    <Animated.Text style={[styles.starParticle, { color, textShadowColor: color }, animatedStyle]}>
      ★
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  placementLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  value: {
    color: colors.white,
    fontSize: fontSizes['3xl'],
    fontFamily: 'Lexend-Bold',
    // The count-up rewrites this every time a digit changes; without a fixed
    // digit advance the row (which is centred, with the ±N chip beside it)
    // shuffles sideways on each change. Web sets the same thing on .elo-value.
    fontVariant: ['tabular-nums'],
  },
  delta: {
    fontSize: fontSizes.xl,
    fontFamily: 'Lexend-SemiBold',
    fontVariant: ['tabular-nums'],
  },
  starParticle: {
    position: 'absolute',
    top: 10,
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
