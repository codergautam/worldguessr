import { useEffect, useState } from 'react';

/**
 * The home HUD's count-up: the number starts at 0 and runs to `target` when the
 * page opens, then re-runs whenever `target` changes.
 *
 * ONE COPY, TWO PILLS. The league/ELO button and the Stamps button sit in the
 * same row and are twins by construction (same padding, radius, type, entrance);
 * two hand-rolled counters would eventually disagree on cadence and the pair
 * would visibly fall out of step on open.
 *
 * IT STARTS AT 0 BY DESIGN. That is what makes it a count-up rather than a
 * transition, and it is why this is not mobile's `useAnimatedNumber` (which
 * seeds its state from the value and therefore animates only on a later change).
 *
 * The shape is exponential decay, not linear: `step` is a tenth of the REMAINING
 * distance each tick, so the number sprints then eases in — about 650ms to cover
 * a 1000-point gap, and the same visual arc whether the gap is 40 or 40,000.
 *
 * @param {number|null|undefined} target  final value; non-numbers park it at 0
 * @returns {number} the value to render this frame
 */
export default function useCountUp(target) {
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
        // wakeup 100x/sec for as long as the home screen is mounted, which on
        // this app is the whole session. The [target] dep re-arms it the next
        // time the value actually changes (a finished duel, a shop purchase).
        if (diff === 0) {
          clearInterval(interval);
          return prev;
        }

        const step = Math.ceil(Math.abs(diff) / 10) || 1;
        return diff > 0
          ? Math.min(prev + step, target)
          : Math.max(prev - step, target);
      });
    }, 10);

    return () => clearInterval(interval);
  }, [target]);

  return value;
}
