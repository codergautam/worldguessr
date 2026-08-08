import { useEffect, useRef, useState } from 'react';

/* ===========================================================================
 *  NEAR-VIEWPORT MOUNTING — one observer for the whole storefront.
 *
 *  The storefront is a single scrolling page now: every category is mounted at
 *  once, which is ~45 cards. Most of those previews are free (a glyph, a
 *  number), but three are not:
 *
 *    glows       two stages each, and each stage paints a five-layer
 *                text-shadow at display size. Two of the skus additionally run
 *                a text-shadow KEYFRAME animation with will-change, i.e. a
 *                repaint every frame, forever, whether or not anyone can see
 *                them.
 *    backgrounds one full-size photographic <img> decode per card, and the
 *                whole section is photographs.
 *    markers     the first one to appear pulls the leaflet chunk in.
 *
 *  Mounting all of that on open is the documented low-end freeze in this repo
 *  (the maps modal, which evaluated its whole grid inside the click handler).
 *  So the heavy previews mount only once they are within one screen of the
 *  viewport, behind a placeholder that already occupies the exact final box —
 *  no layout shift when the real thing arrives.
 *
 *  ONE IntersectionObserver, module scope, shared by every card. Forty-five
 *  observers would each carry their own intersection bookkeeping for the same
 *  root and the same margin. Observation is ONE-SHOT: a preview that has been
 *  mounted stays mounted (unmounting it on scroll-out would re-run the image
 *  decode and restart the animations every time the user scrolled past).
 *
 *  NO IntersectionObserver, NO window (SSR, ancient WebViews) => everything
 *  mounts immediately. The lazy path is an optimisation; it must never be the
 *  difference between the shop working and not working.
 * ======================================================================== */

/** One screen of runway, so a mount finishes before the card is on screen. */
const ROOT_MARGIN = '400px 0px 400px 0px';

let sharedObserver = null;
/** element -> callback. Weak so a card that unmounts mid-flight is collectable. */
const callbacks = new WeakMap();

function observerSupported() {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
}

function getObserver() {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new window.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const fire = callbacks.get(entry.target);
      // One-shot: stop watching before calling back, so a synchronous re-render
      // cannot deliver the same element twice.
      sharedObserver.unobserve(entry.target);
      callbacks.delete(entry.target);
      if (fire) fire();
    });
  }, { rootMargin: ROOT_MARGIN, threshold: 0 });
  return sharedObserver;
}

/**
 * `[ref, near]` — attach `ref` to the placeholder box; `near` flips to true
 * once that box comes within a screen of the viewport, and never goes back.
 *
 * @param {boolean} lazy false for cheap previews: they report near immediately
 *                       and never touch the observer at all.
 */
export default function useNearViewport(lazy = true) {
  const ref = useRef(null);
  // Resolved once, at mount. `lazy` is derived from the item's type, which is
  // fixed for the life of a card, so this can never start wrong.
  const [near, setNear] = useState(() => !lazy || !observerSupported());

  useEffect(() => {
    if (near) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    const observer = getObserver();
    callbacks.set(el, () => setNear(true));
    observer.observe(el);

    return () => {
      callbacks.delete(el);
      observer.unobserve(el);
    };
  }, [near]);

  return [ref, near];
}
