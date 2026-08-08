import { useEffect, useState } from 'react';

/**
 * The home header pills' count-up: the number starts at 0 and runs to `target`
 * when the screen opens, then re-runs whenever `target` changes.
 *
 * ONE COPY, TWO PILLS. The league/ELO pill and the Stamps pill sit in the same
 * row and are twins by construction (same padding, radius, type, entrance); two
 * hand-rolled counters would eventually disagree on cadence and the pair would
 * visibly fall out of step on open.
 *
 * WHY THIS IS NOT useAnimatedNumber. That hook seeds its state FROM the value,
 * so it animates only on a later change and a screen that mounts with the final
 * number never counts at all. This one always starts at 0, which is the whole
 * point on app open. Do not add a third: pick whichever of these two matches
 * "animate on change" vs "count up from zero".
 *
 * Byte-for-byte the web recipe (components/utils/useCountUp.js), so the two
 * platforms' pills animate identically. The shape is exponential decay, not
 * linear: `step` is a tenth of the REMAINING distance each tick, so the number
 * sprints then eases in, and the arc looks the same whether the gap is 40 or
 * 40,000.
 *
 * @param target final value; null/undefined/NaN rewinds to 0
 */
export default function useCountUp(target: number | null | undefined): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    // No target (signed out, data not in yet) rewinds to 0, so the next sign-in
    // counts up from scratch instead of sliding across from the last account's
    // number. Already-0 is a React bail-out, not an extra render.
    if (typeof target !== 'number' || !Number.isFinite(target)) {
      setValue(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setValue((prev) => {
        const diff = target - prev;

        // Settled: stop ticking entirely. Left running, this is a main-thread
        // wakeup 100x/sec for as long as home is mounted, which on this app is
        // the whole session. The [target] dep re-arms it the next time the
        // value actually changes (a finished duel, a shop purchase).
        if (diff === 0) {
          clearInterval(interval);
          return prev;
        }

        const step = Math.ceil(Math.abs(diff) / 10) || 1;
        return diff > 0 ? Math.min(prev + step, target) : Math.max(prev - step, target);
      });
    }, 10);

    return () => clearInterval(interval);
  }, [target]);

  return value;
}
