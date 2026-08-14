import { useEffect, useState } from 'react';

/* ===========================================================================
 *  "SHOULD THIS PLAYER SEE ADS RIGHT NOW?" — the one place web answers that.
 *
 *  THE BUG THIS EXISTS TO FIX. The ad-free pass was sellable and chargeable
 *  before anything read it: api/stampShop.js wrote `adFreeUntil` on purchase,
 *  the shop showed a countdown chip, and every ad slot on the site went on
 *  rendering regardless. A player spent 150 Stamps and got a timer.
 *
 *  THE SOURCE OF TRUTH IS THE SESSION, and that is what makes this immediate.
 *  `adFreeUntil` rides every auth response (api/stampShop.js entitlementFields,
 *  carried by googleAuth and crazyAuth), and useStampShop's applyEntitlements
 *  pushes the purchase response straight into `session.token` via setSession on
 *  the same tick the charge lands. So a component reading this hook re-renders
 *  the moment the pass is bought — no refetch, no reload, no second store to
 *  keep in step. Do NOT reintroduce a separate ad-free state: two copies of an
 *  expiry are two chances to disagree about whether somebody is paid up.
 *
 *  IT HAS TO EXPIRE BY ITSELF. A pass runs for an hour (the duration lives in
 *  shared/shop/catalog.js and nothing here hardcodes it), and a boolean derived
 *  from Date.now() only re-evaluates when something else happens to re-render.
 *  The hook therefore arms ONE setTimeout for exactly the remaining
 *  milliseconds and flips back when it fires. Not an interval: there is exactly
 *  one moment in the future when this answer changes and it is known in
 *  advance, so polling every second would be work spent to learn nothing
 *  3,599 times out of 3,600.
 * ======================================================================== */

/** Epoch ms from a raw `adFreeUntil` value (ISO string, Date, or null). */
export function parseAdFreeUntil(raw) {
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Epoch ms the current pass runs to, or 0 for "no pass". Never throws. */
export function adFreeUntilMs(session) {
  return parseAdFreeUntil(session?.token?.adFreeUntil);
}

/**
 * h:mm:ss once past an hour (passes stack), m:ss below it.
 *
 * HERE rather than in a shop component because it is now printed on four
 * surfaces — the account-modal wallet, the storefront's sticky rail, the pass
 * card itself and the home-screen chip — and the home chip must not have to
 * import a shop module to render a clock. One file owns the pass: when it ends,
 * how long is left, and how that reads.
 */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Milliseconds left on a pass, re-rendering once a second while one runs.
 *
 * SEPARATE FROM useAdFree ABOVE, and the split is the point. "Are there ads?"
 * changes exactly once, at a moment known in advance, so it arms ONE timeout —
 * anything holding that boolean must not re-render 3,600 times to learn nothing.
 * "How long is left?" is a clock and has to tick. Components that only gate ads
 * keep the cheap hook; only the ones actually PRINTING the number pay for the
 * interval.
 *
 * The interval exists only while a pass is live and clears itself on expiry, so
 * an idle screen ticks nothing. Takes epoch ms rather than a session so the shop
 * can drive it from its own entitlement patch and the home screen from the
 * session, without either inventing a second copy of the expiry.
 */
export function useAdFreeCountdown(untilMs) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!untilMs || untilMs <= Date.now()) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= untilMs) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [untilMs]);

  return untilMs ? Math.max(0, untilMs - nowMs) : 0;
}

/** One-shot check, for code outside a component. */
export function isAdFree(session) {
  const until = adFreeUntilMs(session);
  return until > Date.now();
}

/**
 * Live version for render: true while a pass is running, flipping to false on
 * its own the instant it lapses.
 *
 * FAILS TOWARDS SHOWING ADS. An absent, malformed or past timestamp is 0, which
 * is not greater than now, so anything this hook cannot make sense of leaves the
 * ads exactly where they were. That is the right default for the one entitlement
 * on the site that costs the business money when it is wrong.
 */
export default function useAdFree(session) {
  const until = adFreeUntilMs(session);
  const [lapsed, setLapsed] = useState(false);

  useEffect(() => {
    setLapsed(false);
    if (!until) return undefined;
    const left = until - Date.now();
    if (left <= 0) {
      setLapsed(true);
      return undefined;
    }
    // setTimeout clamps to a 32-bit signed delay (~24.9 days). A pass is
    // minutes, so this is a guard against a nonsense timestamp scheduling an
    // immediate fire, not a case anything real hits.
    if (left > 2147483647) return undefined;
    const id = setTimeout(() => setLapsed(true), left);
    return () => clearTimeout(id);
  }, [until]);

  return until > 0 && !lapsed;
}
