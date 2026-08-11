import { memo, useEffect } from 'react';
import { asset } from '@/lib/basePath';
import { formatCountdown } from '@/lib/adFree';
import { DEFAULT_BACKGROUND_PATH } from '@/lib/siteBackground';
import {
  GLOW_DARK,
  cachedNameGlowProps,
} from '@/components/utils/usernameWithFlag';
import useNearViewport from './lazyMount';
import { STOCK_PIN_KEY } from './markerPins';

/* ===========================================================================
 *  Live previews. The whole point of the shop: nobody spends 2,500 Stamps on
 *  a word they have not seen wearing the thing.
 *
 *  ONE STAGE. ONE. This card used to be two flat plates of equal weight stacked
 *  on top of each other, one near-black and one white, and then — after the
 *  first pass at fixing that — one black stage with a white "on light" swatch
 *  strip welded along its bottom edge. Both readings were the same mistake: a
 *  debug view. "Here is the variable on surface A, here it is on surface B" is
 *  not a product anybody spends 3,000 Stamps on, and the strip was still paying
 *  a third of every card's height for a caption.
 *
 *  So there is now exactly ONE stage per preview and it is black, and the stage
 *  is dressed as the place the glow actually lives: the same 135deg black ->
 *  green-black wash the account modal already paints (the wallet popover, the
 *  other surface this was matched to, has since been deleted),
 *  under the .timer HUD's inset top highlight, with a centre vignette so the
 *  darkest pixels are the ones directly behind the name. Nothing invented, no
 *  glassmorphism, no gradient card that belongs to some other app.
 *
 *  THE LIGHT *VARIANT* IS NOT GONE — ONLY THE LIGHT *STAGE* IS. Every sku still
 *  carries a `glowLight` colour in shared/shop/catalog.js and styles/nameGlow.css
 *  still ships the light keyframes, because real light surfaces exist in game
 *  (the between-rounds white player cards, the Leaflet map tooltips) and
 *  nameGlowShadow(sku, GLOW_LIGHT) is what dresses the name on them. This file
 *  simply no longer previews that surface. Do not "clean up" the light palette
 *  on the strength of this preview not using it.
 *
 *  THE HALO STILL GETS ROOM, and it now gets it from the SHARED 16/9 stage every
 *  other category uses rather than from a pixel height of its own. The name is
 *  centred in the whole box, which is ~45px of clearance on the narrowest card
 *  any shelf produces and more everywhere else — past the widest radius any sku
 *  in styles/nameGlow.css reaches (32px), so the large-amplitude animations
 *  bloom into black instead of clipping at an edge or landing on a neighbour.
 *
 *  THERE IS NO FEATURED BAND ANY MORE. The animated skus used to be promoted
 *  into one: a wider column span, a taller stage, a bigger display name and a
 *  gold frame, driven by a `shopPrevSlot--glowAnimated` marker and a
 *  `.shopCard:has()` rule, on top of a bespoke twelve-column grid that every
 *  breakpoint then had to re-derive spans for. That was four mechanisms selling
 *  what the cards already sell by MOVING, and it made the Glows section a
 *  different shape from every other shelf in the shop. One card size now, one
 *  stage, one grid. The animated ones still stand out: they are the ones moving.
 *
 *  THE MOTION CHIP IS GONE — the little gold "Animated" pill with the glowing
 *  dot that sat in every animated stage's corner. It was a badge restating what
 *  the stage already demonstrates by MOVING, which is the same sin as the
 *  per-item blurb this shop already buried: chrome describing the thing it is
 *  stuck to. The movement is the label. (Reduced-motion users lose the word,
 *  and that is the honest trade: a badge that outlives its product was selling
 *  something the surface it was on no longer showed.)
 *
 *  The shadow recipe itself is NEVER reimplemented here. nameGlowProps() from
 *  components/utils/usernameWithFlag.js is the single source for it, and the
 *  animated skus pick up their keyframes from styles/nameGlow.css through the
 *  className it returns.
 * ======================================================================== */

/** Signed-out visitors still get to see the glow on something name-shaped. */
const SAMPLE_NAME = 'WorldGuessr';

