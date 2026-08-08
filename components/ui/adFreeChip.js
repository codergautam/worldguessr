import { adFreeUntilMs, formatCountdown, useAdFreeCountdown } from '@/lib/adFree';
import { useTranslation } from '@/components/useTranslations';

/* ===========================================================================
 *  "YOUR PASS IS RUNNING" — on the home screen, where the player actually is.
 *
 *  THE PROBLEM IT FIXES. Buying the ad-free pass changed two things a buyer
 *  could see, and both of them were inside the shop: the card celebrated like
 *  any purchase, and a gold chip appeared in the storefront's rail. Close the
 *  modal and there was nothing. The pass works — lib/adFree.js unmounts every
 *  ad slot on the same tick as the charge — but "the ads stopped" is invisible
 *  to anyone who was not staring at the banner, and the one thing a 20-minute
 *  timer must be able to tell you is how much of it is left. So the answer now
 *  lives on the screen you return to, not on the one you bought it from.
 *
 *  IN THE DOM ONLY WHILE A PASS RUNS. It is in the hudCorner flex column, which
 *  computes its own stacking and publishes its height, so appearing and
 *  vanishing costs no offsets anywhere: the Maps button and the online-count
 *  badge below simply move.
 *
 *  IT IS NOT A BUTTON. Nothing here is pressable — hudCorner turns pointer
 *  events back on for each child, so this hands them back rather than parking a
 *  dead box over the street view. A status readout that swallows clicks in the
 *  busiest corner of the screen is worse than no readout.
 *
 *  SKIN = THE PLAYER CARD'S, which is the .timer HUD recipe (see
 *  styles/playerCard.css). Deliberately NOT the shop's gold pill: this sits
 *  directly under the card, and a chip in another surface's palette reads as
 *  something that wandered in. The gold survives on the label alone, exactly
 *  the way the Stamps mark carries it inside the card.
 * ======================================================================== */
export default function AdFreeChip({ session }) {
  const { t: text } = useTranslation('common');
  // Unconditional, before any early return. Costs nothing when no pass is
  // running: a 0 expiry arms no interval, which is the case for almost every
  // visitor on almost every render.
  const msLeft = useAdFreeCountdown(adFreeUntilMs(session));

  if (msLeft <= 0) return null;

  // NO `title` HERE. The shop's chips carry one, and it would be dead weight on
  // this one: a native tooltip needs a hover, and the rule below hands pointer
  // events back to the page. The two words and a clock say it anyway.
  //
  // NOT an aria-live region either, for the reason the clock exists: the content
  // changes every second, so announcing changes would read the countdown aloud
  // 1,200 times. It is a readout, and screen readers reach it as ordinary text.
  return (
    <div className="adFreeChip">
      <span className="adFreeChip__label">{text('shopAdFreeShort')}</span>
      <span className="adFreeChip__time">{formatCountdown(msLeft)}</span>
    </div>
  );
}
