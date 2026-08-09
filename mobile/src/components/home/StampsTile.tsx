import { StyleSheet, Text, Platform } from 'react-native';
import StampMark, { STAMP_VALUE_SIZE } from '../shop/StampMark';
import { Pressable } from '../ui/SfxPressable';
import { colors, t, formatCompact } from '../../shared';
import { useHomeAccent } from '../../store/siteBackgroundStore';

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
 *  and is a footer icon button instead. This kept that chip's skin, and kept
 *  taking its height from PlayerCard's chipHeight, because the alternative is
 *  the card's heavier 2px/16px recipe — which would make this a second card in
 *  a corner just cut down to one.
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
  /* No fontSize. The balance is sized against the currency mark it stands
     beside (STAMP_VALUE_SIZE), not against the pair's label size — that token
     belongs to Community Maps and handing it to this tile is what once made
     "Maps" 28px. Only the HEIGHT is shared between the two chips. */
  height: number;
  onPress?: () => void;
  /** Blank clone used by the header's height reservation. */
  ghost?: boolean;
}

export default function StampsTile({
  visible,
  stamps,
  animatedStamps,
  height,
  onPress,
  ghost = false,
}: StampsTileProps) {
  // BEFORE the visibility bail, not after: this is the only hook on the
  // component and an early return above it would make the call conditional.
  const accent = useHomeAccent();

  if (!visible) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        {
          height,
          borderColor: accent.deep,
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
      {/* THE CURRENCY MARK: the stamp artwork, the same picture at the same
          size as every other surface on both platforms. The tile scales to hold
          IT (PlayerCard's chipHeight is derived from STAMP_MARK_SIZE), because
          this mark is a small illustration with an outline and strokes inside
          it and at text height those close up into a smudge. */}
      <StampMark />
      <Text style={styles.value} numberOfLines={1}>
        {ghost ? ' ' : formatCompact(animatedStamps)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Border and fill come from useHomeAccent at the call site: this chip lives
  // in the home corner, so it wears the equipped background's colour.
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.4,
  },
  value: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: STAMP_VALUE_SIZE,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
