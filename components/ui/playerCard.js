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
 *  THE TIER IS SAID TWICE ON ROW 2, AND THAT IS THE POINT: the digits take the
 *  tier's colour and the badge after "ELO" repeats it as a glyph. The colour is
 *  what carries across a glance at the corner of the screen; the emoji is what
 *  keeps it readable for anyone who cannot separate bronze from gold. Spelling
 *  the tier out in words as well ("Voyager") was tried and removed — that is a
 *  fourth fact on a chip that lives in the corner of a game.
 *
 *  NO DROPDOWN. The card used to open a three-item popover (ELO / Profile /
 *  Friends). It is now two direct targets, by owner ruling:
 *      anywhere on the card  ->  Profile
 *      the rating line       ->  ELO
 *  and Friends is deliberately NOT one click from here — it lives inside the
 *  profile modal's own nav, which is one press further and where it belongs.
 *  A menu that existed to route to three places the account modal already lists
 *  was a second navigation for the same rooms.
 *
 *  TWO REAL BUTTONS, NOT ONE DIV WITH TWO HANDLERS. A stretched `.pcard__hit`
 *  covers the card and the rating line is a button layered above it — the same
 *  shape the shop's owned-emote tiles use. Nesting a <button> inside a <button>
 *  is invalid HTML and collapses to one control for a keyboard or a screen
 *  reader, so the hit target has to be a sibling rather than a parent.
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
 * @param {Function} onOpenProfile  whole-card press
 * @param {Function} onOpenElo      the rating line only
 */
export default function PlayerCard({
  session,
  eloData,
  friendRequests = 0,
  onOpenProfile,
  onOpenElo,
}) {
  const { t: text } = useTranslation('common');

  // The rating counts up from 0 on mount. The Stamps balance does the same off
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
  // tier for any input, so resolveLeague(undefined) yields the LOWEST one.
  // Rendering it eagerly would show a Legend a grey boot and grey digits for the
  // frame before eloData is seeded off the session — and the digits are the same
  // element the count-up runs on, so that frame would read as a whole recolour.
  const league = eloData ? resolveLeague(eloData.elo, eloData.league) : null;
  // `light` FIRST, then `color` — the same resolution duelHealthbar.js and
  // partyLobby.js use to tint a name by tier, and for the same reason: Trekker's
  // base colour is #808080, which is a grey barely brighter than the shadow it
  // sits on. `light` is that tier's readable variant. Every other tier only
  // defines `color`, so this is a one-tier fix that costs nothing elsewhere.
  const leagueColor = league ? (league.light ?? league.color ?? null) : null;
  // ON THE SPAN THAT PAINTS THE DIGITS, NOT ON ITS PARENT — and that is not a
  // style choice. globals.scss:1761 is `h1, h2, h3, span, label { color: white }`,
  // an element rule that matches EVERY span in the app. A colour set on
  // .pcard__eloValue is therefore never inherited by .pcard__eloLive inside it:
  // the child matches that global rule directly, and a direct match always beats
  // an inherited value regardless of the parent's specificity. Only a declaration
  // ON the child wins, and inline is the one that always does.
  const eloTint = leagueColor ? { color: leagueColor } : undefined;

  /* THE STAMPS KILL-SWITCH GATE LIVED HERE and went with the menu row it gated
     (see the menu below). components/shop/stampsTile.js does the same
     stampsEnabled + secret check for the tile directly under this card, which is
     now the only door to the shop on this screen — so a second read of the same
     two fields up here was gating nothing. */

  // The settled rating, rendered invisibly to hold the box open while the
  // count-up climbs into it. A real string, not a digit count: the width that
  // matters is what this font actually paints, letter-spacing and all.
  const eloFinal = typeof eloData?.elo === 'number' ? Math.round(eloData.elo) : '';

  return (
    <div className="pcard">
      <div className="pcard__face">
        {/* The card-wide target, underneath everything. Empty and labelled
            rather than wrapping the content, so the rating button below can be
            a sibling instead of an illegal nested <button>. */}
        <button
          type="button"
          className="pcard__hit"
          onClick={() => onOpenProfile?.()}
          aria-label={text('profile')}
        />

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
              700 on the digits, 400 and dimmed on the unit.

              THE DIGITS CARRY THE TIER'S COLOUR and the badge repeats it as a
              glyph. That is one fact said two ways on purpose: the colour is
              what you read at a glance across the corner of the screen, the
              emoji is what makes it legible to anyone who cannot tell #cd7f32
              from #ffd700. The unit stays dimmed white — tinting it too would
              turn the whole line one colour and lose the weight hierarchy. */}
          {/* The one exception to "the card opens Profile": the rating line
              routes to the ELO page instead. It sits above .pcard__hit in the
              stacking order, so a press here never reaches it — no
              stopPropagation needed, because they are siblings and the click
              simply lands on whichever is on top. */}
          <button
            type="button"
            className="pcard__stat pcard__statBtn"
            onClick={() => onOpenElo?.()}
            aria-label={text('ELO')}
          >
            {/* Before the rating arrives there is nothing to reserve against,
                so the placeholder is just the placeholder — no sizer, no
                overlay, and no box pretending to be four digits wide. */}
            {!eloData ? (
              <span className="pcard__eloValue">...</span>
            ) : (
              // Inline, not a class: the palette is seasonal and the server can
              // re-anchor it at runtime (see resolveLeague), so a stylesheet
              // full of per-tier classes would need a deploy to stay honest.
              // The sizer is `visibility: hidden` and paints nothing, so it does
              // not need the tint — only the live copy is ever seen.
              <span className="pcard__eloValue">
                <span className="pcard__eloFinal" aria-hidden="true">{eloFinal}</span>
                <span className="pcard__eloLive" style={eloTint}>{animatedElo}</span>
              </span>
            )}
            <span className="pcard__eloUnit">{text('ELO')}</span>
            {league && (
              <span className="pcard__leagueEmoji" title={league.name} aria-label={league.name} role="img">
                {league.emoji}
              </span>
            )}
          </button>
        </span>

        {/* Pending friend requests, as a SIGN and not a door — it is
            pointer-transparent, so pressing it opens Profile like the rest of
            the card, and Friends is reachable from that modal's nav. Dropping
            it with the menu would have made incoming requests silently
            invisible on this screen.
            A child of the FACE, not the body: the body is inset by the card's
            padding, and a corner badge has to anchor to the card. */}
        {friendRequests > 0 && (
          <span className="pcard__badge" aria-label={text('friendsText')}>{friendRequests}</span>
        )}
      </div>

    </div>
  );
}
