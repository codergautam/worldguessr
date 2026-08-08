import { type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import CountryFlag from './CountryFlag';
import { resolveGlowColor } from '../shared/cosmetics';
import NameGlowHalo from './NameGlowHalo';

interface PlayerNameProps {
  /** The name/label text, shown first. */
  name: string;
  /** ISO-2 country code. When set, the flag is rendered AFTER the name. */
  countryCode?: string | null;
  /** Flag height in px (width auto-derives as size * 1.5). */
  flagSize?: number;
  /** Style applied to the name <Text>. */
  textStyle?: StyleProp<TextStyle>;
  /** Style applied to the flag <Image>. */
  flagStyle?: StyleProp<ImageStyle>;
  /** Style merged onto the row container (gap/justify/wrap overrides etc.). */
  style?: StyleProp<ViewStyle>;
  /** Horizontal gap between name, flag and any trailing children. */
  gap?: number;
  /** Lines before truncating the name. 0 = unlimited. Defaults to 1. */
  numberOfLines?: number;
  /**
   * Equipped name-glow SKU off the roster (`MPPlayer.nameGlow`) or the account
   * (`user.cosmetics.equipped.nameGlow`). Pass the sku, not a colour — this
   * component owns the sku -> colour mapping so every consumer stays dumb and
   * a re-skin lands in one file.
   *
   * THE GLOW NEVER TOUCHES THE NAME'S BOX. Every tier draws through
   * src/components/NameGlowHalo.tsx as absolutely positioned copies underneath
   * the real <Text>, so equipping one cannot change a width, a measure or an
   * ellipsis point. It is also why the animated tier does not degrade to static
   * here: `textShadowRadius` is not a native-driver property, so the halo stacks
   * fixed shadows and cross-fades their OPACITY, which is native-driver work
   * with no re-measure.
   */
  glow?: string | null;
  /**
   * Set false to force the STATIC halo even for an animated sku.
   *
   * THIS IS THE LAG BUDGET AND IT IS NOT OPTIONAL IN LONG LISTS. Each animated
   * sku stacks up to eight extra <Text> nodes, every one of them drawing a
   * blurred copy of the name each frame. That is nothing on a duel HUD with two
   * names and it is a hundred blurred draws a frame on a leaderboard. Pass
   * `animated={false}` from anything virtualised or unbounded — leaderboards,
   * chat logs, friends lists, history — and leave it alone on the bounded
   * surfaces: HUD, get-ready, results, lobby, profile header, your own name.
   * The same rule governs the web side (`animatedGlow` on UsernameWithFlag).
   */
  animated?: boolean;
  /**
   * Static-halo blur radius in px. The default suits in-game name sizes
   * (13-18px). Raise it ONLY where the name is set at display size — the shop's
   * preview stages — because a halo tuned for 14px text is an invisible rim
   * around 24px text, which is precisely how ten different colours end up
   * looking like the same grey smudge.
   */
  glowRadius?: number;
  /**
   * Is this name drawn on a LIGHT surface (white card, map tooltip)?
   *
   * NOT OPTIONAL IN PRACTICE for light surfaces. Glows ship two colours because
   * one cannot serve both: the dark-surface neon is invisible on white, and the
   * light-surface tone looks like a smudge on black. PlayerList's
   * between-rounds mode renders white cards with dark text — it passes true.
   */
  onLight?: boolean;
  /** Extra nodes rendered AFTER the flag — inline ELO, host badges, etc. */
  children?: ReactNode;
}

/**
 * Canonical "[username] [flag]" pair — the ONE place this layout lives.
 *
 * The flag ALWAYS follows the name so ordering stays consistent everywhere it
 * appears (duel HUD, lobby/leaderboards, results, profile header, emotes). If a
 * country code is missing, only the name renders.
 *
 * - Inline trailing bits (ELO, host badges) → pass as `children`
 *   (they render after the flag).
 * - Leading bits (rank number, trophy, medal) → keep them as a sibling in the
 *   parent row, before <PlayerName>.
 */
export default function PlayerName({
  name,
  countryCode,
  flagSize = 16,
  textStyle,
  flagStyle,
  style,
  gap = 6,
  numberOfLines = 1,
  glow,
  glowRadius = 8,
  onLight = false,
  animated = true,
  children,
}: PlayerNameProps) {
  // The sku resolving to a colour is the whole test: every tier, static and
  // animated, draws through NameGlowHalo now.
  const hasGlow = !!resolveGlowColor(glow, onLight);

  // NO SHADOW ON THIS <Text>, EVER. It is the node that owns the row's layout —
  // it is what Yoga measures and what `numberOfLines` ellipsises against — so
  // anything the glow put on it would be a purchase that changes the name's box.
  // The halo is a stack of absolutely positioned copies underneath instead; see
  // NameGlowHalo for the whole argument.
  const nameText = (
    <Text style={[styles.name, textStyle]} numberOfLines={numberOfLines}>
      {name}
    </Text>
  );

  return (
    <View style={[styles.row, { gap }, style]}>
      {/* THE WRAPPER ONLY EXISTS WHEN THERE IS A HALO TO HANG, and it is sized
          entirely by the real name: the halo's layers are absolutely positioned,
          so they contribute nothing to it. Every glow tier gets the identical
          tree — the static one used to skip this and put its shadow on the name
          instead, which is exactly the asymmetry that made equipping one move
          the layout. */}
      {hasGlow ? (
        <View style={styles.glowStack}>
          <NameGlowHalo
            name={name}
            sku={glow}
            onLight={onLight}
            animated={animated}
            radius={glowRadius}
            // The SAME style the name resolves with, minus the shadow: the
            // layers have to lay out identically or they ghost out from behind
            // the glyphs at some widths.
            textStyle={[styles.name, textStyle]}
            numberOfLines={numberOfLines}
          />
          {nameText}
        </View>
      ) : nameText}
      {countryCode ? (
        <CountryFlag countryCode={countryCode} size={flagSize} style={flagStyle} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
  },
  // Carries the shrink the <Text> used to carry as a direct flex item, so a long
  // name still ellipsises inside a narrow row exactly as it did. Nothing else:
  // no padding, no alignment, no background — it is a positioning context and a
  // shrink target, and any style it grew would be a layout difference between a
  // player who owns a glow and one who does not, which is the one thing this
  // whole path exists to avoid.
  glowStack: {
    flexShrink: 1,
    minWidth: 0,
  },
});
