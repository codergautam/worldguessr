import { useEffect, useRef, useState } from 'react';

interface Options {
  duration?: number;
  resetWhenLower?: boolean;
}

export default function useAnimatedNumber(
  value: number,
  { duration = 950, resetWhenLower = true }: Options = {},
) {
  const displayedRef = useRef(value);
  const [displayed, setDisplayed] = useState(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const startValue = displayedRef.current;
    const endValue = Math.max(0, Math.round(value));

    if (startValue === endValue) {
      // The displayed number is already final. Clear the glow too: a retarget
      // that cancelled a mid-flight loop also cancelled that loop's pending
      // setAnimating(false) timer, which would leave the glow latched on.
      setAnimating(false);
      return;
    }

    if (resetWhenLower && endValue < startValue) {
      displayedRef.current = endValue;
      setDisplayed(endValue);
      setAnimating(false);
      return;
    }

    let raf = 0;
    let glowTimeout: ReturnType<typeof setTimeout> | null = null;
    const startTime = Date.now();
    // 30Hz + changed-integer commit gate, same as useCountUp: this hook was
    // the one count-up committing React state on EVERY rAF (~60/s), and its
    // consumer (DuelHUD's HealthBar) cascades into the glow-name subtree — a
    // ~72-commit render storm per HP change. rAF still samples per frame so
    // the curve stays smooth; only the setState is throttled.
    let lastCommitAt = 0;
    let lastCommitted = startValue;

    setAnimating(true);

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + (endValue - startValue) * eased);

      if (progress < 1) {
        const now = Date.now();
        if (next !== lastCommitted && now - lastCommitAt >= 33) {
          lastCommitAt = now;
          lastCommitted = next;
          // The ref is written ONLY when the state commits: it must always
          // mean "what is on screen", because the effect's startValue and its
          // equal-values early return both read it. Letting it run ahead per
          // frame made a retarget that landed on an uncommitted ref value
          // commit nothing and stick the HUD on a stale number.
          displayedRef.current = next;
          setDisplayed(next);
        }
        raf = requestAnimationFrame(tick) as unknown as number;
      } else {
        displayedRef.current = endValue;
        setDisplayed(endValue);
        glowTimeout = setTimeout(() => setAnimating(false), 300);
      }
    };

    raf = requestAnimationFrame(tick) as unknown as number;

    return () => {
      cancelAnimationFrame(raf);
      if (glowTimeout) clearTimeout(glowTimeout);
    };
  }, [duration, resetWhenLower, value]);

  return { displayed, animating };
}
