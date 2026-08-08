import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ItemPreview from './ItemPreview';
import StampMark from './StampMark';
import EmoteWheel from './EmoteWheel';
import CountryFlag from '../utils/countryFlag';
import { formatCountdown } from '@/lib/adFree';
import { loadMarkerSkinUrls } from './markerPins';
// The house compact formatter, already used by the map tiles: exact under 1,000,
// then 1.1K / 12K / 343K. Not a second one written for this card — mobile calls
// its own mirror of it (formatCompact) on the same field for the same reason.
import formatCompact from '@/components/utils/fmtNumber';
import {
  ADFREE_DAILY_CAP,
  CATEGORY_DESC_KEY,
  CATEGORY_LABEL_KEY,
  CATEGORY_ORDER,
  DEFAULT_ITEMS,
  SLOT_FOR_TYPE,
  entitlementsFrom,
  errorKeyFor,
  mintPurchaseKey,
  slotBusyKey,
} from './stampShopClient';
// THE BAR MODEL, SHARED WITH THE SERVER AND WITH MOBILE. Nothing in this file
// decides what a bar is, what fits in one, what an empty one means, or what
// putting an emote in a cell does — that is four surfaces' worth of drift
// waiting to happen, and it already happened once.
import {
  EMOTE_CATALOG,
  MAX_EMOTE_BAR,
  clearEmoteAt,
  resolveEmoteBar,
  setEmoteAt,
  toEmoteBarIds,
} from '@/shared/emotes/catalog';

/**
 * How long a bought card celebrates. Must OUTLAST the longest animation
 * .shopCard--won triggers in styles/shop.css (the 1400ms sweep) with enough
 * left over to read the ribbon, and must stay short enough that a shopper
 * buying two things in a row is not waiting on it. Moved 1600 -> 2100 with the
 * sweep: at 1600 the slower shine was still running when the class came off.
 */
const WON_MS = 2100;

/**
 * How long a failure sits on the card that caused it. Long enough to read a
 * short sentence twice, short enough that it is gone before anyone comes back
 * to press again. Also cleared early by the next press.
 */
const FAIL_MS = 4200;

/**
 * How long the header's balance takes to count down to the new figure. Long
 * enough to see the digits move and register the amount, short enough that the
 * true balance is on screen before anyone reaches for a second card.
 */
const SPEND_COUNT_MS = 620;

/**
 * The confetti burst, hand-placed rather than randomised.
 *
 * WHY NOT Math.random(): a burst generated in render is a different burst on
 * every re-render of the celebrating card, and this component re-renders during
 * the celebration (the balance lands, the card flips to Equip). A fixed table
 * plays the same burst from first frame to last, costs nothing, and reads as
 * organic anyway because the spread was tuned by eye rather than by a uniform
 * distribution — real confetti is lopsided.
 *
 * WHY NOT A LIBRARY: canvas-confetti and friends are 5-10kB for one 1.1s
 * animation on one surface, and this ships inside the modal bundle that the
 * home screen already pays for. Two spans and a keyframe do the same job.
 *
 * x/y are the END offsets in px from the burst origin, r the final rotation,
 * d the launch delay in ms, and c the colour class suffix. y is mostly POSITIVE
 * because the pieces fall: the outer element carries x on a decelerating ease
 * and the inner carries y on a gravity-ish one, which is what bends the
 * straight line into an arc.
 */
const CONFETTI = [
  { x: -74, y: 54, r: -320, d: 0, c: 'gold' },
  { x: -58, y: -46, r: 210, d: 40, c: 'pale' },
  { x: -44, y: 72, r: 260, d: 90, c: 'green' },
  { x: -30, y: -62, r: -180, d: 20, c: 'gold' },
  { x: -18, y: 84, r: 340, d: 130, c: 'white' },
  { x: -8, y: -74, r: -240, d: 60, c: 'gold' },
  { x: 6, y: 78, r: 190, d: 10, c: 'pale' },
  { x: 16, y: -68, r: 300, d: 110, c: 'green' },
  { x: 28, y: 66, r: -270, d: 50, c: 'gold' },
  { x: 40, y: -52, r: 230, d: 150, c: 'white' },
  { x: 52, y: 80, r: -200, d: 30, c: 'pale' },
  { x: 66, y: -40, r: 310, d: 100, c: 'gold' },
  { x: 78, y: 60, r: -350, d: 70, c: 'green' },
  { x: 90, y: 26, r: 170, d: 140, c: 'gold' },
  { x: -88, y: 18, r: -230, d: 120, c: 'pale' },
  { x: 2, y: 96, r: 280, d: 170, c: 'gold' },
];

/**
 * The burst itself. Rendered ONLY while a card is celebrating, so it is 16
 * elements for ~1.2s once per purchase and nothing at all the rest of the time.
 *
 * CONTAINED BY THE CARD ON PURPOSE. .shopCard is overflow:hidden and stays that
 * way — turning it visible for the celebration would let the preview's square
 * corners poke past the card's 16px radius for the duration, which is a glitch
 * nobody asked for. The pieces are tuned to fade before they reach the edges,
 * so the clip is never the thing you see.
 */
function Confetti() {
  return (
    <span className="shopCard__confetti" aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          className="shopCard__confettiPiece"
          style={{ '--cx': `${p.x}px`, '--cd': `${p.d}ms` }}
        >
          <i
            className={`shopCard__confettiBit shopCard__confettiBit--${p.c}`}
            style={{ '--cy': `${p.y}px`, '--cr': `${p.r}deg`, '--cd': `${p.d}ms` }}
          />
        </span>
      ))}
    </span>
  );
}

/* ===========================================================================
 *  THE STOREFRONT — ONE PAGE, NO TABS.
 *
 *  Every category is mounted, all the time, stacked under its own heading and
 *  reached by scrolling. There is no selected-category state anywhere in this
 *  file: a shop you have to click around to see the stock of is a shop that
 *  hides four fifths of its stock. Categories the server sent nothing for are
 *  omitted outright rather than rendered as an empty heading.
 *
 *  IT SCROLLS IN THE MODAL'S CONTAINER, NOT ITS OWN. ShopModal.js hands this
 *  page straight to components/ui/Modal, whose .modal-content is already the
 *  single `overflow-y: auto` box — so this file introduces no scroll container
 *  of its own, and neither may anything inside it. That is the modal-scroll
 *  rule in this repo: a SECOND nested overflow:auto inside a modal goes dead on
 *  iOS outright, which is the same reason every react-responsive-modal here
 *  runs with blockScroll={false} (its body-scroll-lock preventDefaults every
 *  touchmove on iOS). Because .shop is a DIRECT child of the real scroller and
 *  is a plain grid, position: sticky on the rail inside it needs no help — the
 *  `:has()` overflow workaround this file used to need while it was borrowing
 *  .account-modal-body is gone.
 *
 *  THE PAGE IS TWO COLUMNS: a STICKY RAIL (.shopRail — the wallet, a running
 *  ad-free pass, and the section list with its counts) and the goods
 *  (.shopMain). On a phone the same markup lays out as a bar across the top;
 *  there is no second component and no JS breakpoint, only CSS. Every section
 *  stays mounted and reachable by plain scrolling either way: the list is a
 *  shortcut, never a filter.
 *
 *  PERFORMANCE IS THE REASON FOR MOST OF WHAT LOOKS FUSSY BELOW. ~45 cards are
 *  live at once on phones that struggle with far less:
 *    - ShopCard is memo'd and every prop handed to it is referentially stable,
 *      including the translator. Hover is CSS only, so pointing at a card
 *      renders nothing.
 *    - AFFORDABILITY IS PASSED PRE-COMPUTED, not the raw balance. Handing all
 *      45 cards `stamps` means all 45 re-render every time the balance moves.
 *      `affordable` is a boolean and is stable for everything the user could
 *      already afford, so a purchase only re-renders the cards that actually
 *      crossed the line — plus the one card celebrating (`celebrate`).
 *    - Heavy previews mount near-viewport behind a same-size placeholder
 *      (lazyMount.js), so the glow keyframes and the background decodes are
 *      not all paid for on open.
 *    - The leaflet import behind marker pins fires ONCE, from the first marker
 *      preview that comes into range.
 *    - The ad-free countdown is still ONE interval, owned by useStampShop and
 *      rendered here in the sticky bar (which never scrolls away). Nothing in
 *      this file adds a timer, and the chip is only in the DOM while a pass is
 *      actually running.
 *
 *  BUY AND EQUIP ARE ONE FEATURE. A shop that only takes money is half a shop;
 *  every owned item equips on click and the preview above it updates on the
 *  same frame (useStampShop paints optimistically and reconciles with the
 *  server's entitlement block).
 *
 *  AND UNEQUIP IS PART OF EQUIP. Every slot-backed section opens with a DEFAULT
 *  card — the same ShopCard as everything else, with a null sku: no price, no
 *  buy, always available, sending `sku: null` down the existing equip path. It
 *  carries the state nothing used to own, which makes the rule readable at a
 *  glance:
 *
 *      EXACTLY ONE CARD PER CATEGORY IS EQUIPPED, ALWAYS.
 *      Default is equipped when the slot is null; a real card is equipped when
 *      the slot holds its sku. The two conditions are mutually exclusive and
 *      jointly exhaustive by construction — there is no third branch and no
 *      state where the section goes blank.
 *
 *  Emotes are the exception and get a RESET on the bar instead of a card,
 *  because they are an arrangement rather than a slot; passes are consumables
 *  and get neither. Both are argued where they are implemented.
 * ======================================================================== */

