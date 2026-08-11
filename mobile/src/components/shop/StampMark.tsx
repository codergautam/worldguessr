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

/** Intrinsic aspect of assets/stamp.png (300x349). */
const ASPECT = 300 / 349;

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

/* THE OVERRIDE MECHANISM, AND IT IS A STYLE, NEVER A PROP. A size prop is what
 * let four screens each pick their own number; a style has to be built from a
 * documented constant, and there are exactly TWO of those below. Both mirror
 * web (styles/shop.css --stampMarkSizeBtn, styles/playerCard.css .stampsTile). */
export function stampMarkStyle(height: number): ImageStyle {
  return { width: height * ASPECT, height };
}

/* EXCEPTION 1 — A CONTROL, NOT A SURFACE. A shop card's buy button is the same
 * control as the Equip button on the card beside it, and at the full mark it ran
 * nearly twice that button's height. "Grow the surface" cannot apply: the
 * surface is a 14px pill, and growing it means growing Equip and Owned to match
 * a mark neither of them carries.
 *
 * Still ONE number for the action row, with the digits derived from it at the
 * same 0.62 — which lands on 14, exactly the fontSizes.sm the word "Equip" runs
 * at. */
export const STAMP_MARK_SIZE_BTN = 22;
export const STAMP_VALUE_SIZE_BTN = Math.round(STAMP_MARK_SIZE_BTN * 0.62);
export const STAMP_MARK_BTN_STYLE: ImageStyle = stampMarkStyle(STAMP_MARK_SIZE_BTN);

/* EXCEPTION 2 — A SURFACE THAT CANNOT GROW: the home corner's stamps tile. Its
 * size does not live here, because it is not a constant: it is 1.5x the player
 * card's name at whatever breakpoint the device landed on, so it lives in that
 * card's metrics table (chipMarkSize / chipValueSize in
 * src/components/home/PlayerCard.tsx) and is documented there. At the full 45px
 * the balance rendered LARGER than the player's own name on a phone, on a card
 * whose whole point is that the name leads.
 *
 * That is the last one. Any other surface that cannot hold 45px should grow. */

export default function StampMark({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require('../../../assets/stamp.png')}
      style={[stampMarkStyle(STAMP_MARK_SIZE), style]}
      resizeMode="contain"
      accessible={false}
    />
  );
}
