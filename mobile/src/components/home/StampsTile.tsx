import { StyleSheet, Text, Platform } from 'react-native';
import StampMark, { stampMarkStyle } from '../shop/StampMark';
import { Pressable } from '../ui/SfxPressable';
import { colors, t, formatCompact } from '../../shared';
import { useSiteAccent } from '../../store/siteBackgroundStore';

/* ===========================================================================
 *  THE STAMPS TILE — the balance, on its own, under the player card.
 *
 *  IT USED TO BE A CELL INSIDE THE CARD and that is what made the card read as
 *  cluttered: four facts (name, rating, tier, balance) in a 2x2 grid at
 *  near-equal weight, so nothing led. The card is about ONE thing now — who you
 *  are and what you are rated — and the currency stands beside it.
 *
 *  IT ALSO PUTS THE SHOP BACK ONE TAP AWAY. As a cell it was decoration on a
 *  card that opened a sheet; as a tile it is a button again, which is what a
 *  balance is for. A currency readout you cannot tap through to is just a
 *  number.
 *
 *  IT IS THE ONLY CHIP UNDER THE CARD NOW. Community Maps used to sit beside it
 *  and is a footer icon button instead. The tile wears the CARD'S tone at CHIP
 *  proportions: PlayerCard's fill and its accent.primary rim, at 1.4px/12px
 *  instead of the card's 2px/16px, with its box from playerCardMetrics. It used
 *  to rim itself in accent.deep — the darkest tone in the palette — which made
 *  it read as a darker stranger under the card (web had the same bug via its
 *  old --gradGreenBtn coat). Proportion separates chip from card; tone must not.
 *
 *  IT SIZES NOTHING ITSELF. Mark, digits and height all arrive from
 *  playerCardMetrics, where they are derived from the card's name size (see
 *  chipMark there). This file used to hardcode the global 45px mark and the
 *  28px digits that follow it, which on a phone put the balance above the
 *  player's own name — the one thing the card is supposed to lead with.
 *
 *  FAIL CLOSED, TWICE, IN THIS ORDER:
 *    1. `stampsEnabled` must be EXACTLY the boolean true — it is the server's
 *       kill switch and authStore coerces a missing field to false, so a server
 *       predating the shop renders no tile rather than a door whose every call
 *       404s.
 *    2. There must be a signed-in user. A guest has no balance to show.
 * ======================================================================== */

interface StampsTileProps {
  /** Both gates, resolved by the caller off the auth store. */
  visible: boolean;
  /** The real balance — accessibility label only, never the digits. */
  stamps: number;
  /** The counting balance, so a screen reader never gets a half-finished number. */
  animatedStamps: number;
  /* THE THREE COME AS A SET, from playerCardMetrics — mark, digits and box are
     one derivation off the card's name size and are documented there. This
     component picks none of them, and must not: a fontSize chosen here is how
     the balance ended up larger than the player's own name.
     (There is still no LABEL size. That token belonged to Community Maps, and
     handing it to this tile is what once made "Maps" 28px.) */
  height: number;
  markSize: number;
  valueSize: number;
  onPress?: () => void;
  /** Blank clone used by the header's height reservation. */
  ghost?: boolean;
}

export default function StampsTile({
  visible,
  stamps,
  animatedStamps,
  height,
  markSize,
  valueSize,
  onPress,
  ghost = false,
}: StampsTileProps) {
  // BEFORE the visibility bail, not after: this is the only hook on the
  // component and an early return above it would make the call conditional.
  const accent = useSiteAccent();

  if (!visible) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        {
          height,
          borderColor: accent.primary,
          backgroundColor: pressed && !ghost
            ? accent.primary
            : Platform.OS === 'android' ? accent.androidFlat : accent.primaryTransparent,
        },
      ]}
      onPress={ghost ? undefined : onPress}
      disabled={ghost}
      accessibilityRole="button"
      accessibilityLabel={t('shopOpenWithBalance', { count: stamps })}
    >
      {/* THE CURRENCY MARK: the same stamp artwork as every other surface on
          both platforms, at the ONE size this corner overrides it to. A style,
          never a size prop (see stampMarkStyle in ../shop/StampMark) — and the
          number is the card's, not this file's, so the picture and the name it
          hangs under keep their proportion at every breakpoint. It still cannot
          go small: it is an illustration with an outline and strokes inside it,
          and at text height those close up into a smudge, which is why the
          derivation has a 30px floor. */}
      <StampMark style={stampMarkStyle(markSize)} />
      <Text style={[styles.value, { fontSize: valueSize }]} numberOfLines={1}>
        {ghost ? ' ' : formatCompact(animatedStamps)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Border and fill come from useSiteAccent at the call site: this chip lives
  // in the home corner, so it wears the equipped background's colour.
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.4,
  },
  // No fontSize: it arrives as a prop, derived off the card's name size.
  value: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
