/* ===========================================================================
 *  THE STAMPS CURRENCY MARK — one drawing, every surface.
 *
 *  There were three hand-copies of this glyph (wallet chip, home button, and a
 *  price mark in ShopView that was still the OLD dotted-square design kept
 *  alive by a CSS override). Three copies of a currency symbol is three chances
 *  to ship a shop where the icon beside the price is not the icon on the
 *  button. This is the single source.
 *
 *  WHY A SOLID SEAL AND NOT A PERFORATED STAMP. The previous mark outlined a
 *  postage stamp with a dashed border plus an inner ring. At 16px, beside a
 *  four-digit balance and next to the league pill, the dashes closed up into a
 *  fuzzy grey box and the ring turned to mush. This is ONE filled shape with no
 *  strokes at all, so it holds its weight at any size and in a single flat
 *  colour, which is the only way it survives being tinted by `currentColor` on
 *  a gold chip, a white card and a dark HUD alike.
 *
 *  The ring is two circular subpaths under `fill-rule: evenodd`, which punches
 *  the inner one out as a hole regardless of winding direction. The proportions
 *  (outer r 9.7, hole r 3.1 in a 24 box) are Ionicons' `disc` — deliberately
 *  the exact glyph the mobile app uses for the same currency, so it is one mark
 *  on both platforms with no new asset on either.
 * ======================================================================== */
export default function StampMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 2.3a9.7 9.7 0 1 0 0 19.4 9.7 9.7 0 0 0 0-19.4Zm0 6.6a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"
      />
    </svg>
  );
}
