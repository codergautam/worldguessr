import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Pressable } from '../ui/SfxPressable';
import { haptics } from '../../services/haptics';
import { colors, t } from '../../shared';
import { borderRadius, spacing } from '../../styles/theme';
import { MAX_EMOTE_BAR, type EmoteDef } from '../../shared/emotes';
import EmberGlow from './EmberGlow';

/* ===========================================================================
 *  THE EMOTE WHEEL — what comes up in game, and half of the place it is set.
 *
 *  WEB'S SCREEN, VERBATIM (components/shop/EmoteWheel.js), because it is one
 *  feature on two clients. TWO SURFACES, ONE VERB EACH: the wheel takes emotes
 *  OFF, the shelf below it puts them ON. Either half is a single tap on the
 *  thing you are already looking at.
 *
 *  WHAT THIS REPLACED, twice over.
 *
 *    First, two different UIs on two clients: this one had tap-to-select and a
 *    floating ◀ ✕ ▶ toolbar, web had drag-to-reorder with a 6px slop threshold
 *    and tap-to-remove, and both carried an add/remove toggle on every emote
 *    card a shelf away from the bar it edited.
 *
 *    Then, one shared model that was still one too many steps: tap a cell, and
 *    a picker panel opened under the wheel holding a second grid of the emotes
 *    you own — directly above the grid of the emotes you own. Adding meant find
 *    the hole, tap the plus, find the face AGAIN in a different grid, tap it.
 *    That panel is deleted on both clients.
 *
 *  THE ＋ STAYS AND IT IS A SIGN, NOT A BUTTON. Empty cells still draw it,
 *  because "you have four free slots" is worth seeing at a glance. Tapping one
 *  scrolls to the shelf where adding happens (onAddMore); it opens nothing.
 *
 *  NO HOVER ON A PHONE, so the remove verb cannot hide until you point at it the
 *  way web's cross does. It is carried by the hint line under the cells and by
 *  every cell's accessibility label instead — and by the fact that a tap here is
 *  now the only thing a cell does.
 *
 *  FOUR ACROSS, BECAUSE THAT IS WHAT THE GAME DRAWS (the 204px wrap row in
 *  multiplayer/EmoteReactions.tsx). Twelve cells is the three rows you will see
 *  mid-duel, so this is a picture of the popup rather than a diagram of one.
 *
 *  CELLS ARE KEYED BY INDEX, NEVER BY EMOTE ID, and on THIS platform that is a
 *  crash guard as much as a performance one. A removal changes the glyph inside
 *  a run of fixed views; it never reorders, mounts or unmounts one. Reordering a
 *  mounted list under a layout animation is the documented trigger for the
 *  reanimated "child already has a parent" family, which cannot be patched on
 *  this RN line (4.3.2 is the last release for RN 0.81; the fix ships with the
 *  SDK 57 hop).
 * ======================================================================== */

/** The wheel is always drawn full-size; the tail is empty cells. */
const CELLS = MAX_EMOTE_BAR;

/** What an empty cell shows. Fullwidth plus, so it optically matches a glyph. */
const EMPTY_GLYPH = '＋';

const CELL_SIZE = 44;
const CELL_GAP = 8;

/**
 * One cell. Owns its landing animation and nothing else.
 *
 * A COMPONENT PER CELL SO THE ANIMATION CAN LIVE ON A SHARED VALUE. The wheel
 * cannot hold twelve of them without twelve hooks, and a hook per index in the
 * parent is a rules-of-hooks violation the first time the list length changes.
 * Here each cell watches its OWN glyph and pops when it changes, which is
 * exactly the set of cells that moved: one for an add, and everything after the
 * gap for a removal (the list compacts).
 */
function Cell({
  emote,
  index,
  busy,
  canRemove,
  onPress,
}: {
  emote: EmoteDef | null;
  index: number;
  busy: boolean;
  canRemove: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  const id = emote?.id ?? null;

  // Skip the first paint: mounting the shop is not a landing.
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (seen === undefined) { setSeen(id); return; }
    if (seen === id) return;
    setSeen(id);
    scale.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withSpring(1, { damping: 9, stiffness: 220 }),
    );
    ring.value = withSequence(
      withTiming(1, { duration: 140 }),
      withTiming(0, { duration: 220 }),
    );
  }, [id, seen, scale, ring]);

  const cellStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value,
    transform: [{ scale: 1 + ring.value * 0.35 }],
  }));

  // A filled cell removes; an empty one points at the shelf. Both say which in
  // their label, because on a touch screen there is no hover to say it in.
  const label = emote
    ? (canRemove
      ? `${t('shopEmoteSlotLabel', { n: index + 1, name: emote.name }, `Slot ${index + 1}: ${emote.name}`)} — ${t('shopEmoteRemove', undefined, 'Remove')}`
      : t('shopEmoteSlotClearLast', undefined, 'Keep at least one emote on your wheel'))
    : t('shopEmoteSlotAdd', { n: index + 1 }, `Slot ${index + 1} is empty. Add an emote from the list below.`);

  // Busy is an in-flight write; !canRemove is the last-emote rule (an empty
  // order MEANS the stock bar, so removing the final emote would silently undo
  // itself). An EMPTY cell is never disabled by either — it only scrolls.
  const disabled = !!emote && (busy || !canRemove);

  return (
    <Animated.View style={cellStyle}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.cell,
          !emote && styles.cellEmpty,
          !!emote?.fx && styles.cellFx,
          disabled && styles.cellDisabled,
          pressed && styles.cellPressed,
        ]}
      >
        {/* THE ONE EMOTE WITH AN EFFECT burns in its cell too, so a wheel
            carrying it looks like a wheel carrying it. Same component the shelf
            card and the in-game reaction use. */}
        {emote?.fx === 'ember' ? <EmberGlow size={CELL_SIZE} /> : null}
        <Text
          style={[
            styles.cellGlyph,
            !emote && styles.cellGlyphEmpty,
            emote?.fx === 'ember' && styles.cellGlyphEmber,
          ]}
        >
          {emote ? emote.glyph : EMPTY_GLYPH}
        </Text>
        <Animated.View pointerEvents="none" style={[styles.cellRing, ringStyle]} />
      </Pressable>
    </Animated.View>
  );
}

