import { memo, useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { resolveGlowColor } from '../shared/cosmetics';
import {
  getGlowAnim,
  GLOW_CLIP_RELIEF,
  type GlowLayer,
} from '../shared/glowKeyframes';

/* ===========================================================================
 *  NameGlowHalo — EVERY name glow on this platform, static tier and animated
 *  tier alike, drawn OUT OF FLOW.
 *
 *  THE ONE RULE, AND WHY THE FILE EXISTS IN THIS SHAPE. A glow is paint. It may
 *  not change the name's box — not its width, not where it ellipsises, not its
 *  measured height — because a cosmetic that moves the layout is a cosmetic that
 *  makes a player's own name look wrong the moment they equip it ("my name got a
 *  bit narrower"). The only way to guarantee that is to keep the shadow off the
 *  <Text> that owns the layout, which is what this component is: absolutely
 *  positioned copies of the name, stacked UNDERNEATH the real one, contributing
 *  nothing to the parent's size.
 *
 *  It used to be true for the animated tier only. The static tier put
 *  `textShadowRadius` straight onto the layout <Text>, so one sku changed the
 *  box, another added a wrapper <View> and no glow at all did neither — three
 *  layouts for one name. Now every tier renders the identical tree and the only
 *  difference between them is what this component draws.
 *
 *  Animated glows stack fixed shadow Text nodes inside expanded Animated.View
 *  wrappers. One shared UI-thread clock cross-fades wrapper opacity; shadow and
 *  layout properties remain fixed.
 *
 *  THE STACK IS SIZED BY THE REAL NAME, WHICH IS NOT IN THIS FILE. The caller
 *  wraps its <Text> in a relative View and drops this component in beside it;
 *  everything here is absolutely positioned, so it contributes nothing to layout
 *  and inherits the exact box the name resolved to. `textStyle` and
 *  `numberOfLines` must be the SAME values the name uses — a layer that lays out
 *  a pixel differently is a visible ghost behind the glyphs.
 *
 *  EVERY HALO LAYER OWNS A LARGER NATIVE PAINT BOX. `overflow: visible` alone
 *  was not sufficient: it disables React Native's explicit padding-box clip,
 *  but Android/iOS still rasterize a native Text node into a canvas allocated at
 *  that node's rectangular bounds. These decorative nodes therefore extend
 *  GLOW_CLIP_RELIEF beyond the real name on all four sides and take the same
 *  amount back as padding. Their CONTENT box remains byte-for-byte identical to
 *  the real Text—same width, baseline and ellipsis—while their native canvas is
 *  finally large enough to contain the shadow and the animated layers' travel.
 *  The expanded node remains absolute, so it contributes nothing to layout.
 *
 *  Ancestors that intentionally clip still need GLOW_CLIP_RELIEF at that clip
 *  boundary (PlayerList is the canonical example).
 *
 *  THE LAYERS DRAW OPAQUE TEXT, NOT TRANSPARENT TEXT. It is tempting to set
 *  their `color` to transparent so only the shadows draw. That does not work: a
 *  text shadow is generated FROM glyph coverage, so a fully transparent glyph
 *  casts no shadow on either platform. The layers therefore draw the name in the
 *  name's own colour and the real <Text> on top covers them exactly — same font,
 *  same string, same box — so the only thing that escapes is the halo.
 *
 *  pointerEvents="none" on the stack: it is decoration under a name that is
 *  often inside a pressable row, and it must never swallow the touch.
 *
 *  REDUCED MOTION IS A FALLBACK, NOT A REMOVAL. With the OS setting on, an
 *  animated sku falls back to the static halo below rather than to nothing — the
 *  same treatment `prefers-reduced-motion` gets in styles/nameGlow.css. A user
 *  who asked for less motion did not ask to lose the item they bought. Same for
 *  `motion="static"`, which the maps tile wall and in-game chat use for their
 *  paint budget. Shop previews use `motion="always"` because demonstrating the
 *  animated product is the purpose of that surface.
 * ======================================================================== */

export type GlowMotion = 'system' | 'always' | 'static';

interface NameGlowHaloProps {
  /** The name. Must be byte-identical to the <Text> this sits under. */
  name: string;
  /** Equipped sku. Unknown/non-glow skus render nothing. */
  sku: string | null | undefined;
  /** Light surface (white card / map tooltip) selects the light colours. */
  onLight?: boolean;
  /** Motion policy: system preference, forced preview, or static paint budget. */
  motion?: GlowMotion;
  /**
   * Static-halo blur radius in px, on the DARK surface. The default suits
   * in-game name sizes (13-18px). Raise it ONLY where the name is set at display
   * size — the shop's preview stages — because a halo tuned for 14px text is an
   * invisible rim around 24px text, which is how ten colours end up looking like
   * one smudge.
   *
   * `onLight` scales this down by LIGHT_STATIC_SCALE; a caller passes the dark
   * number and gets the right light one for free.
   */
  radius?: number;
  /**
   * The exact style the real name <Text> uses. Font family, size, weight and
   * letter spacing all have to match or the layers ghost out from behind the
   * glyphs.
   */
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

const NO_OFFSET = { width: 0, height: 0 } as const;

/**
 * What the static halo's radius is multiplied by on a LIGHT surface.
 *
 * A React Native <Text> takes exactly ONE shadow — one colour at full alpha,
 * one radius — where web layers four with a falloff, so the radius is the only
 * knob this tier has and it has to carry the whole surface difference on its
 * own. The dark side is a big sheet of glass a halo can bloom into; the light
 * side is a small white card with dark text on it, and at the same radius the
 * identical halo stops reading as a halo and starts reading as the name
 * leaking. Web pulled its light stack's reach in from 18px to 13px for exactly
 * this ("the glows are too strong on white, like on pins") and then from 13px
 * to 9px when that was still too strong on a guess-pin tooltip; 0.45 is those
 * two corrections expressed through the one number available here, and it lands
 * the default at ~3.6px against the dark tier's 8.
 *
 * DO NOT "RESTORE" THIS BY EYE ON A DARK SCREENSHOT. 3.6px looks like almost
 * nothing next to the dark tier's 8px, and that comparison is the trap rule 5b
 * exists to stop: the number is right when it is right on a white card, where
 * the halo is DARKER than what it sits on and needs a fraction of the reach to
 * be seen at all.
 *
 * It multiplies whatever the caller asked for rather than replacing it, so a
 * surface that raises `radius` because its text is set larger keeps that
 * intent — the two are independent facts about the same halo.
 */
const LIGHT_STATIC_SCALE = 0.45;

/**
 * One fixed shadow, fading in and out of the lap.
 *
 * The whole schedule is this arithmetic. `d` is the WRAPPED distance from the
 * clock to this layer's moment — `+1.5` then `-0.5` is the standard "shortest
 * way round a circle of circumference 1", and it is what stops the layer at
 * phase 0 from going dark just before the loop turns over. The ramp is linear
 * and symmetric, so `window` is the full visible span and the layer touches
 * `peak` for exactly one instant in the middle of it.
 */
const GlowLayerText = memo(function GlowLayerText({
  layer, name, textStyle, numberOfLines, phase,
}: {
  layer: GlowLayer;
  name: string;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  phase: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (layer.always) return { opacity: layer.peak };
    const d = Math.abs(((phase.value - layer.at + 1.5) % 1) - 0.5);
    const half = layer.window / 2;
    const lit = half > 0 ? Math.max(0, 1 - d / half) : 0;
    return { opacity: lit * layer.peak };
  });

  return (
    <Animated.View
      style={[styles.animatedLayerRoom, animatedStyle]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      collapsable={false}
    >
      <Text
        style={[
          textStyle,
          styles.animatedLayerText,
          {
            textShadowColor: layer.color,
            textShadowOffset: { width: layer.dx, height: layer.dy },
            textShadowRadius: layer.radius,
          },
        ]}
        numberOfLines={numberOfLines}
        // Decoration under a real name: never announce it a second time.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {name}
      </Text>
    </Animated.View>
  );
});

function NameGlowHalo({
  name, sku, onLight = false, motion = 'system', radius = 8, textStyle, numberOfLines,
}: NameGlowHaloProps) {
  const color = resolveGlowColor(sku, onLight);
  const anim = motion === 'static' ? null : getGlowAnim(sku, onLight);
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  const running = !!anim && (motion === 'always' || !reduceMotion);

  useEffect(() => {
    if (!anim || !running) return undefined;
    // Seed from 0 so a name that mounts mid-round starts its lap where the table
    // says it should, then run forever, linearly, without reversing.
    // ReduceMotion.Never because THIS component owns that decision (above) —
    // left on the default the modifier would snap the clock to 1 and leave a
    // single frozen frame instead of the static halo the fallback draws.
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: anim.durationMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );
    // Stop the clock on unmount. A duel ends by tearing this whole tree down and
    // a shared value still being driven is a UI-thread callback with nothing to
    // paint.
    return () => cancelAnimation(phase);
  }, [anim, running, phase]);

  if (!color) return null;

  return (
    <View style={styles.haloRoot} pointerEvents="none">
      {running && anim ? (
        anim.layers.map((layer, i) => (
          <GlowLayerText
            key={i}
            layer={layer}
            name={name}
            textStyle={textStyle}
            numberOfLines={numberOfLines}
            phase={phase}
          />
        ))
      ) : (
        // Static fallback stays a plain Text so static-policy rows do not create
        // Reanimated nodes just to hold a constant value.
        <Text
          style={[
            textStyle,
            styles.haloPaintRoom,
            {
              textShadowColor: color,
              textShadowOffset: NO_OFFSET,
              textShadowRadius: onLight ? radius * LIGHT_STATIC_SCALE : radius,
            },
          ]}
          numberOfLines={numberOfLines}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  haloRoot: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  // The expanded wrapper contains the shadow before its opacity is composited.
  animatedLayerRoom: {
    ...StyleSheet.absoluteFillObject,
    top: -GLOW_CLIP_RELIEF,
    right: -GLOW_CLIP_RELIEF,
    bottom: -GLOW_CLIP_RELIEF,
    left: -GLOW_CLIP_RELIEF,
    overflow: 'visible',
  },
  // The wrapper already owns the expanded bounds. Padding returns this Text's
  // content box to the real name's exact width, height and baseline.
  animatedLayerText: {
    ...StyleSheet.absoluteFillObject,
    padding: GLOW_CLIP_RELIEF,
    overflow: 'visible',
  },
  // A native Text can only rasterize inside its own allocated canvas—even when
  // overflow is visible. Grow that canvas by 34px on every side, then consume
  // the growth as padding: content width, baseline, ellipsis and PlayerName's
  // measured box remain identical while the shadow gets real pixels to paint.
  haloPaintRoom: {
    ...StyleSheet.absoluteFillObject,
    top: -GLOW_CLIP_RELIEF,
    right: -GLOW_CLIP_RELIEF,
    bottom: -GLOW_CLIP_RELIEF,
    left: -GLOW_CLIP_RELIEF,
    padding: GLOW_CLIP_RELIEF,
    overflow: 'visible',
  },
});

export default memo(NameGlowHalo);
