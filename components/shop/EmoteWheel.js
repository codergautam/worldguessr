import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { MAX_EMOTE_BAR } from '@/shared/emotes/catalog';

/* ===========================================================================
 *  THE EMOTE WHEEL — what comes up in game, and the one place it is arranged.
 *
 *  TWO SURFACES, ONE VERB EACH. The wheel takes emotes OUT. The shelf below it
 *  puts them IN. That is the whole model, and either half is a single click on
 *  the thing you are looking at.
 *
 *  WHAT THIS REPLACED, because the shape of it is the lesson and it is the
 *  second time this section has been rebuilt.
 *
 *    First it was five verbs across two surfaces: tap a glyph to remove, DRAG a
 *    glyph to reorder (with a 6px slop threshold deciding which of the two your
 *    finger had meant), a card button that added, the same button that removed,
 *    and a reset. Mobile did none of those gestures and had its own floating
 *    toolbar instead.
 *
 *    Then it was one verb — tap a cell, pick from a panel — which fixed the
 *    ambiguity and cost something worse. Every empty cell was a ＋ button that
 *    opened a second grid of the same emotes that were ALREADY ON SCREEN forty
 *    pixels below, so adding one meant: find the hole, press the plus, find the
 *    face again in a different grid, press it. Two grids of identical glyphs,
 *    one of them a modal-in-all-but-name, to do a thing the page was already
 *    showing you. That panel is gone.
 *
 *  THE ＋ STAYS, AND IT IS A SIGN, NOT A BUTTON. Empty cells still draw it,
 *  because "you have four free slots" is worth seeing at a glance — it is an
 *  honest picture of the in-game popup and a standing invitation. Pressing one
 *  now takes you to the shelf where the adding actually happens (onAddMore),
 *  rather than opening a copy of it in place.
 *
 *  FOUR ACROSS, BECAUSE THAT IS WHAT THE GAME DRAWS. Both in-game pickers lay
 *  their buttons out four to a row (.emoteBar in styles/globals.scss, and the
 *  204px wrap row in mobile's EmoteReactions.tsx), so 12 cells is exactly the
 *  three rows you will see mid-duel. This screen is a preview, not a diagram.
 *
 *  CELLS ARE KEYED BY INDEX, NEVER BY EMOTE ID, and that is load-bearing rather
 *  than incidental: a removal changes the GLYPH INSIDE a run of fixed boxes and
 *  must never reorder, mount or unmount a box. It keeps the motion to composited
 *  animations, it means no FLIP measurement anywhere, and it is the same rule
 *  mobile's wheel follows — where reordering a mounted list is the documented
 *  trigger for the reanimated crash family we cannot patch on this RN line.
 * ======================================================================== */

/** The wheel is always drawn full-size; the tail is empty cells. */
const CELLS = MAX_EMOTE_BAR;

/** What an empty cell shows. Fullwidth plus, so it optically matches a glyph. */
const EMPTY_GLYPH = '＋';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

/**
 * Play the landing on every cell whose contents just changed.
 *
 * WHY WAAPI AND NOT A CSS CLASS. The same cell lands over and over (add, remove,
 * buy), and re-arming a CSS animation means taking a class off, forcing a reflow
 * and putting it back — a documented trap in this repo. `element.animate` starts
 * a fresh animation per call with no class bookkeeping at all.
 *
 * A REMOVAL COMPACTS, so every cell after the removed one changes at once. That
 * is not noise to suppress: the shift IS what happened, and a 20ms-per-cell
 * ripple is what makes it read as one movement rather than twelve.
 */
function playLandings(cellEls, changed) {
  if (!changed.length || prefersReducedMotion()) return;
  const first = changed[0];
  for (const index of changed) {
    const el = cellEls[index];
    if (!el || typeof el.animate !== 'function') continue;
    try {
      el.animate(
        [
          { transform: 'scale(0.82)', boxShadow: '0 0 0 0 rgba(74, 222, 128, 0.55)' },
          { transform: 'scale(1.09)', boxShadow: '0 0 0 7px rgba(74, 222, 128, 0)', offset: 0.55 },
          { transform: 'scale(1)', boxShadow: '0 0 0 10px rgba(74, 222, 128, 0)' },
        ],
        {
          duration: 340,
          // Capped so a full compaction still finishes inside half a second.
          delay: Math.min(index - first, 6) * 20,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'backwards',
        },
      );
    } catch (e) {
      // An older engine without WAAPI keeps the whole feature, minus the pop.
    }
  }
}