export default function EmoteWheel({
  bar,
  isDefault,
  busy,
  onRemove,
  onReset,
  onAddMore,
}: {
  bar: EmoteDef[];
  isDefault: boolean;
  busy: boolean;
  onRemove: (index: number) => void;
  onReset: () => void;
  onAddMore: () => void;
}) {
  // NO STATE AT ALL, and that is the measure of the rework: this component used
  // to own an `openIndex` because it hosted a picker. Everything it draws is
  // derived from the bar the screen hands down, so an optimistic write repaints
  // the wheel on the same frame as the tap. `landedAt` went with the state — the
  // only thing it did was close a panel that no longer exists.
  const ids = useMemo(() => bar.map((e) => e.id), [bar]);
  const canRemove = ids.length > 1;

  return (
    <View style={styles.wheel}>
      <View style={styles.head}>
        <Text style={styles.title}>
          {t('shopEmoteWheelTitle')}
        </Text>
        {/* Quiet and deliberately not a green button: restoring the stock
            arrangement is a correction. Inert rather than removed once you are
            already on it, so the header never changes height. */}
        <Pressable
          onPress={onReset}
          disabled={busy || isDefault}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.reset,
            (busy || isDefault) && styles.resetDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.resetText}>
            {t('shopEmoteBarReset')}
          </Text>
        </Pressable>
      </View>

      {/* THE IN-GAME POPUP, at its real size. Four across, round buttons, dark
          panel: the same shape multiplayer/EmoteReactions.tsx draws. */}
      <View style={styles.cells}>
        {Array.from({ length: CELLS }, (_, index) => {
          const emote = bar[index] ?? null;
          return (
            <Cell
              // INDEX, NEVER THE EMOTE ID. See the header.
              key={index}
              index={index}
              emote={emote}
              busy={busy}
              canRemove={canRemove}
              onPress={() => {
                haptics.selection();
                if (emote) onRemove(index);
                else onAddMore();
              }}
            />
          );
        })}
      </View>

      {/* Under the cells, never instead of them: this used to print a sentence
          about your emotes exactly where your emotes should have been. It is
          also the only place the remove verb can live on a touch screen. */}
      <Text style={styles.hint}>
        {t('shopEmoteWheelTap', undefined, 'Tap an emote to take it off. Add more from the list below.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.62)',
  },
  reset: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  resetDisabled: {
    opacity: 0.45,
  },
  resetText: {
    fontFamily: 'Lexend-Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.86)',
  },
  // Fixed-width 4-up grid (RN width is border-box), the same arithmetic the
  // in-game bar uses: padding(8*2) + 4 cells(44) + 3 gaps(8) = 216, +2px so a
  // sub-pixel rounding cannot wrap the fourth cell to its own row.
  cells: {
    width: 218,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    // Clips the ember glow to the cell, so a bright disc cannot bleed over its
    // neighbours. The landing ring is drawn at -1 inset and survives it.
    overflow: 'hidden',
  },
  // A HOLE YOU CAN SEE, and that is the point of drawing all twelve: a new
  // account has four of them, so the wheel says "there is room here" without a
  // line of copy.
  cellEmpty: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  // The seat the burning one sits in. The burn itself is EmberGlow + the text
  // shadow below; this is only the ring around it.
  cellFx: {
    borderColor: 'rgba(255, 138, 42, 0.5)',
    backgroundColor: 'rgba(230, 57, 70, 0.16)',
  },
  cellDisabled: {
    opacity: 0.5,
  },
  cellPressed: {
    opacity: 0.7,
  },
  cellGlyph: {
    fontFamily: 'Lexend-Bold',
    fontSize: 21,
    color: colors.white,
  },
  cellGlyphEmpty: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  // textShadow is the ONE glow primitive that works on both platforms without a
  // native blur dependency, and unlike web's animated drop-shadow pair it has to
  // stay static — RN cannot animate a shadow radius off the UI thread. The
  // breathing is EmberGlow's opacity instead, which IS natively animatable.
  cellGlyphEmber: {
    textShadowColor: 'rgba(255, 138, 42, 0.95)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  // The landing pulse. Absolutely positioned so growing it cannot touch layout.
  cellRing: {
    position: 'absolute',
    left: -1,
    right: -1,
    top: -1,
    bottom: -1,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: 'rgba(74, 222, 128, 0.85)',
  },
  pressed: {
    opacity: 0.7,
  },
  hint: {
    marginTop: spacing.xs,
    fontFamily: 'Lexend-Medium',
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
});
