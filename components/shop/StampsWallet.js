import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { formatCountdown } from '@/lib/adFree';
import StampMark from './StampMark';

/* ===========================================================================
 *  The wallet.
 *
 *  Lives in the account modal header, beside the username and the close
 *  button — account state belongs where users already go looking for account
 *  state, and this is the one screen that is only ever about their account.
 *
 *  It answers three questions and nothing else:
 *    how many Stamps do I have   → the balance, tabular-nums so it cannot
 *                                  make the header breathe as it counts
 *    where do Stamps come from   → the popover. Ranked 1v1 and 2v2 duels ONLY.
 *                                  That is the single most misunderstood thing
 *                                  about the currency, so it is one tap away
 *                                  from the balance rather than buried.
 *    is my ad-free pass running  → the countdown chip, present only while a
 *                                  pass is actually live.
 *
 *  The chip is chrome, not a card: same token stack as the .timer HUD pill
 *  (--gradLight over a dark underlay, --primaryTransparent base, 2px --primary
 *  border, 16px radius). See styles/shop.css.
 * ======================================================================== */

/* ===========================================================================
 *  THE CURRENCY MARK — a minted seal: one solid inked ring with an open centre.
 *
 *  The perforated square it replaces (a dashed border with a globe inside) was
 *  three strokes fighting for 16px: at the size this actually ships — beside a
 *  four-digit balance, next to the league pill — the dashes closed up into a
 *  fuzzy grey box and the meridians turned to mush. This is ONE filled shape
 *  with no strokes at all, so it holds its weight at any size and in a single
 *  flat colour.
 *
 *  The ring is drawn as two circular subpaths under `fill-rule: evenodd`, which
 *  punches the inner one out as a hole regardless of winding direction. Its
 *  proportions (outer r 9.7, hole r 3.1 in a 24 box) are Ionicons' `disc`, which
 *  is deliberately the exact glyph the mobile app uses for the same currency —
 *  one mark, both platforms, no new asset on either.
 *
 *  One drawing, shared: components/shop/StampMark.js.
 * ======================================================================== */
function WalletMark() {
  return <StampMark className="wallet__mark" />;
}

function StampsWallet({ stamps, adFreeMsLeft, text, lang, onOpenShop }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  // Dismiss on an outside press or Escape. Listeners exist ONLY while the
  // popover is open, so a closed wallet costs nothing.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  let balance = String(stamps ?? 0);
  try {
    balance = Number(stamps ?? 0).toLocaleString(lang || 'en');
  } catch (e) { /* the raw string is a fine fallback */ }

  return (
    <div className="wallet" ref={rootRef}>
      <button
        type="button"
        className={`wallet__chip ${open ? 'wallet__chip--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={text('shopStampsBalance', { count: balance })}
      >
        <WalletMark />
        <span className="wallet__value">{balance}</span>
        <span className="wallet__unit">{text('shopStampsUnit')}</span>
      </button>

      {adFreeMsLeft > 0 && (
        <span className="wallet__adfree" title={text('shopAdFreeActive')}>
          <span className="wallet__adfreeLabel">{text('shopAdFreeShort')}</span>
          <span className="wallet__adfreeTime">{formatCountdown(adFreeMsLeft)}</span>
        </span>
      )}

      {open && (
        <div className="wallet__popover" role="dialog">
          <h3 className="wallet__popoverTitle">{text('shopStampsHowTitle')}</h3>
          <p className="wallet__popoverBody">{text('shopStampsHowBody')}</p>
          {onOpenShop && (
            <button
              type="button"
              className="wallet__popoverLink"
              onClick={() => { close(); onOpenShop(); }}
            >
              {text('shopOpen')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(StampsWallet);
