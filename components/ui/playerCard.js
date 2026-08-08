import { useCallback, useEffect, useRef, useState } from 'react';
import { FaChevronDown } from 'react-icons/fa6';
import { useTranslation } from '@/components/useTranslations';
import CountryFlag from '../utils/countryFlag';
import { nameGlowProps, GlowName } from '../utils/usernameWithFlag';
import { resolveLeague } from '../utils/leagues';
import useCountUp from '../utils/useCountUp';

/* ===========================================================================
 *  THE PLAYER CARD — the whole top-right corner of the home screen.
 *
 *  It replaces five separate floating controls: the username pill, the friends
 *  icon, the league/ELO chip, the Stamps balance button, and the invisible
 *  coordination between them. Those five were owned by three files and two
 *  stylesheets and were stacked by hand-tuned `top:` values that quoted each
 *  other in comments — add a sixth and something moved.
 *
 *  WHAT IT SHOWS, AND WHY EXACTLY THIS:
 *    row 1   who you are          |  what you are rated
 *    row 2   what tier that is    |  what you can spend
 *  Identity on the left, live numbers on the right, one caret. Every fact
 *  appears exactly once — there is no rating badge AND a tier badge AND a rank
 *  all restating each other, which is what makes a status card read as
 *  machine-generated.
 *
 *  THE TIER NAME IS THE ONLY NEW INFORMATION. The old chip showed the league
 *  emoji alone; "Gold II" was a thing you could only learn by opening a modal.
 *  It fills row 2's left cell, which is what stops the card looking lopsided.
 *
 *  ONE PRESS TARGET. The whole card opens the menu. Splitting the Stamps cell
 *  back out into its own button (to keep the shop one click away) is a contained
 *  change if it ever needs making — but a card with three invisible hit regions
 *  is the clutter we just deleted, in a smaller box.
 *
 *  SKIN = THE .timer RECIPE, restated (globals.scss ~1930). --gradLight over
 *  --primaryTransparent, 2px --primary border, 16px radius, lexend 600, the
 *  standard three-layer shadow. No backdrop-filter and no dark underlay: both
 *  are explicitly prohibited on that pill and both have been reverted before.
 * ======================================================================== */

/**
 * @param {object}   session       auth session; every gate reads off session.token
 * @param {object}   eloData       {elo, rank, league} — home.js owns the state
 * @param {number}   friendRequests pending received friend requests, for the badge
 * @param {Function} onOpenProfile / onOpenElo / onOpenFriends
 */