/**
 * Previews that cost real work on mount, and therefore wait until they are
 * near the viewport (see lazyMount.js):
 *   glow        a five-layer text-shadow on the stage name, plus keyframes on
 *               4 skus
 *               (which is why the lazy gate matters more than it used to: a
 *               keyframed text-shadow repaints forever whether or not anyone
 *               can see it, and four of them mount in one section)
 *   background  up to four photographic decodes per card
 *   marker      the first visible one resolves the thumbnail URL set
 * Emotes are one glyph and passes are one number; gating those would cost more
 * than it saves.
 */
const LAZY_PREVIEW = {
  glow: true,
  background: true,
  marker: true,
};

/**
 * Glow props are pure functions of (sku, surface), so they are computed once
 * per sku for the life of the page rather than on every card render. This is
 * the "derive preview styles outside the render loop" rule: the storefront
 * re-renders on every balance change and these must not be rebuilt each time.
 *
 * THE CACHE ITSELF MOVED. It used to be a private Map in this file, which was
 * fine while the shop was the only surface rendering glows at list scale — it
 * is not any more (the chat log and the leaderboards do too), so it lives in
 * components/utils/usernameWithFlag.js as cachedNameGlowProps and everybody
 * shares one table instead of growing one each.
 *
 * The BASELINE card's sku is null, and cachedNameGlowProps(null) is null — so
 * the Default glow preview needs no special case at all: it renders the same
 * name on the same stage with no shadow, which is exactly the plain white name
 * the game ships. That is the whole product of that card.
 */
function GlowPreview({ sku, username }) {
  // One surface is previewed, so one surface is asked for. GLOW_LIGHT is still
  // a live surface everywhere else in the app — it is simply not a shop stage.
  // ownBox: the stage's name is a real element that owns its own truncation, so
  // the glow contributes a shadow and (for the animated tier) its keyframes —
  // never a display, never a width. The 34px of clip relief that keeps the halo
  // out of .shopPrev__name's `overflow: hidden` comes from wg-name-clip, which
  // is on the element whether or not this card's sku is a glow at all.
  const glow = cachedNameGlowProps(sku, GLOW_DARK, { ownBox: true });
  const name = username || SAMPLE_NAME;

  return (
    <div className="shopPrev shopPrev--glow">
      {/* The name is the only thing on the stage, centred in the whole of it,
          with every remaining pixel of stage height as halo clearance. */}
      <span
        className={`shopPrev__name wg-name-clip ${glow?.className || ''}`.trim()}
        style={glow?.style}
      >
        {name}
      </span>
    </div>
  );
}