/** Locale-aware integer, with a hard fallback — this never throws in a card. */
function fmt(value, lang) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  try {
    return n.toLocaleString(lang || 'en');
  } catch (e) {
    return String(n);
  }
}

/** Small inline stamp mark for price rows. Matches the wallet's currency mark. */
// The currency mark is shared, not redrawn here: this file used to carry its
// own dotted-square version that shop.css then had to paint over to match the
// wallet. One drawing, imported everywhere. See components/shop/StampMark.js.
function PriceMark({ className = 'shopCard__mark' }) {
  return <StampMark className={className} />;
}

/* --------------------------------------------------------------------------
 *  THE RAIL: wallet, running pass, section list.
 *
 *  A COLUMN BESIDE THE GOODS, not a strip above them. It used to be one sticky
 *  line carrying the balance on the left and five jump chips on the right,
 *  space-between — a wallet and a navigation bar sharing a row, so the balance
 *  was 1.1rem of plain text with no more presence than a button label, on the
 *  one screen in this game whose entire subject is that number. The rail gives
 *  each job its own object: the balance is the .timer HUD pill (the same recipe
 *  the round timer, the league button and the account modal's balance wear), and
 *  the sections are a list with their counts.
 *
 *  Owns its own "which section am I looking at" state so a scroll never
 *  re-renders the storefront — the observer callback fires many times a second
 *  during a flick, and pushing that into ShopView would walk all 45 memo
 *  boundaries each time for a highlight that only affects five rows.
 *
 *  It is stuck to the top of components/ui/Modal's .modal-content, which is the
 *  modal's one and only scroller. Nothing between this element and that box may
 *  introduce overflow, or sticky silently stops sticking.
 * ----------------------------------------------------------------------- */
/**
 * Counts the header balance DOWN to a new figure and reports what was spent.
 *
 * WHY IT IS WORTH A rAF LOOP. Stamps are ground for, and the number changing
 * between two paints is the one moment the price is felt. A jump-cut from
 * 4,120 to 3,220 reads as a data refresh; the same 900 rolling off over half a
 * second reads as paying for something.
 *
 * ONLY DOWNWARD. Income arrives from anywhere (a game just ended, a grant
 * landed) and rolling UP would animate events that have nothing to do with the
 * shop, on a bar that is on screen the whole time. A rise snaps.
 *
 * Returns [ref, spent, spendKey]. `spent` drives the −N chip and `spendKey`
 * re-arms its CSS animation for a second purchase of the same price.
 */
function useSpendCounter(stamps, lang) {
  const valueRef = useRef(null);
  const prevRef = useRef(null);
  const [spend, setSpend] = useState({ amount: 0, key: 0 });

  useEffect(() => {
    const to = Number(stamps ?? 0);
    const from = prevRef.current;
    prevRef.current = to;

    const el = valueRef.current;
    // First paint, a rise, or no element: land on the figure. React has already
    // rendered the correct text, so there is nothing to write.
    if (!el || from === null || !Number.isFinite(from) || to >= from) return undefined;

    setSpend((s) => ({ amount: from - to, key: s.key + 1 }));

    let raf = 0;
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / SPEND_COUNT_MS);
      // easeOutCubic: most of the distance early, so the number settles rather
      // than crawling the last few digits.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(from + (to - from) * eased), lang);
      if (t < 1) raf = requestAnimationFrame(step);
    };

    let reduced = false;
    try {
      reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { /* assume motion is fine */ }
    if (reduced) {
      el.textContent = fmt(to, lang);
    } else {
      raf = requestAnimationFrame(step);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      // Whatever happens, the DOM must not be left holding a mid-count number:
      // React thinks this node already reads `to` and will not correct it.
      // `el`, not valueRef.current — this must land on the node the loop was
      // writing to, which is the one that could be stranded mid-count.
      el.textContent = fmt(to, lang);
    };
  }, [stamps, lang]);

  // Retires the −N chip. Slightly longer than its CSS animation so it is gone
  // from the DOM rather than sitting there at opacity 0.
  useEffect(() => {
    if (!spend.amount) return undefined;
    const id = setTimeout(() => setSpend((s) => ({ amount: 0, key: s.key })), 1100);
    return () => clearTimeout(id);
  }, [spend]);

  return [valueRef, spend.amount, spend.key];
}

/**
 * The id `aria-describedby` on the balance points at. A module constant rather
 * than useId: there is exactly one rail on screen, so a generated id would only
 * buy uniqueness against a second copy that cannot exist.
 */
const WALLET_HOW_ID = 'shopWalletHow';

