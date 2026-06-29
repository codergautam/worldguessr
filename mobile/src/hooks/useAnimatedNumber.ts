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

    if (startValue === endValue) return;

    if (resetWhenLower && endValue < startValue) {
      displayedRef.current = endValue;
      setDisplayed(endValue);
      setAnimating(false);
      return;
    }

    let raf = 0;
    let glowTimeout: ReturnType<typeof setTimeout> | null = null;
    const startTime = Date.now();

    setAnimating(true);

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + (endValue - startValue) * eased);

      displayedRef.current = next;
      setDisplayed(next);

      if (progress < 1) {
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