export default function PlayerCard({
  session,
  eloData,
  friendRequests = 0,
  onOpenProfile,
  onOpenElo,
  onOpenFriends,
}) {
  const { t: text } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  // Dismiss on an outside press or Escape. Same mechanics as the account
  // modal's Stamps wallet (components/shop/StampsWallet.js) — that is this
  // codebase's one popover pattern and there is no reason for a second.
  // Listeners exist ONLY while open, so a closed card costs nothing.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // The rating counts up from 0 on open. The Stamps balance does the same off
  // the same hook, one tile down (components/shop/stampsTile.js) — they are
  // separate surfaces now but they share useCountUp, so they still cannot
  // disagree on cadence.
  const animatedElo = useCountUp(eloData?.elo);

  const username = session?.token?.username;
  const countryCode = session?.token?.countryCode || null;
  // THE FIRST PLACE A BUYER LOOKS. There is no roster up here, so the equipped
  // sku comes straight off the session — which useStampShop patches in place on
  // equip (applyEntitlements), so the halo appears under the cursor rather than
  // on the next reload.
  const glow = nameGlowProps(session?.token?.cosmetics?.equipped?.nameGlow);
  // NULL UNTIL THE RATING IS KNOWN, deliberately. getLeague() has to return a
  // tier for any input, so resolveLeague(undefined) yields the LOWEST one —
  // which the old chip could get away with because it only ever drew the emoji,
  // and which this card cannot, because it draws the tier by name. Rendering it
  // eagerly would flash "Trekker" at a Legend for the frame before eloData is
  // seeded off the session.
  const league = eloData ? resolveLeague(eloData.elo, eloData.league) : null;

  /* THE STAMPS KILL-SWITCH GATE LIVED HERE and went with the menu row it gated
     (see the menu below). components/shop/stampsTile.js does the same
     stampsEnabled + secret check for the tile directly under this card, which is
     now the only door to the shop on this screen — so a second read of the same
     two fields up here was gating nothing. */

  // The settled rating, rendered invisibly to hold the box open while the
  // count-up climbs into it. A real string, not a digit count: the width that
  // matters is what this font actually paints, letter-spacing and all.
  const eloFinal = typeof eloData?.elo === 'number' ? Math.round(eloData.elo) : '';

  const go = (fn) => () => { close(); fn?.(); };

  return (
    <div className="pcard" ref={rootRef}>
      <button
        type="button"
        className={`pcard__face ${open ? 'pcard__face--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="pcard__body">
          {/* Line 1 — who the card belongs to. */}
          <span className="pcard__name">
            {/* GlowName is boxless when no glow resolves — a purchase must not
                add a flex item, a gap or a pixel of width to the card. */}
            <GlowName glow={glow}>{username}</GlowName>
            {countryCode && <CountryFlag countryCode={countryCode} size={0.78} marginRight="0" />}
          </span>

          {/* Line 2 — the rating, its unit, then the tier badge. The badge sits
              LAST so the line starts on a digit: leading with the emoji pushed
              the visible start of this line right by its side bearing and the
              two lines stopped sharing a left edge. Weight is the hierarchy —
              700 on the digits, 400 and dimmed on the unit. */}
          <span className="pcard__stat">
            {/* Before the rating arrives there is nothing to reserve against,
                so the placeholder is just the placeholder — no sizer, no
                overlay, and no box pretending to be four digits wide. */}
            {!eloData ? (
              <span className="pcard__eloValue">...</span>
            ) : (
              <span className="pcard__eloValue">
                <span className="pcard__eloFinal" aria-hidden="true">{eloFinal}</span>
                <span className="pcard__eloLive">{animatedElo}</span>
              </span>
            )}
            <span className="pcard__eloUnit">{text('ELO')}</span>
          </span>
        </span>

        <FaChevronDown className="pcard__caret" aria-hidden="true" />
      </button>

      {open && (
        // The destinations accountModal.js already names in its own nav
        // (navigationItems) — same labels, same emoji, so this reads as a
        // shortcut into a screen that exists rather than a new invented menu.
        <div className="pcard__menu" role="menu">
          <button type="button" className="pcard__item" role="menuitem" onClick={go(onOpenElo)}>
            <span className="pcard__itemIcon" aria-hidden="true">🏆</span>
            {text('ELO')}
          </button>
          {/* THE SHOP ROW IS GONE, and it is not coming back to this menu. It
              was here when the card was the only chrome that could advertise
              the currency; the Stamps tile now sits directly under this card
              (components/shop/stampsTile.js) and opens the same modal in one
              press instead of two. A door and a second door to the same room,
              a few pixels apart, is the clutter this card was built to delete.
              The paintbrush glyph and its .pcard__itemMark rule went with it. */}
          <button type="button" className="pcard__item" role="menuitem" onClick={go(onOpenProfile)}>
            <span className="pcard__itemIcon" aria-hidden="true">👤</span>
            {text('profile')}
          </button>
          <button type="button" className="pcard__item" role="menuitem" onClick={go(onOpenFriends)}>
            <span className="pcard__itemIcon" aria-hidden="true">👥</span>
            {text('friendsText')}
            {friendRequests > 0 && <span className="pcard__badge">{friendRequests}</span>}
          </button>
        </div>
      )}
    </div>
  );
}