const ShopRail = memo(function ShopRail({
  sections, sectionEls, signedIn, stamps, adFreeMsLeft, text, lang,
}) {
  const [active, setActive] = useState(null);
  const [valueRef, spent, spendKey] = useSpendCounter(stamps, lang);

  // A primitive so the effect below re-arms when the section LIST changes
  // (catalogue arrives) and not merely when its array identity does.
  const sectionKeys = sections.map((s) => s.type).join('|');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      return undefined;
    }
    const types = sectionKeys ? sectionKeys.split('|') : [];
    if (!types.length) return undefined;

    // The shop scrolls inside the modal's own .modal-content box, NOT the page.
    // An observer left on the default root measures against the VIEWPORT, so
    // every section reads as "intersecting" the whole time the modal is open and
    // the highlight never advances. Resolve the actual scrolling ancestor and
    // observe against that; rootMargin percentages are then relative to the
    // scroller's height, which is what the band below assumes.
    const firstEl = sectionEls.current.get(types[0]);
    let root = null;
    for (let node = firstEl?.parentElement; node; node = node.parentElement) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') { root = node; break; }
    }

    // A narrow band just under the sticky bar. Whichever section is crossing it
    // is the one being read, which is what the highlight should say.
    const visible = new Set();
    const typeOf = new Map();
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const type = typeOf.get(entry.target);
        if (!type) return;
        if (entry.isIntersecting) visible.add(type);
        else visible.delete(type);
      });
      // Fall back to the last section that scrolled past the band rather than
      // clearing the highlight: at the very bottom of a long page a short final
      // section can sit entirely below the band, and a chip row that blanks out
      // there looks broken.
      setActive((prev) => types.find((type) => visible.has(type)) || prev);
    }, { root, rootMargin: '-12% 0px -68% 0px', threshold: 0 });

    types.forEach((type) => {
      const el = sectionEls.current.get(type);
      if (!el) return;
      typeOf.set(el, type);
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sectionKeys, sectionEls]);

  const jumpTo = useCallback((type) => {
    const el = sectionEls.current.get(type);
    if (!el || typeof el.scrollIntoView !== 'function') return;
    // scrollIntoView walks every scrollable ancestor, so it finds .modal-content
    // on its own — no hard-coded container reference to go stale. The landing
    // offset is .shopSection's scroll-margin-top, which clears this bar.
    let smooth = true;
    try {
      smooth = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { /* assume motion is fine */ }
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start', inline: 'nearest' });
    // Paint the highlight now rather than waiting for the scroll to settle.
    setActive(type);
  }, [sectionEls]);

  let balance = '0';
  try {
    balance = Number(stamps ?? 0).toLocaleString(lang || 'en');
  } catch (e) { /* the raw string is a fine fallback */ }

  return (
    <aside className="shopRail">
      {signedIn && (
        // A <div>, not the <p> this was. It stopped being a paragraph of prose
        // the moment it grew a flying spend chip and a tooltip: it is a flex
        // container of chrome, and it now owns a description and a tab stop.
        //
        // tabIndex + aria-describedby are what stop this being a mouse-only
        // fact. The pill is not a control and must not become one (there is
        // nothing to press), but a tab stop makes the description reachable from
        // the keyboard, and a tap focuses it on touch — which is the only reason
        // this works at all on a phone, where nothing hovers.
        <div
          className="shopWallet"
          tabIndex={0}
          aria-describedby={WALLET_HOW_ID}
        >
          <PriceMark className="shopWallet__mark" />
          <span className="shopWallet__figures">
            {/* THE DIGITS ARE WRITTEN BY THE rAF LOOP, NOT RE-RENDERED. The
                JSX child below is the true balance and stays the source of
                truth; useSpendCounter only overwrites textContent while a
                count is in flight, and a stray re-render mid-count (the
                ad-free chip ticks every second) is corrected on the next
                frame. Counting via state would re-render this whole rail
                ~37 times per purchase. */}
            <span className="shopWallet__value" ref={valueRef}>{balance}</span>
            {/* The unit is never display:none'd, only visually hidden on narrow
                screens (see shop.css) — a bare number with no currency beside
                it is meaningless to a screen reader. */}
            <span className="shopWallet__unit">{text('shopStampsUnit')}</span>
          </span>
          {/* The amount that just left, flying off the pill. This is the beat
              the old green sentence was standing in for. */}
          {spent > 0 && (
            <span key={spendKey} className="shopWallet__spend" aria-hidden="true">
              −{fmt(spent, lang)}
            </span>
          )}

          {/* WHERE STAMPS COME FROM, on the number that spends them.
              "Ranked duels only" is the single most asked question about this
              currency, and the storefront was the one surface that never
              answered it: the explanation lived in the account modal's wallet
              popover, three clicks away on a different screen, which is not
              where anyone is standing when they wonder why the figure is not
              going up.

              THE SAME TWO STRINGS THAT POPOVER USES — shopStampsHowTitle and
              shopStampsHowBody. Not a second wording of the same rule: the day
              Stamps start dropping from anything else, there is one sentence to
              change and it is already shared with components/shop/StampsWallet.js.

              CSS-only reveal (see .shopWallet__how in shop.css). No state, no
              listener, no re-render — this rail's balance is written by a rAF
              loop mid-purchase and a hover that re-rendered it would fight
              that. */}
          <span className="shopWallet__how" id={WALLET_HOW_ID} role="tooltip">
            <strong className="shopWallet__howTitle">{text('shopStampsHowTitle')}</strong>
            <span className="shopWallet__howBody">{text('shopStampsHowBody')}</span>
          </span>
        </div>
      )}

      {sections.length > 1 && (
        <nav className="shopNav" aria-label={text('shopJumpTo')}>
          {sections.map((section) => (
            <button
              key={section.type}
              type="button"
              className={`shopNav__item ${section.type === active ? 'shopNav__item--here' : ''}`}
              aria-current={section.type === active ? 'true' : undefined}
              onClick={() => jumpTo(section.type)}
            >
              {section.label}
              {/* HOW MUCH IS DOWN THERE, which is the fact the old chip row had
                  no room for and the thing that decides whether a shelf is worth
                  the scroll. aria-hidden because the label already names the
                  destination and a screen reader announcing "Glows 12" as one
                  button label reads as a price. */}
              <span className="shopNav__count" aria-hidden="true">{section.count}</span>
            </button>
          ))}
        </nav>
      )}

      {/* THERE IS NO MESSAGE SLOT HERE, IN EITHER DIRECTION.
          A green "X is yours" and a red "daily limit reached" both used to
          appear on this bar, which meant the best thing in the shop and the
          worst looked like the same event, and both of them arrived nowhere
          near the card that caused them. Wins are told by the card (gold sweep,
          confetti) and by the balance above; refusals are told by the card too
          (.shopCard__fail). This rail is a wallet and a set of shortcuts, and
          nothing else. */}
    </aside>
  );
});

/* --------------------------------------------------------------------------
 *  EMOTES GET A WHEEL, NOT A DEFAULT CARD. Every other category writes a SLOT,
 *  so "no cosmetic" is a card in the grid that can sit beside the ones you can
 *  buy. Emotes are not a slot: owning one is enough to fire it, and what the
 *  shop edits is the ARRANGEMENT of the in-game picker
 *  (`cosmetics.emoteOrder`). A "Default" tile among the emotes would therefore
 *  be a lie, and restoring the stock arrangement is one write of `[]` that
 *  belongs on the thing it resets.
 *
 *  The arrangement lives in EmoteWheel.js, which argues its own design. What
 *  matters HERE is what left this file with it: the pointer-capture drag, the
 *  6px slop threshold, the tap-to-remove, and the emote branch of ShopCard's
 *  action with its two-labels-one-button hover swap. The shelf sells; the wheel
 *  arranges; neither does the other's job any more.
 * ----------------------------------------------------------------------- */

/**
 * The identifier a card is keyed, locked and blamed by.
 *
 * A FREE EMOTE HAS NO SKU — there is nothing to buy — so the sku cannot be any
 * of those three things for it. Scoping a failure to `item.sku` would put one
 * refusal on EVERY free emote card at once (`null === null` for all eight), and
 * a busy key of null would lock nothing. One function, used everywhere the
 * question is asked, so those three can never answer it differently.
 */
function cardKey(item) {
  return item.sku || `emote:${item.emoteId}`;
}

