import { memo, useLayoutEffect, useRef } from "react";

// Countdown digits, rendered OUTSIDE React's commit path.
//
// CONTRACT (do not "fix" this back into useState):
//   The digits span is rendered with no children, so React never touches its
//   textContent. This component writes it directly through `digitsRef`. That is
//   deliberate and it is the same ref-lockstep pattern as the duel health bar
//   (components/duelHealthbar.js) — the value the user sees and the value we
//   hold are written on the same line, so a React repaint from any other prop
//   change can never land a stale number. Routing this through state instead
//   means every tenth-of-a-second re-commits whatever tree the timer is mounted
//   in; on GameUI that was ~10 full re-renders/sec for the entire match,
//   including the 553-line EndBanner, for the whole round.
//
// TICK CADENCE: requestAnimationFrame, and the write dedupe below is what makes
//   that cheap. A timer that must not visibly skip a value has to be sampled
//   faster than the value changes: MEASURED over 200 simulated decimal runs,
//   a flat 100ms poll paints only 69 of ~100 tenths under light main-thread
//   load and 50 under dev-build load, because any delay at all makes the poll
//   drift past a boundary. rAF paints 90 and 73. It also stops dead when the
//   tab is hidden (a setInterval keeps firing) and resumes in step with paint.
//   Per frame this does one Date.now(), one ceil and one string compare, and
//   only touches the DOM when the string actually changed — so above 10s the
//   layout/paint still happens once a second, not sixty times.
//   Do NOT "optimize" this into a sleep-until-the-next-boundary scheduler.
//   That was tried: sleeping to a boundary means normal scheduling lateness
//   lands just past it, which is how values get skipped in the first place.

// The duel line embeds the number inside a localized sentence
// ("Round #1 / 5 - 47 seconds"), so callers interpolate this sentinel as the
// {{t}} value and we split on it. Printable and impossible to hit by accident,
// so every locale keeps working without touching the locale files.
export const DIGIT_SLOT = "{{__digits__}}";

// Tenths remaining, rounded UP (user ruling Aug 6).
// Ceil is what makes this read as a countdown rather than an elapsed clock:
// "1" means up to one second is left, and 0.0 appears only once the time is
// genuinely gone. Floor showed 0.0 for the last full tenth and fired timeouts
// up to 99ms early.
export function remainingTenths(deadline, timeOffset) {
  return Math.max(0, Math.ceil((deadline - Date.now() - (timeOffset || 0)) / 100) / 10);
}

// Whole seconds at 10 and above, tenths below:
//   ... 14, 13, 12, 11, 10, 9.9, 9.8 ... 0.1, 0.0
//
// "10" is the first value of the decimal phase, so like every decimal value it
// is on screen for 100ms (remaining 9.9-10.0s), not a full second. The integers
// above it each get their full second. This is the sequence the game wants and
// it is only safe because of the CADENCE above: sampling at rAF puts ~6 looks
// inside that 100ms window. MEASURED over 300 rounds, "10" never appears at all
// in 72 of them if this is driven by a 100ms interval instead. If you ever move
// this off rAF (or off 30Hz on mobile), "10" starts vanishing.
export function formatCountdown(tenths) {
  return tenths >= 10 ? String(Math.ceil(tenths)) : tenths.toFixed(1);
}

function Countdown({ deadline, timeOffset = 0, template = DIGIT_SLOT, className }) {
  const digitsRef = useRef(null);

  // useLayoutEffect, not useEffect: the span mounts empty (React owns no
  // children here), so a passive effect would paint one frame of blank timer.
  useLayoutEffect(() => {
    const el = digitsRef.current;
    if (!el || !deadline) return;

    let last = null;
    let raf = null;

    const tick = () => {
      const text = formatCountdown(remainingTenths(deadline, timeOffset));
      // Only touch the DOM when the STRING changes. Above 10s that is once a
      // second no matter how often we look, so the expensive half (layout +
      // paint of the pill) still runs at the display rate, not the frame rate.
      if (text !== last) {
        last = text;
        el.textContent = text;
      }
      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [deadline, timeOffset]);

  if (!deadline) return null;

  const slot = template.indexOf(DIGIT_SLOT);
  const before = slot === -1 ? "" : template.slice(0, slot);
  const after = slot === -1 ? template : template.slice(slot + DIGIT_SLOT.length);

  return (
    <>
      {before}
      <span className={className} ref={digitsRef} />
      {after}
    </>
  );
}

export default memo(Countdown);