function BackgroundPreview({ item }) {
  // Exactly one image, always: the baseline card shows the stock background
  // pages/_document.js bakes in (see lib/siteBackground.js), every other card
  // shows its own. The multi-image mosaic branch here went with the bundles.
  const path = item.isDefault ? DEFAULT_BACKGROUND_PATH : item.path;

  if (!path) return <div className="shopPrev shopPrev--empty" />;

  return (
    <div className="shopPrev shopPrev--bg">
      <img
        src={asset(path)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

function MarkerPreview({ item, markerUrls }) {
  // The baseline pin is the stock one the map falls back to, pulled out of the
  // SAME icon set the skins come from (see markerPins.js) — so this card costs
  // no second import and previews the literal pin the player gets back.
  const url = markerUrls?.[item.isDefault ? STOCK_PIN_KEY : item.sku];
  // ONE DARK PLATE, like every other preview in this storefront. This used to be
  // a pale map-coloured wash on the argument that a pin is judged on the map. It
  // is the only light plate left after the "on light" stage came out, and one
  // odd pale rectangle in a page of black stages reads as a mistake — the pins
  // are saturated, full-colour icons with their own drop shadow and they carry
  // perfectly well on black.
  return (
    <div className="shopPrev shopPrev--marker">
      {/* 76x90 renders the ART at the same ~44x72 it was shown at before the
          canvas grew: pin PNGs are 151x163 with the 87x131 art inside glow
          headroom (lib/markerIcons.js), so the box scales by canvas/art on
          each axis — and any glow painted in the headroom shows on the card. */}
      {url ? <img src={url} alt="" width={76} height={90} draggable={false} /> : <div className="shopPrev__pinFallback" />}
    </div>
  );
}

function EmotePreview({ glyph, fx }) {
  return (
    <div className="shopPrev shopPrev--emote">
      {/* THE EFFECT IS THE PRODUCT PHOTO for the one emote that has one. It is
          the same class the wheel cell and the in-game reaction use (see the
          `fx` note in shared/emotes/catalog.js), so what you are shown on the
          card is literally what you get in a duel — a shop that previews a
          cosmetic in a look it does not actually have is worse than one that
          previews nothing. */}
      <span className={`shopPrev__glyph ${fx ? `emoteFx--${fx}` : ''}`.trim()}>{glyph || '🙂'}</span>
    </div>
  );
}

/*
 * THE ONE CARD ON THE SHELF WITH A STATE, and it used to be the one card that
 * never said so. A pass is bought, runs for twenty minutes and lapses; the only
 * thing that ever showed it was running was a chip in the storefront's rail —
 * off to the side of the card you actually pressed, and gone entirely the
 * moment the modal closed. "I bought it, did anything happen?" was the
 * predictable result, and it is the reason this card now answers for itself.
 *
 * THE COUNTDOWN REPLACES THE DAILY CAP RATHER THAN JOINING IT. The well is a
 * three-line stack in a fixed-height stage; a fourth line pushes the grid row.
 * Both lines are about the same thing and only one is ever the live answer:
 * while a pass runs, how long is left outranks how many more you may buy today,
 * and the cap comes straight back the second it lapses (it is also what the
 * refusal says if you hit it).
 */
function PassPreview({ item, text, adFreeDailyCap, adFreeMsLeft }) {
  const minutes = Math.max(1, Math.round((item.durationMs || 0) / 60000));
  const running = adFreeMsLeft > 0;
  return (
    <div className={`shopPrev shopPrev--pass ${running ? 'shopPrev--passOn' : ''}`.trim()}>
      <div className="shopPrev__passValue">{minutes}</div>
      <div className="shopPrev__passUnit">{text('shopPassMinutes')}</div>
      {running ? (
        // role="status" so the flip from "3 per day" to a running clock is
        // announced once, on the press that caused it, rather than being a
        // silent change to a screen reader — the same reason the failure line
        // under the button carries one.
        <div className="shopPrev__passLive" role="status">
          {text('shopPassActiveFor', { time: formatCountdown(adFreeMsLeft) })}
        </div>
      ) : (
        <div className="shopPrev__passCap">{text('shopPassDailyCap', { count: adFreeDailyCap })}</div>
      )}
    </div>
  );
}

function renderBody({ item, username, markerUrls, text, adFreeDailyCap, adFreeMsLeft }) {
  switch (item.type) {
    case 'glow':
      return <GlowPreview sku={item.sku} username={username} />;
    case 'background':
      return <BackgroundPreview item={item} />;
    case 'marker':
      return <MarkerPreview item={item} markerUrls={markerUrls} />;
    // THE GLYPH RIDES THE ITEM. It used to be looked up from a sku -> glyph map
    // threaded down from the storefront, which cannot work for the free emotes
    // that now share this grid: a free emote has no sku, because there is
    // nothing to buy. One field on the item, no map, no prop.
    case 'emote':
      return <EmotePreview glyph={item.glyph} fx={item.fx} />;
    case 'pass':
      return <PassPreview item={item} text={text} adFreeDailyCap={adFreeDailyCap} adFreeMsLeft={adFreeMsLeft} />;
    default:
      return null;
  }
}

function ItemPreview(props) {
  const { item, onNear } = props;
  const [slotRef, near] = useNearViewport(LAZY_PREVIEW[item.type] === true);

  // Tells the storefront a preview of this type is now on its way in. Only the
  // marker section acts on it — that is where the preview URLs are resolved,
  // once for the whole page rather than once per card (loadMarkerSkinUrls is
  // itself memoised, so this is belt and braces).
  useEffect(() => {
    if (near && onNear) onNear(item.type);
  }, [near, onNear, item.type]);

  return (
    <div ref={slotRef} className={`shopPrevSlot shopPrevSlot--${item.type}`}>
      {near
        ? renderBody(props)
        // Same box as the real preview — ONE stage shape for every category, so
        // the placeholder cannot disagree with what lands in it and nothing
        // reflows under the thumb mid-scroll.
        : <div className="shopPrev shopPrev--skeleton" aria-hidden="true" />}
    </div>
  );
}

export default memo(ItemPreview);