/* --------------------------------------------------------------------------
 *  CARD — ONE SHAPE FOR EVERYTHING ON THE SHELF.
 *
 *  A stage, a name, and ONE action. That is the entire card, for every category
 *  and for the baseline alike, and the rule that keeps it clean is that each
 *  fact is stated EXACTLY ONCE:
 *
 *    the price     IS the buy button. There is no price row above the button
 *                  repeating the same number — that shipped, and a card that
 *                  prints "250" twice is how a storefront starts reading as
 *                  generated. A sale strikes the old number through beside the
 *                  new one, inside that same button.
 *    ownership     is the button too: a card you own says Equip / Equipped /
 *                  In bar where a price would be. The corner "Owned" ribbon
 *                  that said it a second time is gone, and so is the "Sale"
 *                  ribbon that duplicated the struck price.
 *    "this moves"  is the chip on the glow stage, where the movement actually
 *                  is. It used to ALSO be a word in the price row.
 *    what it is    is the preview. Not a line of copy underneath describing the
 *                  picture in worse words: no sku blurb, no baseline note.
 *
 *  THE BASELINE IS THIS CARD, NOT A SECOND COMPONENT. It was a near-copy with
 *  its own memo, its own note line and its own equip handler. All it actually
 *  is, is a card whose sku is null: same shape, same grid cell, same equip
 *  path, differing by exactly two things — a quieter frame, and an action that
 *  only ever writes null. ShopView renders it first in each slot-backed
 *  section, which is the only reason it leads.
 *
 *    - NO price and NO buy, not even a zero. "Free" implies a transaction and
 *      there is nothing here to acquire: everybody already has this.
 *    - IT STILL GOES GREEN WHEN IT IS THE ONE YOU ARE WEARING, because that is
 *      the invariant the section turns on — EXACTLY ONE card per category reads
 *      as equipped, and "nothing equipped" had no card to own it before.
 *    - EQUIPPED IS THE SLOT BEING NULL, signed in or not. A signed-out visitor
 *      genuinely is wearing the baseline, so the card says so instead of nagging
 *      them to sign in for something that costs nothing.
 *
 *  MEMOISED, and every prop is referentially stable — handlers are refs-backed
 *  useCallbacks and the translator is the stable wrapper. AFFORDABILITY ARRIVES
 *  PRE-COMPUTED rather than as the balance, so a purchase only re-renders the
 *  cards that actually crossed the affordability line, plus the one card whose
 *  `celebrate` flipped.
 * ----------------------------------------------------------------------- */
const ShopCard = memo(function ShopCard({
  item,
  owned,
  equipped,
  inBar,
  affordable,
  celebrate,
  busy,
  signedIn,
  username,
  markerUrls,
  purchases,
  adFreeMsLeft,
  failMessage,
  text,
  lang,
  onBuy,
  onEquip,
  onToggleEmote,
  onPreviewNear,
}) {
  // A pass is a consumable: owning one before does not stop you buying another,
  // and there is nothing to equip. Everything else is buy-once, equip-forever.
  const consumable = item.type === 'pass';

  let action;
  if (item.isDefault) {
    action = (
      <button
        type="button"
        // --equip and --on are mutually exclusive rather than layered, so the
        // solid blue (act) and the soft blue (state) never fight on specificity.
        className={`shopCard__btn ${equipped ? 'shopCard__btn--on' : 'shopCard__btn--equip'}`}
        onClick={() => onEquip(item)}
        // Nothing to toggle off: a real card's Equipped press unequips and
        // lands here, but pressing Equipped HERE would send the same null
        // twice. Disabled, and shop.css keeps it at full opacity so the state
        // still reads as "on" rather than as "unavailable".
        disabled={busy || equipped || !signedIn}
      >
        {equipped ? text('shopEquipped') : text('shopEquip')}
      </button>
    );
  } else if (!signedIn) {
    action = <button type="button" className="shopCard__btn" disabled>{text('shopSignInRequired')}</button>;
  } else if (owned && !consumable) {
    // AN OWNED EMOTE CARD IS ONE BIG BUTTON, and the label below is the sign on
    // it rather than the control itself.
    //
    // THE HIT AREA IS THE WHOLE CARD (.shopCard__hit, stretched over it in
    // shop.css). Clicking a picture of an emote to get that emote is the thing
    // everybody tries first; making them find a 90px pill underneath it was the
    // shop asking them to aim. One real <button> does it, so this stays
    // keyboard-reachable and screen-reader-labelled — the pill inside is
    // aria-hidden decoration.
    //
    // TWO STATES, ONE VERB EACH: not on the wheel says ＋ Add, on the wheel says
    // a tick, and hovering the tick says Remove in red (the same red the wheel
    // cell uses for the same act). Nothing is disabled except an in-flight
    // write: a full wheel and a last-emote refusal are answered on the card
    // itself by toggleEmote, because you should be allowed to press the thing
    // and be told why, not left guessing at a dead tile.
    if (item.type === 'emote') {
      action = (
        <>
          <button
            type="button"
            className="shopCard__hit"
            onClick={() => onToggleEmote(item)}
            disabled={busy}
            aria-pressed={inBar}
            aria-label={`${item.name} — ${inBar ? text('shopEmoteRemove') : text('shopEmoteAdd')}`}
          />
          <span
            className={`shopCard__tag ${inBar ? 'shopCard__tag--on' : 'shopCard__tag--add'}`}
            aria-hidden="true"
          >
            {inBar ? (
              <>
                <span className="shopCard__tagRest">✓ {text('shopEmoteOnWheel')}</span>
                <span className="shopCard__tagAlt">{text('shopEmoteRemove')}</span>
              </>
            ) : (
              <>＋ {text('shopEmoteAdd')}</>
            )}
          </span>
        </>
      );
    } else if (SLOT_FOR_TYPE[item.type]) {
      action = (
        <button
          type="button"
          className={`shopCard__btn ${equipped ? 'shopCard__btn--on' : 'shopCard__btn--equip'}`}
          onClick={() => onEquip(item)}
          disabled={busy}
        >
          {equipped ? text('shopEquipped') : text('shopEquip')}
        </button>
      );
    } else {
      action = <span className="shopCard__ownedTag">{text('shopOwned')}</span>;
    }
  } else {
    action = (
      <button
        type="button"
        className="shopCard__btn shopCard__btn--buy"
        onClick={() => onBuy(item)}
        // In-flight lockout. Every press mints its own idempotency key, so two
        // presses would be two DIFFERENT keys and therefore two real charges.
        disabled={busy || !affordable}
      >
        {/* THE PRICE NEVER CHANGES, AFFORDABLE OR NOT. This used to swap itself
            for "Need 240 more" the moment you could not pay, which turned a
            price tag into a scold and hid the one number the shopper is
            comparing across cards. Unaffordable is carried entirely by the
            chrome now: the button drops its green and stops taking presses
            (see .shopCard__btn--buy:disabled in styles/shop.css). */}
        <PriceMark />
        {fmt(item.price, lang)}
        {/* The sale, said once and said here: the number you pay, with the
            number you would have paid struck through beside it. */}
        {item.onSale && <s className="shopCard__was">{fmt(item.basePrice, lang)}</s>}
      </button>
    );
  }

  return (
    <article
      // IN THE BAR IS AN EMOTE'S "EQUIPPED". Every other shelf turns the green
      // frame on for the one card whose sku is in its slot; emotes have no slot,
      // so without this the one state an emote card actually has never reached
      // the frame — you had to read the button to see where your emotes were.
      className={`shopCard ${item.isDefault ? 'shopCard--default' : ''} ${(equipped || (item.type === 'emote' && inBar)) ? 'shopCard--equipped' : ''} ${celebrate ? 'shopCard--won' : ''} ${failMessage ? 'shopCard--nope' : ''}`}
    >
      {/* THE REWARD LANDS ON THE THING YOU BOUGHT, and it lands WITHOUT WORDS.
          It used to be a green sentence in the sticky bar, which is where a
          form reports a validation error — the wrong shape entirely for the end
          of a grind. There is no ribbon either: the card already goes gold,
          sweeps, and flips its button to Equip, so a label on top of that is
          the third thing saying the same thing. */}
      {celebrate && <Confetti />}

      <ItemPreview
        item={item}
        username={username}
        markerUrls={markerUrls}
        text={text}
        adFreeDailyCap={ADFREE_DAILY_CAP}
        adFreeMsLeft={adFreeMsLeft}
        onNear={onPreviewNear}
      />

      <div className="shopCard__body">
        {/* THE FLAG IS AN IMAGE, NOT AN EMOJI. Regional-indicator pairs have no
            glyph in Segoe UI Emoji, so a flag emoji in the catalogue `name`
            renders as the bare letters "US" on Windows — most of this game's
            desktop players. CountryFlag draws the same flagcdn.com image every
            username on the site already uses. Backgrounds are the only shelf
            that carries `cc`, so every other card is unchanged. */}
        <h3 className="shopCard__name">
          {/* THE ITEM'S OWN NAME WINS, and `shopDefaultName` is the fallback for
              the two baselines that have none. This used to branch on
              `isDefault`, which forced every baseline card to share one label —
              so the stock background could not be called London without the
              stock glow and the stock pin being renamed to it as well. */}
          <span className="shopCard__nameText">{item.name || text('shopDefaultName')}</span>
          {item.cc && <CountryFlag countryCode={item.cc} size={0.82} marginRight="0" />}
        </h3>

        {/* ONE SUBLINE SLOT, TWO THINGS THAT CAN FILL IT — and only ever one at
            a time. It is a line under the name rather than a row of its own, so
            the action below keeps its margin-top: auto and the buttons still
            land on one baseline across a grid row whether or not a given card
            fills it.

            "Default" FILLS IT FOR ANYTHING NOBODY PAID FOR, and that is TWO
            kinds of card, which is the bug this condition fixes:

              isDefault   the synthetic baseline cards the slot-backed shelves
                          get (background, glow, marker). They need the word
                          because their NAME is no longer Default — the stock
                          background is called London — and a card reading
                          "London" with an Equip button and nothing else looks
                          like something you must have bought at some point.
              freeEmote   the stock eight. These are NOT isDefault: they are
                          ordinary catalogue rows that simply have no sku, so
                          they used to fail this test, then fail the buy-count
                          test underneath it, and leave the slot blank — the one
                          shelf where a card could say nothing at all about where
                          it came from. They are the default wheel; they say so.

            HOW MANY PEOPLE BOUGHT THIS fills it for everything else, INCLUDING
            ZERO (owner ruling). It used to hide at nought, on the argument that
            "0 buys" is a sentence about emptiness printed on the one item
            somebody is still deciding whether to want. What that actually bought
            was a shelf where some cards had a subline and some did not for a
            reason nobody could see from the outside — and a missing number reads
            as missing DATA, not as none. Every sku states its count now, and a
            zero is a fact about the item like any other.

            formatCompact(0) is "0" (it short-circuits on falsy), so an absent
            count from an older API renders identically to a real nought — which
            is what it means. */}
        {item.isDefault || item.freeEmote ? (
          <p className="shopCard__buys">{text('shopDefaultName')}</p>
        ) : (
          <p className="shopCard__buys">{text('shopBuys', { n: formatCompact(purchases) })}</p>
        )}

        {action}
      </div>

      {/* AND SO DOES THE REFUSAL. "You have hit today's limit for this pass" is
          about ONE card, and it used to appear in the sticky header — so the
          answer arrived nowhere near the question, and on a long page often off
          screen entirely.

          Laid OVER the action row rather than added under it: growing the card
          by two lines for four seconds would shove every card in the grid row
          down and back. Covering the button is a feature, not a cost — the
          press it is answering is one that must not be repeated yet. */}
      {failMessage && (
        <p className="shopCard__fail" role="status">{failMessage}</p>
      )}
    </article>
  );
});