const EmoteWheel = memo(function EmoteWheel({
  bar,
  isDefault,
  busy,
  failMessage,
  landedAt,
  text,
  onRemove,
  onReset,
  onAddMore,
}) {
  // NO STATE AT ALL, and that is the measure of the rework: this component used
  // to own an `openIndex` because it hosted a picker. Everything it draws is now
  // derived from the bar its parent hands down, so an optimistic write repaints
  // the wheel on the same frame as the click.
  const rootRef = useRef(null);
  const cellsRef = useRef([]);
  const ids = useMemo(() => bar.map((e) => e.id), [bar]);

  /* Landing animation. Compares the ids cell by cell against the previous
     render, so it fires for exactly the cells that changed and needs no signal
     from the handler that caused the change — including a purchase and an add
     from the shelf, both of which land from another component. */
  const prevIdsRef = useRef(null);
  useEffect(() => {
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (!prev) return; // First paint is not a landing.
    const changed = [];
    for (let i = 0; i < CELLS; i += 1) {
      if ((prev[i] ?? null) !== (ids[i] ?? null)) changed.push(i);
    }
    playLandings(cellsRef.current, changed);
  }, [ids]);

  /* An emote arriving from the shelf — bought, or just added — lands here, and
     the shelf can be a long way down the page. Bring the wheel back on screen so
     the landing is something the player actually sees. `block: 'nearest'` leaves
     the scroll alone if it is already in view, which is the common case for an
     add. */
  useEffect(() => {
    if (!landedAt) return;
    const el = rootRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [landedAt]);

  // REFUSING THE LAST EMOTE IS A DISABLED CONTROL, never a message after a
  // press. An empty order MEANS the stock bar (see resolveEmoteBar), so removing
  // the final emote would resolve straight back to the free eight and silently
  // undo itself. You meet that before you click, on the cell itself.
  const canRemove = ids.length > 1;

  const removeAt = useCallback((index) => {
    onRemove(index);
  }, [onRemove]);

  return (
    <section className="shop__wheel" ref={rootRef}>
      <div className="shop__wheelHead">
        <h3 className="shop__wheelTitle">{text('shopEmoteWheelTitle')}</h3>
        {/* Quiet, and quiet on purpose: restoring the stock arrangement is a
            correction, not an action worth a green button. Present but inert
            once you ARE on the default, because a control that vanishes as the
            last cell changes reads as a bug and takes the layout with it. */}
        <button
          type="button"
          className="shop__wheelReset"
          onClick={onReset}
          disabled={busy || isDefault}
          title={text('shopEmoteBarResetHint')}
        >
          {text('shopEmoteBarReset')}
        </button>
      </div>

      <div className="shop__wheelCells" role="group" aria-label={text('shopEmoteWheelTitle')}>
        {Array.from({ length: CELLS }, (_, index) => {
          const emote = bar[index] || null;

          // THE EMPTY CELL. A signpost that happens to be pressable: it says
          // "there is room here" and, if you press it, takes you to the one
          // place rooms get filled. It does NOT open anything.
          if (!emote) {
            const label = text('shopEmoteSlotAdd', { n: index + 1 });
            return (
              <button
                // INDEX, NEVER THE EMOTE ID. See the header.
                key={index}
                type="button"
                ref={(el) => { cellsRef.current[index] = el; }}
                className="shop__cell shop__cell--empty"
                onClick={onAddMore}
                aria-label={label}
                title={label}
              >
                <span className="shop__cellGlyph">{EMPTY_GLYPH}</span>
              </button>
            );
          }

          const label = text('shopEmoteSlotLabel', { n: index + 1, name: emote.name });
          const title = canRemove
            ? `${label} — ${text('shopEmoteRemove')}`
            : text('shopEmoteSlotClearLast');
          return (
            <button
              key={index}
              type="button"
              ref={(el) => { cellsRef.current[index] = el; }}
              className={`shop__cell ${emote.fx ? 'shop__cell--fx' : ''}`}
              onClick={() => removeAt(index)}
              // Busy is an in-flight write; !canRemove is the last-emote rule.
              // Both are "not right now", and both say why in the title.
              disabled={busy || !canRemove}
              aria-label={title}
              title={title}
            >
              <span className={`shop__cellGlyph ${emote.fx ? `emoteFx--${emote.fx}` : ''}`.trim()}>
                {emote.glyph}
              </span>
              {/* The verb, revealed on hover and on keyboard focus (see
                  shop.css). A cell that removes on click has to say so before
                  the click, and it says it in the same red the rest of this app
                  uses for taking something away. */}
              {canRemove && <span className="shop__cellX" aria-hidden="true">✕</span>}
            </button>
          );
        })}
      </div>

      {/* Under the cells, never instead of them: this used to print a sentence
          about your emotes where your emotes should have been. */}
      {failMessage ? (
        <p className="shop__wheelFail" role="status">{failMessage}</p>
      ) : (
        <p className="shop__wheelHint">{text('shopEmoteWheelTap')}</p>
      )}
    </section>
  );
});

export default EmoteWheel;
