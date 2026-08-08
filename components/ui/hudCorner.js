import { useCallback, useEffect, useRef } from 'react';

/* ===========================================================================
 *  THE TOP-RIGHT COLUMN.
 *
 *  A flex column holding the player card and the Community Maps button. See
 *  styles/playerCard.css for why it exists at all: everything in this corner
 *  used to be its own `position: fixed` element stacked by hand-tuned `top:`
 *  values that quoted each other in comments.
 *
 *  IT ALSO PUBLISHES ITS OWN HEIGHT, and that is the whole reason this is a
 *  component and not a bare <div>. WsIcon cannot join the column: it has to
 *  outrank modals (a connection can drop while the account modal is open) and
 *  the column deliberately hides underneath them, so it stays a separate fixed
 *  element. Its old offset was a guess — `top: loggedOut ? '170px' : '125px'`,
 *  a hardcoded measurement of whatever happened to be above it, with a comment
 *  admitting as much. A ResizeObserver writes the real height to --hudCornerH
 *  instead, so the badge sits below whatever this column actually contains, at
 *  whatever breakpoint, in whatever auth state.
 *
 *  The variable is cleared on unmount: off the home screen there is no column,
 *  and a stale height would push the badge down over nothing.
 * ======================================================================== */
export default function HudCorner({ covered, children }) {
  const elRef = useRef(null);

  const publish = useCallback((h) => {
    document.documentElement.style.setProperty('--hudCornerH', `${Math.round(h)}px`);
  }, []);

  const setRef = useCallback((el) => {
    elRef.current = el;
    if (el) publish(el.getBoundingClientRect().height);
  }, [publish]);

  useEffect(() => {
    const el = elRef.current;
    // No ResizeObserver (old Safari) just means the badge keeps the floor
    // below, which is the value it used to hardcode anyway.
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => publish(entry.contentRect.height));
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--hudCornerH');
    };
  }, [publish]);

  return (
    <div
      ref={setRef}
      className="hudCorner"
      // Modals cover this with visibility, never an unmount: the entrance is a
      // CSS animation on this element, and an unmount would replay it every
      // time a modal closed over the home screen.
      style={{ visibility: covered ? 'hidden' : 'visible' }}
    >
      {children}
    </div>
  );
}