export default function ShopView({ shop, username, text: rawText, lang }) {
  const {
    enabled, signedIn, stamps, cosmetics, ownedSkus, adFreeMsLeft, catalog, busySku,
    refreshCatalog, purchase, equip, equipEmotes,
  } = shop;

  /**
   * The one failure currently on screen, or null.
   *
   * `scope` is the sku of the card that caused it, or 'emoteOrder' for the
   * wheel, which belongs to the arrangement rather than to any one item. `at` is
   * a sequence number so the same message on the same card re-arms its
   * animation.
   *
   * THERE IS NO GLOBAL NOTICE SLOT ANY MORE. Every failure here is the result of
   * a press, and the press has a location: reporting "daily limit reached" in
   * the sticky header while the pass you pressed sits four screens down is the
   * same mistake the green success banner made. A message about a thing belongs
   * on the thing.
   */
  const [fail, setFail] = useState(null);
  const failSeqRef = useRef(0);
  const [markerUrls, setMarkerUrls] = useState(null);
  // { sku, at } for the card currently celebrating, or null. ONE card at a time:
  // a purchase is a single event and two cards glowing at once would read as a
  // bug. See runPurchase and the WON_MS timer below.
  const [won, setWon] = useState(null);
  // Bumped per purchase so `at` changes even when the SAME sku is bought twice
  // in a row (passes are consumable). Deliberately NOT mintPurchaseKey(): that
  // mints payment idempotency keys and one must never be created for anything
  // that is not an actual charge.
  const wonSeqRef = useRef(0);

  // Refs so every handler below stays referentially stable — the card list is
  // memoised and a fresh callback identity per balance change would blow the
  // whole page away on each purchase.
  const cosmeticsRef = useRef(cosmetics);
  cosmeticsRef.current = cosmetics;

  // The emote GRID, so the wheel's "Get more" tile has somewhere to send you.
  const emoteGridRef = useRef(null);

  // Bumped when a purchase drops an emote on the wheel. The wheel needs nothing
  // more than the bump: it diffs its own cells and animates whatever moved, so
  // this only has to say "a purchase happened, come and look".
  const [landedAt, setLandedAt] = useState(0);

  // useTranslation() rebuilds its `t` on every render, so handing the raw one
  // to the cards would change a prop on every card on every render and make
  // React.memo do precisely nothing. This wrapper is stable for the life of the
  // component and always calls through to the newest translator, so a language
  // switch still lands. Everything below — handlers included — uses this one.
  const textRef = useRef(rawText);
  textRef.current = rawText;
  const text = useCallback((key, vars) => textRef.current(key, vars), []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ONE catalogue fetch per open. This component only exists while the shop
  // modal is open (home.js unmounts ShopModal on close), so closing and
  // re-opening is a genuine refresh — and nothing here fetches per render.
  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  const byType = useMemo(() => {
    const groups = {};
    (catalog.items || []).forEach((item) => {
      (groups[item.type] = groups[item.type] || []).push(item);
    });
    return groups;
  }, [catalog.items]);

  /**
   * THE EMOTE SHELF IS EVERY EMOTE, NOT EVERY PURCHASABLE EMOTE.
   *
   * `catalog.items` is the PRICE LIST, so it holds the twelve you can buy and
   * nothing else — which meant the eight you already have had no card, could not
   * be taken out of the bar and could not be put back. You could arrange twelve
   * of your twenty emotes.
   *
   * IDENTITY COMES FROM THE BUNDLED CATALOGUE, not from the response. The glyph
   * and the name of an emote are static data this bundle already carries (the
   * picker renders from the same table), so reading them off the wire only
   * bought a deploy-skew window in which an older API would have handed back
   * cards with no names on them. What the SERVER is authoritative for is the
   * price and what you own, and that is exactly what is crossed in here.
   *
   * The free entries are real cards with `sku: null` — the same shape the
   * baseline cards use for "there is nothing here to buy" — so the buy branch in
   * ShopCard is unreachable for them without a special case anywhere.
   */
  const emoteItems = useMemo(() => {
    const items = catalog.items || [];
    // Nothing until the catalogue lands. Without this the emote shelf would be
    // the ONE section on screen during the load, built entirely out of local
    // data while every other shelf waits on the network.
    if (!items.length) return [];

    const paidBySku = new Map(items.filter((i) => i.type === 'emote').map((i) => [i.sku, i]));

    return EMOTE_CATALOG
      // A paid emote with no price row was filtered out server-side (disabled,
      // out of window, wrong platform) and must not appear as a card with no way
      // to buy it. It DOES stay if you already own it — a sale ending must not
      // take your emote out of your own shop.
      .filter((emote) => emote.free || paidBySku.has(emote.sku) || ownedSkus.has(emote.sku))
      .map((emote) => {
        const paid = emote.sku ? paidBySku.get(emote.sku) : null;
        return {
          // The paid row carries price/sale/platform; the catalogue entry
          // carries the identity. Never the other way round: the price is
          // server-resolved and must not be reconstructed here.
          ...(paid || { sku: emote.sku || null, type: 'emote', price: 0 }),
          name: paid?.name || emote.name,
          emoteId: emote.id,
          glyph: emote.glyph,
          // The effect id, off the bundled catalogue like the glyph and for the
          // same reason: what an emote LOOKS like is static data this bundle
          // already carries, and reading it off the wire would only buy a
          // deploy-skew window where the shop sells a plain skull.
          fx: emote.fx || null,
          freeEmote: !emote.sku,
        };
      });
  }, [catalog.items, ownedSkus]);

  // Empty categories are dropped entirely, not shown as an empty heading: a
  // section that says "nothing here" is a dead end the server already told us
  // about, and on one long page it is four lines of nothing to scroll past.
  //
  // EMOTES ARE COUNTED OFF THEIR OWN SHELF, not off the price list. Pull the
  // paid twelve for a sale and this section would vanish, taking the bar editor
  // — and therefore every free emote a player has — with it.
  const sectionTypes = useMemo(
    () => CATEGORY_ORDER.filter((type) => (
      type === 'emote' ? emoteItems.length > 0 : (byType[type] || []).length > 0
    )),
    [byType, emoteItems],
  );

  // Labels and shelf sizes for the rail. `lang` is in the deps on purpose:
  // `text` is deliberately stable (see above), so it is the language that has to
  // invalidate this, not the translator's identity.
  //
  // THE COUNT INCLUDES THE DEFAULT CARD, because the count has to describe what
  // you actually land on. It is a real card in a real cell (see the grid below),
  // so a shelf of twelve glows plus the baseline reads 13 or the number is
  // lying about the thing directly under it.
  const navSections = useMemo(
    () => sectionTypes.map((type) => {
      const shelf = type === 'emote' ? emoteItems : (byType[type] || []);
      const hasDefault = !!(SLOT_FOR_TYPE[type] && DEFAULT_ITEMS[type]);
      return {
        type,
        label: text(CATEGORY_LABEL_KEY[type]),
        count: shelf.length + (hasDefault ? 1 : 0),
      };
    }),
    [sectionTypes, byType, emoteItems, text, lang],
  );

  // type -> section element, filled by the ref callback below and read by the
  // sticky header's observer and jump handler. A ref, not state: the header
  // must not re-render the page to learn where the sections are.
  const sectionEls = useRef(new Map());
  const registerSection = useCallback((type, el) => {
    if (el) sectionEls.current.set(type, el);
    else sectionEls.current.delete(type);
  }, []);

  /*
   * THE sku -> glyph MAP IS GONE. It existed so an emote card could look its own
   * glyph up by sku, which stopped working the moment free emotes joined the
   * shelf — they have no sku. Every emote item now CARRIES its glyph (see
   * emoteItems below) and ItemPreview reads it off the item, so the second way
   * of answering the same question, and the prop threaded through two components
   * to deliver it, are both deleted rather than special-cased.
   */


  // Marker pins pull leaflet in, and leaflet is not on the home screen this
  // modal opens over. With no tabs left to hang that off, the trigger is the
  // first marker preview to come within range of the viewport — fired ONCE for
  // the page, not once per card. (loadMarkerSkinUrls memoises its own promise
  // too, so a double call still imports once.)
  const markerRequestedRef = useRef(false);
  const onPreviewNear = useCallback((type) => {
    if (type !== 'marker' || markerRequestedRef.current) return;
    markerRequestedRef.current = true;
    loadMarkerSkinUrls().then((urls) => {
      if (mountedRef.current) setMarkerUrls(urls);
    });
  }, []);

  /**
   * Put a failure on a control. `scope` is a sku or 'emoteBar'.
   *
   * Stable identity (empty deps, seq in a ref) so it can be a dependency of
   * every handler below without changing any of their identities — the card
   * grid is memoised and a fresh handler per render would defeat all 45 of
   * them.
   */
  const showFail = useCallback((scope, message) => {
    failSeqRef.current += 1;
    setFail({ at: failSeqRef.current, scope, message });
  }, []);

  // Retires it. Keyed on `at` so the same message landing twice on the same
  // card restarts the four seconds instead of inheriting the first one's
  // remainder.
  useEffect(() => {
    if (!fail) return undefined;
    const id = setTimeout(() => {
      if (mountedRef.current) setFail(null);
    }, FAIL_MS);
    return () => clearTimeout(id);
  }, [fail]);

  /**
   * Write an arrangement. THE ONE PATH TO cosmetics.emoteOrder ON THIS SCREEN.
   *
   * It takes the wheel AS THE USER SEES IT and hands it to toEmoteBarIds, which
   * drops anything unowned and normalises the stock arrangement back to `[]`.
   * Everything locks and blames 'emoteOrder', because since the shelf stopped
   * carrying an add/remove toggle there is exactly one control that can start
   * one of these writes: the wheel.
   *
   * `from` IS THE INVENTORY TO JUDGE OWNERSHIP AGAINST, and it is a parameter
   * rather than always the ref for one caller: a purchase. The charge resolves
   * inside an await, so React has not re-rendered yet and `cosmeticsRef` still
   * holds the inventory from BEFORE the emote was bought — toEmoteBarIds would
   * then drop the very emote that was just paid for, and the write would land
   * without it. That caller passes the server's post-purchase block instead.
   */
  const writeEmoteBar = useCallback(async (ids, from) => {
    setFail(null);
    const owned = (from || cosmeticsRef.current)?.owned;
    try {
      await equipEmotes(toEmoteBarIds(ids, owned), 'emoteOrder');
    } catch (error) {
      showFail('emoteOrder', text(errorKeyFor(error)));
    }
  }, [equipEmotes, text, showFail]);

  /**
   * THE VISIBLE WHEEL, as ids, read fresh at the moment of an edit.
   *
   * THE SEED IS THE VISIBLE LIST, NEVER THE STORED ARRAY, and that is the one
   * rule this whole feature has broken before. The stored array is EMPTY for
   * every account that has never arranged one, and empty MEANS the free eight —
   * so an edit seeded from the stored value wrote a bar exactly one emote long
   * and silently threw the other eight away.
   */
  const visibleBarIds = useCallback((from) => {
    const cosmeticsNow = from || cosmeticsRef.current;
    return resolveEmoteBar(cosmeticsNow?.emoteOrder, cosmeticsNow?.owned).map((e) => e.id);
  }, []);

  /**
   * Put an emote in a cell — the wheel's ONE verb, and now the only way an
   * emote enters a bar from this screen.
   *
   * The replace/swap/append decision is setEmoteAt's, in shared/emotes, so both
   * clients answer it identically. A no-op comes back as the SAME array, which
   * is what stops "pick the emote already in this cell" spending a write.
   */
  const assignEmote = useCallback(async (index, emoteId, from) => {
    const current = visibleBarIds(from);
    const next = setEmoteAt(current, index, emoteId);
    if (next === current) return;
    await writeEmoteBar(next, from);
  }, [visibleBarIds, writeEmoteBar]);

  /**
   * Take the emote in cell `index` off the wheel — the wheel's ONE verb.
   *
   * clearEmoteAt refuses the last one by returning the list unchanged, and the
   * cell is already disabled in that state, so this needs no message: the
   * refusal is met before the click, not reported after it.
   */
  const removeEmoteCell = useCallback(async (index) => {
    const current = visibleBarIds();
    const next = clearEmoteAt(current, index);
    if (next === current) return;
    await writeEmoteBar(next);
  }, [visibleBarIds, writeEmoteBar]);

  /**
   * THE SHELF'S ONE VERB: click an emote you own, it goes on the wheel; click it
   * again, it comes off. The whole card is the target (see ShopCard), because
   * the thing you are pointing at IS the emote.
   *
   * THIS IS THE PLUS PANEL'S REPLACEMENT. Adding used to mean pressing a ＋ on an
   * empty cell to open a second grid of the same faces already on screen below,
   * then finding the face again in that grid. Two grids of identical glyphs for
   * one decision. The shelf was always the better one of the two: it has the
   * names, the prices and everything you do not own yet.
   *
   * BOTH REFUSALS COME BACK AS THE SAME ARRAY, from shared/emotes — a full wheel
   * from setEmoteAt, the last emote from clearEmoteAt — so the only thing left
   * to decide here is which sentence to put on the card that was clicked. They
   * land on the card rather than the wheel because the card is what was pressed.
   */
  const toggleEmote = useCallback(async (item) => {
    const id = item.emoteId;
    if (!id) return;
    const current = visibleBarIds();
    const at = current.indexOf(id);
    const next = at >= 0
      ? clearEmoteAt(current, at)
      // The end of the list, which setEmoteAt reads as "append".
      : setEmoteAt(current, current.length, id);

    if (next === current) {
      showFail(
        cardKey(item),
        at >= 0 ? text('shopEmoteSlotClearLast') : text('shopEmoteWheelFull', { count: MAX_EMOTE_BAR }),
      );
      return;
    }

    setFail(null);
    // NO SCROLL BACK TO THE WHEEL, deliberately, and this is the one place it
    // would have been tempting. A purchase yanks the wheel into view because a
    // purchase is a single event you want to watch land; adding is something
    // people do three or four times in a row, and pulling the page up on each
    // one would take the shelf out from under the thumb that is still using it.
    // The feedback is local instead: the card frame goes green and its label
    // flips to a tick, right where the click happened.
    await writeEmoteBar(next);
  }, [visibleBarIds, writeEmoteBar, showFail, text]);

  /**
   * Back to the stock arrangement — the emote equivalent of the Default card,
   * and the reason emotes get a control rather than a tile.
   *
   * An EMPTY order is the default: the server hands the picker the free emotes
   * in catalogue order when `cosmetics.emoteOrder` is empty, so this writes `[]`
   * rather than naming the ids client-side and drifting from
   * shared/emotes/catalog.js the first time that list changes.
   */
  const resetEmoteBar = useCallback(async () => {
    setFail(null);
    if ((cosmeticsRef.current?.emoteOrder || []).length === 0) return;
    try {
      await equipEmotes([], 'emoteOrder');
    } catch (error) {
      showFail('emoteOrder', text(errorKeyFor(error)));
    }
  }, [equipEmotes, text, showFail]);

  /**
   * The picker's last tile: leave the wheel and go look at what is for sale.
   * The GRID, not the section — the section starts with the wheel you are
   * standing on, so scrolling to it would move nothing.
   */
  const scrollToEmoteShelf = useCallback(() => {
    const el = emoteGridRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const runPurchase = useCallback(async (item, purchaseKey) => {
    setFail(null);
    try {
      // duplicate:true comes back 200 and IS success — it means our retry
      // landed on a charge that already went through. Never an error path.
      const data = await purchase(item.sku, purchaseKey);
      // SUCCESS NO LONGER SPEAKS. It used to set a green notice line in the
      // sticky bar — the same slot, and very nearly the same styling, that
      // reports a failed charge. A shop that answers "you spent 900 Stamps" with
      // a status message reads like a form, not a reward.
      //
      // What says it instead, all of it on the things that actually changed:
      // the card pops, confetti comes out of it, and the balance in the header
      // counts DOWN to the new figure with the amount spent flying off it.
      wonSeqRef.current += 1;
      setWon({ sku: item.sku, at: wonSeqRef.current });

      // A BOUGHT EMOTE GOES STRAIGHT ON THE WHEEL, and this is the whole of the
      // fix for the oldest complaint about this shelf: you paid, and nothing you
      // could see changed. The purchase used to unlock the emote and leave it
      // sitting in the grid until you found a second button.
      //
      // Into the first empty cell, so the common case takes nothing away from
      // you — a new account has four of them. Only a FULL wheel replaces, and it
      // replaces the last cell, which is the one furthest from your thumb in
      // game. Either way it is one tap on that cell to change your mind.
      //
      // Fire-and-forget: the charge already succeeded, so a failed arrangement
      // write must not turn a completed purchase into an error on the card. It
      // reports itself on the wheel like any other arrangement failure.
      if (item.type === 'emote' && item.emoteId) {
        // THE SERVER'S POST-PURCHASE BLOCK, not the ref: see writeEmoteBar. The
        // ref is one render behind at this point and does not know we own this.
        const fresh = entitlementsFrom(data)?.cosmetics;
        setLandedAt((n) => n + 1);
        const current = visibleBarIds(fresh);
        const index = current.length >= MAX_EMOTE_BAR ? MAX_EMOTE_BAR - 1 : current.length;
        assignEmote(index, item.emoteId, fresh);
      }
    } catch (error) {
      showFail(item.sku, text(errorKeyFor(error)));
    }
  }, [purchase, text, showFail, visibleBarIds, assignEmote]);

  // Clears the celebration. Keyed on `won.at` (a fresh id per purchase) rather
  // than on the sku, so buying the SAME consumable twice in a row re-arms the
  // animation instead of the second press landing on a class that is already
  // applied and playing nothing.
  useEffect(() => {
    if (!won) return undefined;
    const id = setTimeout(() => {
      if (mountedRef.current) setWon(null);
    }, WON_MS);
    return () => clearTimeout(id);
  }, [won]);

  const onBuy = useCallback((item) => {
    // Minted HERE, once per press, and carried unchanged through any network
    // retry of that press. A second press mints a second key and would be a
    // second charge, which is what the in-flight disabled state exists to
    // prevent.
    //
    // NO CONFIRM STEP, at any price (user ruling). Expensive items used to open
    // a modal above CONFIRM_THRESHOLD; one press now buys. The in-flight
    // lockout and the unaffordable-disabled state are the only gates left.
    const purchaseKey = mintPurchaseKey();
    runPurchase(item, purchaseKey);
  }, [runPurchase]);

  /**
   * Every card's equip, INCLUDING the baseline's — one handler, one transport.
   *
   * The baseline used to have its own near-identical callback. It never needed
   * one: its sku is null, and "equip the baseline" and "take the current one
   * off" are the same write. So the only thing this has to decide is what goes
   * on the wire, and both branches then run useStampShop's `equip` — which
   * paints optimistically, reconciles with the server's entitlement block and
   * rolls back on failure. There is no second path and there must not be.
   *
   * THE THIRD ARGUMENT IS THE BUSY KEY, not the sku. A card that sends null
   * (either kind of unequip) would otherwise lock nothing and stay live under
   * the thumb, so the baseline lets the hook fall through to `slot:<slot>` and
   * a real card names itself.
   */
  const onEquip = useCallback(async (item) => {
    setFail(null);
    const slot = SLOT_FOR_TYPE[item.type];
    if (!slot) return;
    const current = cosmeticsRef.current?.equipped?.[slot] ?? null;
    const next = item.isDefault ? null : (current === item.sku ? null : item.sku);
    // Nothing to write. The button is disabled in this state anyway; this is the
    // belt to its braces, so a stray call cannot spend a write saying "null" to
    // a slot that is already null.
    if (current === next) return;
    try {
      await equip(item.type, next, item.isDefault ? undefined : item.sku);
    } catch (error) {
      // The baseline card has no sku; it owns its slot. slotBusyKey is used on
      // BOTH sides of this comparison (see the Default card's failMessage prop)
      // so the two can never drift into a message that matches nothing.
      showFail(item.isDefault ? slotBusyKey(slot) : item.sku, text(errorKeyFor(error)));
    }
  }, [equip, text, showFail]);

  // FAIL CLOSED. Belt and braces with the gate on the home button and the one
  // in ShopModal: if the flag is off (or the catalogue call came back
  // { enabled: false } because the kill switch was thrown mid-session) this
  // surface renders nothing at all.
  if (!enabled) return null;

  // The bar as the game will render it, resolved ONCE per render and shared by
  // the wheel and by every card's `inBar` flag. Deriving it twice is how the two
  // disagree about whether an emote is on the wheel.
  const bar = resolveEmoteBar(cosmetics.emoteOrder, cosmetics.owned);
  const barIds = bar.map((e) => e.id);
  const barIsDefault = (cosmetics.emoteOrder || []).length === 0;
  const balance = stamps || 0;

  return (
    <div className="shop">
      <ShopRail
        sections={navSections}
        sectionEls={sectionEls}
        signedIn={signedIn}
        stamps={stamps}
        adFreeMsLeft={adFreeMsLeft}
        text={text}
        lang={lang}
      />

      {/* THE GOODS, in their own column beside the rail. A wrapper and not a
          fragment on purpose: it is the second grid track, and it carries the
          min-width: 0 that lets the shelves inside it be narrower than their
          widest row wants to be (see .shopMain in styles/shop.css). */}
      <div className="shopMain">
        {catalog.status === 'loading' && catalog.items.length === 0 && (
          <p className="shop__status">{text('shopLoading')}</p>
        )}

        {catalog.status === 'error' && catalog.items.length === 0 && (
          <div className="shop__status">
            <p>{text(errorKeyFor(catalog.error))}</p>
            <button type="button" className="shop__retry" onClick={refreshCatalog}>{text('shopRetry')}</button>
          </div>
        )}

        {catalog.status === 'ready' && sectionTypes.length === 0 && (
          <p className="shop__status">{text('shopEmpty')}</p>
        )}

        {/* EVERY category, in one pass, all mounted. */}
        {sectionTypes.map((type) => {
          // EMOTES COME FROM THE FULL TABLE, everything else from the price list.
          // `byType` is built out of catalog.items, which is what is FOR SALE —
          // correct for four shelves and wrong for the one where you already own
          // eight of the stock. See emoteItems.
          const items = type === 'emote' ? emoteItems : byType[type];
          // Only a category that writes a SLOT has a baseline to go back to.
          // Emotes are an arrangement (the bar's reset owns that) and passes are
          // consumables — neither gets a card.
          const sectionSlot = SLOT_FOR_TYPE[type];
          const defaultItem = sectionSlot ? DEFAULT_ITEMS[type] : null;
          return (
            <section
              key={type}
              className="shopSection"
              ref={(el) => registerSection(type, el)}
              aria-labelledby={`shopSection-${type}`}
            >
              {/* Heading, one line of what-this-is, and a hairline. The pill that
                  counted the items is gone (the count is the grid, sitting right
                  underneath); the line that replaced it earns its space, because
                  a swatch cannot tell a first-time buyer that a glow follows
                  their name into a duel. See CATEGORY_DESC_KEY. */}
              <header className="shopSection__head">
                <h2 className="shopSection__title" id={`shopSection-${type}`}>
                  {text(CATEGORY_LABEL_KEY[type])}
                </h2>
                <p className="shopSection__desc">{text(CATEGORY_DESC_KEY[type])}</p>
              </header>

              {/* THE WHEEL SITS ABOVE THE SHELF, in the one section it means
                  anything in. It is the in-game picker, drawn as the game draws
                  it, and the cards below are what you can put in it. Signed-out
                  visitors browse the shelf without one: there is no account to
                  arrange. */}
              {type === 'emote' && signedIn && (
                <EmoteWheel
                  bar={bar}
                  isDefault={barIsDefault}
                  busy={busySku === 'emoteOrder'}
                  failMessage={fail?.scope === 'emoteOrder' ? fail.message : null}
                  landedAt={landedAt}
                  text={text}
                  onRemove={removeEmoteCell}
                  onReset={resetEmoteBar}
                  // An empty cell is a signpost to the shelf, not a picker: the
                  // roster it used to open is the grid immediately below.
                  onAddMore={scrollToEmoteShelf}
                />
              )}

              <div
                className={`shop__grid shop__grid--${type}`}
                ref={type === 'emote' ? emoteGridRef : null}
              >
                {/* FIRST IN THE SECTION, AND THE SORT IS UNTOUCHED. The catalogue
                    arrives sorted ascending by price (shared/shop/catalog.js) and
                    the server hands it over in that order; this card is rendered
                    as a SIBLING ahead of items.map() rather than unshifted into
                    the array, so nothing sorts, nothing filters, and no synthetic
                    price has to be invented to keep a comparator happy. The
                    ladder underneath still climbs exactly as it did.

                    It is the SAME ShopCard as everything else and it takes a
                    normal cell — it used to be its own component, and in the glow
                    section it used to eat an entire row on its own. */}
                {defaultItem && (
                  <ShopCard
                    item={defaultItem}
                    equipped={!cosmetics.equipped[sectionSlot]}
                    busy={busySku === slotBusyKey(sectionSlot)}
                    failMessage={fail?.scope === slotBusyKey(sectionSlot) ? fail.message : null}
                    signedIn={signedIn}
                    username={username}
                    markerUrls={type === 'marker' ? markerUrls : null}
                    text={text}
                    lang={lang}
                    onEquip={onEquip}
                    onPreviewNear={onPreviewNear}
                  />
                )}
                {items.map((item) => {
                  const slot = SLOT_FOR_TYPE[item.type];
                  const price = item.price || 0;
                  // Pre-computed so the balance itself never reaches a card: an
                  // item you can already afford keeps identical props across a
                  // purchase and its memo holds.
                  const affordable = balance >= price;
                  // Key, lock and blame, all off the same identifier. See cardKey:
                  // a free emote has no sku, and three places asking that question
                  // separately is three places to answer it differently.
                  const key = cardKey(item);
                  return (
                    <ShopCard
                      key={key}
                      item={item}
                      // FREE EMOTES ARE OWNED, FULL STOP. Routing them through the
                      // ownedSkus lookup would test `undefined` and drop them into
                      // the buy branch — a price tag on something everybody has.
                      owned={item.freeEmote || ownedSkus.has(item.sku)}
                      equipped={!!slot && cosmetics.equipped[slot] === item.sku}
                      inBar={!!item.emoteId && barIds.includes(item.emoteId)}
                      affordable={affordable}
                      // false for all 44 other cards on every render, so the memo
                      // still holds everywhere except the one card that changed.
                      celebrate={won?.sku === item.sku}
                      // null for all 44 other cards, so the memo holds everywhere
                      // except the one that has something to say.
                      failMessage={fail?.scope === key ? fail.message : null}
                      // ITS OWN KEY ONLY. This used to also test 'emoteOrder',
                      // which every emote card tested at once — one bar edit dimmed
                      // the whole shelf. useStampShop now stamps this same key.
                      busy={busySku === key}
                      signedIn={signedIn}
                      username={username}
                      // Scoped to the two cards that can use it. Handing the map
                      // to all 37 would mean the leaflet import landing mid-scroll
                      // changes a prop on every card and re-renders the whole page
                      // — for two pin images.
                      markerUrls={item.type === 'marker' ? markerUrls : null}
                      // A NUMBER, not the item — same reason `affordable` is a
                      // boolean. It is stable for all 44 cards a purchase did
                      // not touch, so the optimistic +1 after a buy re-renders
                      // exactly the one card whose count moved.
                      purchases={item.purchases}
                      // SCOPED TO THE ONE CARD THAT TICKS. This is a 1Hz value,
                      // and handing it to all 45 would re-render the entire
                      // storefront every second for the length of a pass. Every
                      // other card gets a literal 0 on every render, so their
                      // memo holds untouched.
                      adFreeMsLeft={item.type === 'pass' ? adFreeMsLeft : 0}
                      text={text}
                      lang={lang}
                      onBuy={onBuy}
                      onEquip={onEquip}
                      onToggleEmote={toggleEmote}
                      onPreviewNear={onPreviewNear}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* (The buy-confirmation Modal lived here. Removed by user ruling: one
          press buys, at any price. See onBuy.) */}
    </div>
  );
}
