import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const DURATION_MS = 650;
const PAINT_INTERVAL_MS = 1000 / 30;

function normalizeTarget(target: number | null | undefined): number {
  return typeof target === 'number' && Number.isFinite(target) ? Math.round(target) : 0;
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Counts from the currently displayed integer to `target` on animation frames.
 * React updates are capped at 30 Hz to match the counter motion used by the web
 * UI. Call this inside the smallest component that owns the changing text so a
 * counter tick never re-renders its screen.
 */
export default function useCountUp(
  target: number | null | undefined,
  active = true,
): number {
  const reduceMotion = useReducedMotion();
  const destination = normalizeTarget(target);
  const [value, setValue] = useState(() => (reduceMotion ? destination : 0));
  const valueRef = useRef(value);

  useEffect(() => {
    if (reduceMotion) {
      valueRef.current = destination;
      setValue(destination);
      return undefined;
    }

    if (!active) {
      valueRef.current = 0;
      setValue(0);
      return undefined;
    }

    const startValue = valueRef.current;
    if (startValue === destination) return undefined;

    let frameId: number | null = null;
    let startedAt: number | null = null;
    let lastPaintAt = -Infinity;

    const tick = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min((timestamp - startedAt) / DURATION_MS, 1);
      const nextValue = Math.round(
        startValue + (destination - startValue) * easeOutCubic(progress),
      );

      if (timestamp - lastPaintAt >= PAINT_INTERVAL_MS || progress === 1) {
        lastPaintAt = timestamp;
        valueRef.current = nextValue;
        setValue(nextValue);
      }

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [active, destination, reduceMotion]);

  return value;
}
