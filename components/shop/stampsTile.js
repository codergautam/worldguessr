import { useTranslation } from '@/components/useTranslations';
import useCountUp from '@/components/utils/useCountUp';
import StampMark from './StampMark';

/* ===========================================================================
 *  THE STAMPS TILE — the balance, on its own, under the player card.
 *
 *  IT USED TO BE A CELL INSIDE THE CARD and that is what made the card read as
 *  cluttered. Four facts — name, rating, tier, balance — sat in a 2x2 grid at
 *  near-equal weight, so the eye had nowhere to land. The card is now about ONE
 *  thing (who you are and what you are rated) and the currency stands beside it
 *  instead of inside it.
 *
 *  IT ALSO PUTS THE SHOP BACK ONE CLICK AWAY. As a cell it was decoration on a
 *  card that opened a menu; as a tile it is a button again, which is what the
 *  balance was always for — a currency readout you cannot click through to is
 *  just a number.
 *
 *  IT IS THE ONLY CHIP UNDER THE CARD NOW. Community Maps used to sit beside it
 *  and moved to the footer, taking .daily-community-maps-btn with it. The skin
 *  this tile inherited from that button stays — 10px radius, 1.4px rim, the
 *  flat green — because the alternative is the card's heavier 2px/16px recipe,
 *  which would make this a second card in a corner just cut down to one. See
 *  .stampsTile in styles/playerCard.css.
 *
 *  FAIL CLOSED, TWICE, IN THIS ORDER:
 *    1. `stampsEnabled` must be EXACTLY the boolean true. It is server
 *       delivered (api/stampShop.js entitlementFields) so the kill switch can
 *       be thrown in prod without a deploy — which means an absent value, and
 *       the string "true" an env-var round trip would hand us, must both read
 *       as OFF.
 *    2. There must be a session secret. A signed-out visitor has no balance and
 *       nothing to spend, so the door does not exist for them.
 *  Both are enforced again inside the modal (ShopModal -> useStampShop),
 *  because a page key can always arrive from somewhere this file cannot see.
 * ======================================================================== */

/**
 * @param {object}   session  auth session; both gates read off session.token
 * @param {Function} onOpen   opens the standalone shop modal
 */
export default function StampsTile({ session, onOpen }) {
  const { t: text, lang } = useTranslation('common');

  // A missing NUMBER is not one of the gates: the entitlement block always
  // ships `stamps` alongside the flag, and hiding the only door to the shop
  // over a malformed balance is a worse failure than drawing a zero the next
  // auth verify corrects.
  const raw = session?.token?.stamps;
  const stamps = (typeof raw === 'number' && Number.isFinite(raw)) ? raw : 0;
  // Read BEFORE the gates — hooks cannot sit behind an early return. Same hook
  // the card's rating uses, so the two counters cannot fall out of step.
  const counted = useCountUp(stamps);

  if (session?.token?.stampsEnabled !== true) return null;
  if (!session?.token?.secret) return null;

  const fmt = (n) => {
    try {
      return n.toLocaleString(lang || 'en');
    } catch (e) {
      return String(n); // raw digits are a fine fallback
    }
  };
  const balance = fmt(stamps);
  const shown = fmt(counted);

  return (
    <button
      type="button"
      className="stampsTile"
      onClick={onOpen}
      title={text('shopOpen')}
      aria-label={text('shopOpenWithBalance', { count: balance })}
    >
      <StampMark />
      {/* The hidden copy is the SIZER: it holds the box at the settled
          balance's width for the whole count-up, so 0 -> "7" -> "740" ->
          "1,240" never resizes the tile under itself. A ch reservation cannot
          do that job here — the balance is locale formatted and a thousands
          separator is not one digit wide, so the reservation would always
          overshoot and the tile would sit visibly too wide. */}
      <span className="stampsTile__value">
        <span className="stampsTile__final" aria-hidden="true">{balance}</span>
        <span className="stampsTile__live">{shown}</span>
      </span>
    </button>
  );
}
