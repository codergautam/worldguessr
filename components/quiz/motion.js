// Motion helpers for the quiz screens (ported from MapFinder's motion.tsx).
// Nothing on these screens may vanish in one frame: a slot whose content
// changes keeps the old content mounted while it plays its exit.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const HEIGHT_MS = 320;

// One slot, changing occupant by `id`. The outgoing node keeps its key (so the
// same DOM plays `.quizSwap__out`) and sits on top of the incoming one, which
// plays its own entrance. `ms` must cover the exit keyframe.
//
// `animateHeight`: the slot eases from the old occupant's height to the new
// one's instead of jumping in one frame (a jump moves everything below it,
// and the whole card when it is centred).
export function Swap({ id, children, ms = 240, className = '', animateHeight = false }) {
  const [cur, setCur] = useState({ id, node: children });
  const [out, setOut] = useState(null);
  if (cur.id !== id) {
    setOut(cur.node != null ? cur : null);
    setCur({ id, node: children });
  } else if (cur.node !== children) {
    setCur({ id, node: children });
  }
  useEffect(() => {
    if (!out) return undefined;
    const t = setTimeout(() => setOut(null), ms);
    return () => clearTimeout(t);
  }, [out, ms]);

  // The last settled height, kept by a ResizeObserver: in the layout effect
  // below the DOM already holds the new occupant, so the old height must come
  // from before the commit.
  const boxRef = useRef(null);
  const settledRef = useRef(null);
  const easingRef = useRef(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!animateHeight || !box) return undefined;
    settledRef.current = box.offsetHeight;
    const ro = new ResizeObserver(() => { if (!easingRef.current) settledRef.current = box.offsetHeight; });
    ro.observe(box);
    return () => ro.disconnect();
  }, [animateHeight]);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!animateHeight || !box) return undefined;
    const from = settledRef.current;
    const to = box.offsetHeight;
    if (from == null || Math.abs(from - to) < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      settledRef.current = to;
      return undefined;
    }
    easingRef.current = true;
    box.style.transition = 'none';
    // Clipped while it eases, or the outgoing occupant hangs out of the
    // shrinking box as it fades; free again once settled.
    box.style.overflow = 'clip';
    box.style.height = `${from}px`;
    void box.offsetHeight;
    box.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    box.style.height = `${to}px`;
    const release = (settled) => {
      box.style.transition = '';
      box.style.overflow = '';
      box.style.height = '';
      easingRef.current = false;
      settledRef.current = settled;
    };
    const t = setTimeout(() => release(to), HEIGHT_MS + 30);
    // The next swap's cleanup runs with the NEW occupant already in the DOM:
    // never measure there. An ease still running hands over its current
    // height, so the next one starts from where this one is.
    return () => {
      clearTimeout(t);
      if (easingRef.current) release(box.offsetHeight);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={boxRef} className={`quizSwap ${className}`}>
      {out && out.id !== id && (
        <div key={out.id} className="quizSwap__out" aria-hidden>{out.node}</div>
      )}
      <div key={id} className="quizSwap__in">{children}</div>
    </div>
  );
}

// 0 -> target on rAF with cubic ease-out, restarting when target changes.
export function useCountUp(target, ms = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return undefined; }
    let raf = null;
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
