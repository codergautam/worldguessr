/* ===========================================================================
 *  THE STAMPS CURRENCY MARK — one drawing, ONE SIZE, every surface.
 *
 *  IT IS THE ARTWORK, NOT A GLYPH. It used to be an inline path — a filled ring
 *  (Ionicons' `disc`) tinted gold by `currentColor` — picked back when the
 *  currency had no artwork and a stroked postage stamp mushed out at 16px.
 *  public/stamp.png is that artwork: a real stamp, heavy black outline, drawn
 *  once. A currency that has a picture should be shown with its picture.
 *
 *  IT TAKES NO PROPS, AND THAT IS THE POINT. Callers used to pass a sizing
 *  class and there were five of them, so the mark was 14px beside a price and
 *  30px in the wallet and 1.05em on the home tile — five numbers, and every
 *  time the mark was judged too small it was five edits to make it bigger. It
 *  was judged too small twice. Now the size lives in exactly one place
 *  (--stampMarkSize in styles/shop.css, applied by .stampMark) and the
 *  SURFACES accommodate the mark rather than the mark shrinking into them.
 *
 *  If a surface genuinely cannot hold it, grow the surface. Do not reintroduce
 *  a size prop: that is the thing that made this drift in the first place.
 * ======================================================================== */
export default function StampMark() {
  return (
    <img
      src="/stamp.png"
      className="stampMark"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}
