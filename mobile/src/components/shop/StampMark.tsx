/* ===========================================================================
 *  THE STAMPS CURRENCY MARK — one drawing, ONE SIZE, every surface. Mobile half
 *  of components/shop/StampMark.js; both render the same stamp artwork, so the
 *  currency is literally the same picture on both platforms.
 *
 *  IT WAS Ionicons `disc` AND IT IS NOT ANY MORE. Four screens each wrote their
 *  own `<Ionicons name="disc" color="#FDE047" />` — the home tile, the shop
 *  header wallet, every buy button, and the ranked end screen's receipt — which
 *  is four places to miss when the currency gets artwork. It got artwork.
 *
 *  IT TAKES NO SIZE, AND THAT IS THE POINT. Those four sites each picked their
 *  own (15, 14, 1.05x the tile font, 20), so the mark was a different size on
 *  every screen and making it bigger meant finding all four. It was judged too
 *  small twice. STAMP_MARK_SIZE is now the only number, matching web's
 *  --stampMarkSize, and the SURFACES accommodate the mark: PlayerCard's
 *  chipHeight and StampsEarnedDisplay's reservation both derive from it. If a
 *  surface cannot hold it, grow the surface.
 *
 *  The height is what is fixed; the art is 300x349, so the width follows the
 *  ratio. A square box with resizeMode="contain" would letterbox instead, and
 *  in a flex row that empty column reads as a broken gap rather than a wide
 *  icon.
 * ======================================================================== */
import { Image, StyleProp, ImageStyle } from 'react-native';

/** The one size, and the number every surface sizes ITSELF against. */
export const STAMP_MARK_SIZE = 45;

/* THE DIGITS ARE PART OF THE MARK. Every balance and price beside this artwork
 * was tuned against the old ring glyph (13-15px) and every one of them was left
 * behind when the mark grew, so they are ratios of it now rather than four more
 * hand-picked numbers. Same 0.62 / 0.36 split as web's --stampValueSize and
 * --stampUnitSize: the figure reads at roughly the stamp's inner panel, the
 * unit label stays subordinate to the figure it labels. */
export const STAMP_VALUE_SIZE = Math.round(STAMP_MARK_SIZE * 0.62);
export const STAMP_UNIT_SIZE = Math.round(STAMP_MARK_SIZE * 0.36);

/** Intrinsic aspect of assets/stamp.png (300x349). */
const ASPECT = 300 / 349;

export default function StampMark({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require('../../../assets/stamp.png')}
      style={[{ width: STAMP_MARK_SIZE * ASPECT, height: STAMP_MARK_SIZE }, style]}
      resizeMode="contain"
      accessible={false}
    />
  );
}
