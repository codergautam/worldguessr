/**
 * The stamps receipt on the results screen: what the game just paid, and why.
 *
 * Web twin: the `.stamps-earned` block in components/roundOverScreen.js +
 * styles/duel.css. Both surfaces use the same compact mark + amount hierarchy
 * and the same diagonal mark arrival.
 *
 * IT ARRIVES LATE, AND EVERYTHING HERE FOLLOWS FROM THAT. The grants run behind
 * the game save (ws Game.js sendStampEarnings), so the receipt lands on its own
 * `stampsEarned` message a beat after this screen is already painted. Two
 * consequences:
 *
 *   1. The parent reserves only the compact headline from `stampsPending` and
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
 *
 * THE BREAKDOWN IS A TAP-REVEALED TOOLTIP, matching web's hover/tap treatment
 * (styles/duel.css `.stamps-earned__lines`). A transparent native Modal puts it
 * above the results surface and owns outside-tap dismissal; the measured popup
 * contributes zero layout height. The headline is the receipt; the per-reason
 * lines are conditional detail.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import StampMark from '../shop/StampMark';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { t } from '../../shared/locale';
import { fontSizes, spacing } from '../../styles/theme';
// The SAME module web's roundOverScreen imports (Metro @shared alias -> repo
// root /shared). Reason labels and the repeated-reason merge are shared code on
// purpose: two platforms showing different breakdowns for one game is the drift
// this prevents.
import { STAMP_REASON_KEYS, mergeStampLines, type StampReceiptLine } from '@shared/stamps/receipt';

/** The currency gold, used by the AMOUNT (the mark carries its own colour now).
 *  Deliberately a literal and not a theme token: it must match web's
 *  `.stamps-earned__value` (#ffd700) exactly, and a currency that drifts in
 *  colour between platforms stops reading as one currency. */
const STAMP_GOLD = '#ffd700';

/* Results are denser than wallet and shop surfaces. Match web's hierarchy:
 * the stamp reward is one step below the 30px ELO value, and its artwork is
 * reduced with it instead of importing the shop's canonical 45px mark. */
const RESULT_STAMP_MARK_SIZE = 34;
const RESULT_STAMP_VALUE_SIZE = fontSizes['2xl'];
const RESULT_STAMP_DETAIL_SIZE = 13;
const RESULT_STAMP_ROW_HEIGHT = 48;

/**
 * Only the tappable headline is held open while the receipt is in flight. The
 * conditional breakdown is an overlay and never belongs in this measurement.
 */
const RESERVED_HEIGHT = RESULT_STAMP_ROW_HEIGHT;

/** Shorter than the rating count-up (1000ms): this starts later and must be
 *  finished before the player reaches for Play Again. */
const COUNT_MS = 650;
/** Below this total the digits alone cannot carry the motion. */
const SMALL_TOTAL = 8;

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** The line shape is owned by the shared module, not redeclared here. */
type StampLine = StampReceiptLine;

