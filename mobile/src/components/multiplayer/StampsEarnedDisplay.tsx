/**
 * The stamps receipt on the results screen: what the game just paid, and why.
 *
 * Web twin: the `.stamps-earned` block in components/roundOverScreen.js +
 * styles/duel.css. Same content, same order, same gold, same count-up — this is
 * a clone of that surface, not a second design for it.
 *
 * IT ARRIVES LATE, AND EVERYTHING HERE FOLLOWS FROM THAT. The grants run behind
 * the game save (ws Game.js sendStampEarnings), so the receipt lands on its own
 * `stampsEarned` message a beat after this screen is already painted. Two
 * consequences:
 *
 *   1. The parent reserves this row's height from `stampsPending` on duelEnd and
 *      renders <StampsEarnedDisplay pending /> until the real thing lands.
 *      Without that the row materialises under the player's thumb and shoves the
 *      buttons down as they reach for Play Again.
 *   2. The entrance animation is the POINT, not decoration: something appearing
 *      unannounced needs to read as arriving.
 *
 * NEVER RENDER A ZERO. The server does not send a receipt for nothing, so a
 * `+0` here could only come from this component inventing one. In the single
 * place in the app where a player counts currency, an optimistic number is
 * worse than no number.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { t } from '../../shared/locale';
import { spacing, fontSizes } from '../../styles/theme';
// The SAME module web's roundOverScreen imports (Metro @shared alias -> repo
// root /shared). Reason labels and the repeated-reason merge are shared code on
// purpose: two platforms showing different breakdowns for one game is the drift
// this prevents.
import { STAMP_REASON_KEYS, mergeStampLines, type StampReceiptLine } from '@shared/stamps/receipt';

/** The currency gold. Deliberately a literal and not a theme token: it must
 *  match web's `.stamps-earned__mark` (#ffd700) exactly, and a currency that
 *  drifts in colour between platforms stops reading as one currency. */
const STAMP_GOLD = '#ffd700';

/**
 * Height held open while the receipt is in flight. Must stay in step with what
 * the filled row actually measures — a reservation that does not match its fill
 * trades one layout jump for a smaller one.
 */
const RESERVED_HEIGHT = 58;

/** Shorter than the rating count-up (1000ms): this starts later and must be
 *  finished before the player reaches for Play Again. */
const COUNT_MS = 650;
/** Below this total the digits alone cannot carry the motion. */
const SMALL_TOTAL = 8;

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** The line shape is owned by the shared module, not redeclared here. */
type StampLine = StampReceiptLine;

interface StampsEarnedDisplayProps {
  /** Total actually applied by the ledger. Absent/0 while pending. */
  total?: number;
  lines?: StampLine[];
  /** Reserve the row's height: a receipt is coming but has not landed yet. */
  pending?: boolean;
}

export default function StampsEarnedDisplay({
  total = 0,
  lines,
  pending = false,
}: StampsEarnedDisplayProps) {
  const paid = total > 0;
  const merged: StampLine[] = useMemo(() => mergeStampLines(lines), [lines]);

  // Count up from zero. 33ms (30Hz), not per-frame, and committed only when a
  // digit actually changes — same rule as EloChangeDisplay: every tick is a
  // React commit on the JS thread that also drives this screen's reanimated
  // work, and a total of 8 has eight digit transitions to spend across 650ms.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!paid) {
      setShown(0);
      return;
    }
    const ease = total < SMALL_TOTAL ? easeInOutCubic : easeOutCubic;
    let interval: ReturnType<typeof setInterval> | null = null;
    let last = 0;
    setShown(0);
    const startedAt = Date.now();
    interval = setInterval(() => {
      const progress = Math.min((Date.now() - startedAt) / COUNT_MS, 1);
      const value = progress >= 1 ? total : Math.round(total * ease(progress));
      if (value !== last) {
        last = value;
        setShown(value);
      }
      if (progress >= 1 && interval) {
        clearInterval(interval);
        interval = null;
      }
    }, 33);
    // A fast rematch re-runs this with a new total; a surviving interval would
    // keep writing the previous duel's number over the new one.
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [paid, total]);

  // Entrance. Fires when the receipt LANDS (paid flips), not on mount, because
  // on mount this is still the empty reservation.
  const enter = useSharedValue(0);
  useEffect(() => {
    if (!paid) {
      enter.value = 0;
      return;
    }
    enter.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    return () => {
      cancelAnimation(enter);
    };
  }, [enter, paid]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 6 }],
  }));

  // The reservation: same height, nothing in it. Rendering null instead is what
  // causes the jump this component exists to avoid.
  if (!paid) {
    return pending ? <View style={styles.reserved} /> : null;
  }

  return (
    <Animated.View style={[styles.container, enterStyle]}>
      <View style={styles.headline}>
        {/* Ionicons `disc` IS the web mark: components/shop/StampMark.js draws
            that exact glyph as a path so the currency looks identical on both
            platforms without a new asset on either. */}
        <Ionicons name="disc" size={20} color={STAMP_GOLD} />
        <Text style={styles.value}>+{shown}</Text>
        <Text style={styles.unit}>{t('shopStampsUnit')}</Text>
      </View>

      {merged.length > 0 && (
        <View style={styles.lines}>
          {merged.map((line, index) => (
            <StampBreakdownLine key={line.reason} line={line} index={index} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** One breakdown chip, staggered so the list reads as being itemised. */
function StampBreakdownLine({ line, index }: { line: StampLine; index: number }) {
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(
      260 + index * 80,
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
    );
    return () => {
      cancelAnimation(enter);
    };
  }, [enter, index]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 4 }],
  }));

  const labelKey = STAMP_REASON_KEYS[line.reason];

  return (
    <Animated.View style={[styles.line, style]}>
      {!!labelKey && <Text style={styles.lineLabel}>{t(labelKey)}</Text>}
      <Text style={styles.lineAmount}>+{line.amount}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  reserved: {
    height: RESERVED_HEIGHT,
  },
  container: {
    minHeight: RESERVED_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  value: {
    color: STAMP_GOLD,
    fontSize: fontSizes.xl,
    fontFamily: 'Lexend-Bold',
    // The count-up rewrites this on every digit change; without a fixed digit
    // advance the centred row shuffles sideways. Web sets the same thing.
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Regular',
  },
  lines: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  lineLabel: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Regular',
  },
  lineAmount: {
    color: 'rgba(255, 215, 0, 0.85)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    fontVariant: ['tabular-nums'],
  },
});
