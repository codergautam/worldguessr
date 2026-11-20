import { useEffect, useRef, useState } from 'react';
import { blinkPhaseAt, BLINK_COUNTDOWN_MS } from '@shared/game/blink';

export type BlinkState = {
  phase: 'loading' | 'countdown' | 'reveal' | 'blurred' | 'answer';
  /** The whole second shown in the center during the countdown. */
  count: number;
} | null;

// Mirror of web components/blink/useBlinkPhase.js. Returns null when the round
// is not a blink round. The clock starts when `ready` (pano loaded) turns true
// and stops while `paused`, so a modal cannot eat the reveal.
export default function useBlinkPhase({ enabled, revealMs, ready, roundKey, paused, showAnswer }: {
  enabled: boolean;
  revealMs: number;
  ready: boolean;
  roundKey: string | number;
  paused: boolean;
  showAnswer: boolean;
}): BlinkState {
  const [elapsed, setElapsed] = useState(0);
  const baseRef = useRef(0);
  const startRef = useRef<number | null>(null);
  // The reveal length is the timer as it stood when the reveal began. Changing
  // the timer later in the round (options mid-round) must not re-reveal the
  // pano; a change during loading or the countdown still applies.
  const revealRef = useRef(revealMs);
  if (elapsed < BLINK_COUNTDOWN_MS) revealRef.current = revealMs;

  useEffect(() => {
    baseRef.current = 0;
    startRef.current = null;
    setElapsed(0);
  }, [roundKey, enabled]);

  useEffect(() => {
    if (!enabled || !ready || paused || showAnswer) return;
    startRef.current = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const e = baseRef.current + Date.now() - (startRef.current ?? Date.now());
      setElapsed(e);
      const { nextChangeMs } = blinkPhaseAt(e, revealRef.current);
      if (nextChangeMs != null) timer = setTimeout(tick, nextChangeMs + 5);
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
      if (startRef.current != null) {
        baseRef.current += Date.now() - startRef.current;
        startRef.current = null;
      }
    };
  }, [enabled, ready, paused, showAnswer, revealMs, roundKey]);

  if (!enabled) return null;
  if (showAnswer) return { phase: 'answer', count: 0 };
  if (!ready) return { phase: 'loading', count: 0 };
  const { phase, count } = blinkPhaseAt(elapsed, revealRef.current);
  return { phase, count };
}
