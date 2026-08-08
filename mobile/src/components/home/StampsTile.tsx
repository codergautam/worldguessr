import { StyleSheet, Text, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '../ui/SfxPressable';
import { colors, t, formatCompact } from '../../shared';

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
 *  SKIN = THE COMMUNITY MAPS CHIP'S, off the same metrics (chipHeight,
 *  chipFontSize in PlayerCard.tsx): these two sit side by side under the card
 *  and have to read as a pair. The card's heavier 2px/16px recipe would make
 *  this a second card, which is the thing we just stopped having.
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
  fontSize: number;
  height: number;
  onPress?: () => void;
  /** Blank clone used by the header's height reservation. */
  ghost?: boolean;
}

export default function StampsTile({
  visible,
  stamps,
  animatedStamps,
  fontSize,
  height,
  onPress,
  ghost = false,
}: StampsTileProps) {
  if (!visible) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.tile, { height }, pressed && !ghost && styles.tilePressed]}
      onPress={ghost ? undefined : onPress}
      disabled={ghost}
      accessibilityRole="button"
      accessibilityLabel={t('shopOpenWithBalance', { count: stamps })}
    >
      {/* THE CURRENCY MARK: `disc` — a minted seal, one solid ring with an open
          centre. The same mark the web build draws as an SVG path
          (components/shop/StampMark.js), chosen because a filled shape survives
          being 13px tall where the old perforated square turned into a fuzzy
          grey box. */}
      <Ionicons name="disc" size={fontSize * 1.05} color="#FDE047" />
      <Text style={[styles.value, { fontSize }]} numberOfLines={1}>
        {ghost ? ' ' : formatCompact(animatedStamps)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.4,
    borderColor: colors.primaryDark,
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent,
  },
  tilePressed: {
    backgroundColor: colors.primary,
  },
  value: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
