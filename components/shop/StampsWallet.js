import { memo } from 'react';
import { formatCountdown } from '@/lib/adFree';
import StampMark from './StampMark';

/* ===========================================================================
 *  The wallet.
 *
 *  Lives in the account modal header, beside the username and the close
 *  button — account state belongs where users already go looking for account
 *  state, and this is the one screen that is only ever about their account.
 *
 *  It answers two questions and nothing else:
 *    how many Stamps do I have   → the balance, tabular-nums so it cannot
 *                                  make the header breathe as it counts
 *    is my ad-free pass running  → the countdown chip, present only while a
 *                                  pass is actually live.
 *
 *  THE CHIP OPENS THE STOREFRONT (user ruling Aug 9). It used to toggle a
 *  popover explaining where Stamps come from, and that popover is now deleted
 *  rather than demoted to a hover: the storefront's own balance pill carries
 *  THE SAME TWO STRINGS (shopStampsHowTitle / shopStampsHowBody, see the
 *  `.shopWallet__how` block in ShopView.js), so pressing a balance to reach
 *  the place that spends it loses nothing and skips a step. A balance you can
 *  press should go to the shop; anything else is a dead end.
 *
 *  The chip is chrome, not a card: same token stack as the .timer HUD pill
 *  (--gradLight over a dark underlay, --primaryTransparent base, 2px --primary
 *  border, 16px radius). See styles/shop.css.
 * ======================================================================== */

/* The currency mark is the stamp artwork, one size on every surface that shows
 * a balance or a price: components/shop/StampMark.js. The chip's own vertical
 * padding is all this file contributes to it. */

function StampsWallet({ stamps, adFreeMsLeft, text, lang, onOpenShop }) {
  let balance = String(stamps ?? 0);
  try {
    balance = Number(stamps ?? 0).toLocaleString(lang || 'en');
  } catch (e) { /* the raw string is a fine fallback */ }

  return (
    <div className="wallet">
      {/* aria-label carries BOTH facts: what the number is, and that pressing
          it goes somewhere. Sighted users get the second from the cursor and
          the hover lift; a screen reader would otherwise hear a bare balance
          on a button and have no idea what the button does. */}
      <button
        type="button"
        className="wallet__chip"
        onClick={() => onOpenShop?.()}
        aria-label={`${text('shopStampsBalance', { count: balance })}. ${text('shopOpen')}`}
      >
        <StampMark />
        <span className="wallet__value">{balance}</span>
        <span className="wallet__unit">{text('shopStampsUnit')}</span>
      </button>

      {adFreeMsLeft > 0 && (
        <span className="wallet__adfree" title={text('shopAdFreeActive')}>
          <span className="wallet__adfreeLabel">{text('shopAdFreeShort')}</span>
          <span className="wallet__adfreeTime">{formatCountdown(adFreeMsLeft)}</span>
        </span>
      )}
    </div>
  );
}

export default memo(StampsWallet);
