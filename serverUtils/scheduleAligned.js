// Wall-clock-aligned repeating jobs. Pure — no imports, no env, no I/O beyond
// setTimeout and a console.error on failure.
//
// setInterval is wrong for anything that must land ON a boundary: it drifts,
// and a process restart at 23:59 re-anchors the whole schedule to the restart
// time. Everything here recomputes the next boundary from the clock instead.

const MIN_DELAY_MS = 1000;
// setTimeout stores its delay in a signed 32-bit int. Anything larger silently
// overflows and fires IMMEDIATELY (a 30-day delay becomes ~0ms and the job
// spins), so the delay is clamped and the schedule just re-arms sooner.
const MAX_DELAY_MS = 2147483647;

/** Next 00:00:00 UTC strictly after `from`, as a Date. */
export function nextUtcMidnight(from = Date.now()) {
  const d = new Date(from);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** Next Monday 00:00:00 UTC strictly after `from`, as a Date. */
export function nextUtcMonday(from = Date.now()) {
  const d = new Date(from);
  // 0 = Sunday. On a Monday this returns 7, i.e. the NEXT Monday, never today.
  const daysAhead = ((8 - d.getUTCDay()) % 7) || 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysAhead));
}

/**
 * Run `job` at every boundary produced by `nextFn(now)`.
 *
 * nextFn: (nowMs) => Date | number, the next boundary.
 * job:    sync or async; its return value is ignored, its failures are logged.
 * label:  appears in the '[cron:label]' error line.
 *
 * Returns an unsubscribe function that cancels the pending timer.
 *
 * TWO NON-OBVIOUS GUARANTEES:
 *  1. The delay is recomputed from the wall clock on EVERY arm, so a restart,
 *     a long GC pause or a suspended host cannot accumulate drift.
 *  2. The next tick is armed BEFORE the job runs. A job that throws (or a
 *     future refactor that moves the throw outside the try) then loses one
 *     run, not the schedule — arming after the job means a single bad night
 *     kills the cron permanently and silently.
 */
export function scheduleAligned(nextFn, job, label = 'job') {
  let timer = null;
  let stopped = false;

  const arm = () => {
    if (stopped) return;

    const now = Date.now();
    let delay = new Date(nextFn(now)).getTime() - now;
    if (!Number.isFinite(delay)) delay = MIN_DELAY_MS;
    delay = Math.min(Math.max(delay, MIN_DELAY_MS), MAX_DELAY_MS);

    timer = setTimeout(() => {
      timer = null;
      arm(); // re-arm first, see guarantee 2
      try {
        const result = job();
        // An async job's rejection never reaches the try/catch, and an
        // unhandled rejection can take the whole process down under Node's
        // default policy.
        if (result && typeof result.then === 'function') {
          result.then(undefined, (err) => console.error(`[cron:${label}]`, err));
        }
      } catch (err) {
        console.error(`[cron:${label}]`, err);
      }
    }, delay);
  };

  arm();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