interface TooltipAnchor {
  left: number;
  top: number;
  width: number;
}

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
  const hasBreakdown = paid && merged.length > 0;
  const reduceMotion = useReducedMotion();

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

  // The amount is readable immediately; only the artwork flies in. This keeps
  // the reward legible while giving the late receipt an authored arrival.
  const markEnter = useSharedValue(0);
  useEffect(() => {
    if (!paid) {
      markEnter.value = 0;
      return;
    }
    if (reduceMotion) {
      markEnter.value = 1;
      return;
    }
    markEnter.value = 0;
    markEnter.value = withTiming(1, {
      duration: 500,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    return () => {
      cancelAnimation(markEnter);
    };
  }, [markEnter, paid, reduceMotion]);

  const markEnterStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + markEnter.value * 0.8,
    transform: [
      { translateX: (1 - markEnter.value) * -42 },
      { translateY: (1 - markEnter.value) * -28 },
      { rotate: `${(1 - markEnter.value) * -18}deg` },
      { scale: 0.72 + markEnter.value * 0.28 },
    ],
  }));

  // The breakdown stays open while it is being read, then closes on the trigger,
  // Android back, the screen-reader escape gesture, or any tap outside it.
  const [open, setOpen] = useState(false);
  const [tooltipAnchor, setTooltipAnchor] = useState<TooltipAnchor | null>(null);
  const anchorRef = useRef<View>(null);
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      reveal.value = open ? 1 : 0;
      return;
    }
    reveal.value = withTiming(open ? 1 : 0, { duration: 160, easing: Easing.out(Easing.cubic) });
    return () => {
      cancelAnimation(reveal);
    };
  }, [open, reduceMotion, reveal]);
  // Opacity and a tiny compositor translation only. The modal tooltip never
  // participates in Yoga's height calculation.
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * -spacing.xs }],
  }));

  const closeBreakdown = useCallback(() => {
    setOpen(false);
    setTooltipAnchor(null);
  }, []);

  const toggleBreakdown = useCallback(() => {
    if (!hasBreakdown) return;
    if (open) {
      closeBreakdown();
      return;
    }

    // The tooltip lives in a Modal so it can own a true screen-wide outside-tap
    // layer. Measure the existing row instead of duplicating layout constants or
    // guessing where the portrait/landscape results header happens to land.
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setTooltipAnchor({
        left: x + spacing.lg,
        top: y + height,
        width: Math.max(width - spacing.lg * 2, 0),
      });
      setOpen(true);
    });
  }, [closeBreakdown, hasBreakdown, open]);

  // A new receipt (rematch), or a receipt with no itemised reasons, starts
  // closed. Never carry the previous game's popup into the next result.
  useEffect(() => {
    closeBreakdown();
  }, [closeBreakdown, hasBreakdown, total]);

  // The reservation: same height, nothing in it. Rendering null instead is what
  // causes the jump this component exists to avoid.
  if (!paid) {
    return pending ? <View style={styles.reserved} /> : null;
  }

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.container}>
        {/* Pressable only when there is something to reveal — a control that does
            nothing still eats the tap and still reports itself to a screen
            reader. Hit slop rather than padding, so widening the target cannot
            grow the row it sits in. */}
        <Pressable
          onPress={hasBreakdown ? toggleBreakdown : undefined}
          disabled={!hasBreakdown}
          hitSlop={hasBreakdown ? 10 : undefined}
          accessibilityRole={hasBreakdown ? 'button' : undefined}
          accessibilityState={hasBreakdown ? { expanded: open } : undefined}
          accessibilityLabel={`${t('shopStampsUnit')}: +${total}`}
          style={styles.headline}
        >
          {/* The same artwork and compact result scale as the web receipt. */}
          <Animated.View style={[styles.mark, markEnterStyle]}>
            <StampMark style={styles.markImage} />
          </Animated.View>
          <Text style={styles.value}>+{shown}</Text>
        </Pressable>
      </View>

      {hasBreakdown && tooltipAnchor && (
        <Modal
          visible={open}
          transparent
          animationType="none"
          statusBarTranslucent
          supportedOrientations={['portrait', 'landscape']}
          onRequestClose={closeBreakdown}
        >
          <Pressable
            style={styles.tooltipDismissLayer}
            onPress={closeBreakdown}
            accessible={false}
          >
            <Animated.View
              accessibilityViewIsModal
              onAccessibilityEscape={closeBreakdown}
              style={[
                styles.lines,
                {
                  left: tooltipAnchor.left,
                  top: tooltipAnchor.top,
                  width: tooltipAnchor.width,
                },
                revealStyle,
              ]}
            >
              <Pressable
                style={styles.linesContent}
                onPress={(event) => event.stopPropagation()}
                accessible={false}
              >
                {merged.map((line) => (
                  <StampBreakdownLine key={line.reason} line={line} />
                ))}
              </Pressable>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

/**
 * One breakdown chip.
 *
 * PLAIN VIEWS, NOT Animated ones. The per-chip entrance stagger this used to run
 * belonged to the reveal it no longer has — the group fades in on a tap now, and
 * a stagger on top of that reads as the UI being slow rather than as a list
 * being itemised. One shared opacity on the parent replaces N Reanimated nodes.
 */
function StampBreakdownLine({ line }: { line: StampLine }) {
  const labelKey = STAMP_REASON_KEYS[line.reason];
  return (
    <View style={styles.line}>
      {!!labelKey && <Text style={styles.lineLabel}>{t(labelKey)}</Text>}
      <Text style={styles.lineAmount}>+{line.amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reserved: {
    height: RESERVED_HEIGHT,
  },
  container: {
    height: RESERVED_HEIGHT,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  headline: {
    minHeight: RESULT_STAMP_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  mark: {
    width: RESULT_STAMP_MARK_SIZE,
    height: RESULT_STAMP_MARK_SIZE,
  },
  markImage: {
    width: RESULT_STAMP_MARK_SIZE,
    height: RESULT_STAMP_MARK_SIZE,
  },
  value: {
    color: STAMP_GOLD,
    fontSize: RESULT_STAMP_VALUE_SIZE,
    fontFamily: 'Lexend-Bold',
    // The count-up rewrites this on every digit change; without a fixed digit
    // advance the centred row shuffles sideways. Web sets the same thing.
    fontVariant: ['tabular-nums'],
  },
  lines: {
    position: 'absolute',
    zIndex: 30,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 8, 8, 0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  linesContent: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  tooltipDismissLayer: {
    flex: 1,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  // Breakdown copy stays distinctly below the headline; it is detail revealed
  // on demand, not a second result metric.
  lineLabel: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: RESULT_STAMP_DETAIL_SIZE,
    fontFamily: 'Lexend-Regular',
  },
  lineAmount: {
    flexShrink: 0,
    color: 'rgba(255, 215, 0, 0.85)',
    fontSize: RESULT_STAMP_DETAIL_SIZE,
    fontFamily: 'Lexend-SemiBold',
    fontVariant: ['tabular-nums'],
  },
});
