// Playwire RAMP glue shared by the script loader (headContent.js) and the ad
// slots (bannerAdPlaywire.js).
// worldguessr.com's RAMP account:
export const RAMP_PUB_ID = "1025355";
export const RAMP_WEB_ID = "75156";

const SCRIPT_ID = "ramp-script";

// RAMP boots in passive mode: it injects NOTHING on its own — every unit is
// declared explicitly through bannerAdPlaywire.js. Passive mode is also what
// keeps the dashboard-side video player off the page: auto units (video
// included) only spawn from spaNewPage(), which this codebase never calls.
// Pageviews ride the first spaAds call instead (shouldCountPageView below),
// so skipping spaNewPage costs no reporting.
function ensureRampStub() {
  window.ramp = window.ramp || {};
  window.ramp.que = window.ramp.que || [];
  window.ramp.passiveMode = true;
}

// Queue fn to run once RAMP has initialized (runs immediately if it already
// has). Safe to call any time — before the script tag even exists.
export function rampQue(fn) {
  if (typeof window === "undefined") return;
  ensureRampStub();
  window.ramp.que.push(fn);
}

// Warm the ramp.js BYTES without executing anything: a preload hint is pure
// network (off the main thread), so when the first interaction fires, the
// script executes straight from cache instead of paying its fetch first.
// Called from headContent after the load event + an idle callback — even
// the download stays out of the initial load's network contention. This is
// the sanctioned way to speed the first ad up; do NOT "improve" it by
// executing earlier — the interaction gate is the potato protection.
export function preloadRampScript() {
  if (typeof document === "undefined") return;
  if (
    document.getElementById("ramp-preload") ||
    document.getElementById(SCRIPT_ID)
  )
    return;
  const link = document.createElement("link");
  link.id = "ramp-preload";
  link.rel = "preload";
  link.as = "script";
  link.href = `https://cdn.intergient.com/${RAMP_PUB_ID}/${RAMP_WEB_ID}/ramp.js`;
  document.head.appendChild(link);
}

// Idempotent script injection. Only ever called from headContent.js's
// first-interaction gate — NEVER eagerly (July perf overhaul: the ad stack
// and everything it drags in stays off the initial load).
export function loadRampScript() {
  if (document.getElementById(SCRIPT_ID)) return;
  ensureRampStub();
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = `https://cdn.intergient.com/${RAMP_PUB_ID}/${RAMP_WEB_ID}/ramp.js`;
  script.async = true;
  document.head.appendChild(script);

  // First eviction pass as soon as RAMP boots — see sweepVideoUnits.
  sweepVideoUnits();
}

// Active unit ids whose name matches. MUST be called inside a rampQue
// callback (assumes ramp is booted). Matching is substring/regex, not
// equality: live ids carry instance/path decoration around the type name —
// CK's own teardown recipe filters getUnits() with .includes(), and a bare
// destroyUnits('standard_iab_head1') can miss the decorated id entirely,
// leaving RAMP convinced the unit is still on the page. getUnits() has
// returned both plain strings and {type} objects across RAMP versions —
// handle either.
export function activeUnitIds(match) {
  const test =
    match instanceof RegExp ? (t) => match.test(t) : (t) => t.includes(match);
  try {
    const units = window.ramp.getUnits() || [];
    return units
      .map((u) => (typeof u === "string" ? u : (u && u.type) || ""))
      .filter((t) => t && test(t));
  } catch (e) {
    return [];
  }
}

// The RAMP account has corner_ad_video ACTIVE config-side (the Aug 2
// settings dump), and the user wants no video player. Passive mode plus
// never calling spaNewPage keeps it dark in theory; this sweep is the
// enforcement for whatever slips through anyway, run at script load
// (loadRampScript) and after every slot declare (bannerAdPlaywire.js) —
// a re-declare is the moment config-side auto units could resurface. A
// unit the vendor creates asynchronously between declares can still slip
// past; the sweep is insurance, not a guarantee. Keep it until Playwire
// disables the unit config-side (asked of CK).
//
// Refresh is entirely config-side per the Aug 2 ramp.settings dump: 30s,
// in-view only, limit 100 — no client refresh code exists (header rule 2
// in bannerAdPlaywire.js). The 100-cap counter almost certainly lives on
// the unit INSTANCE, and every declare mints a fresh instance (fresh
// selectorId), so the cap bounds the IDLE tab only (no new declares) —
// it is NOT a per-tab session bound while the player hops screens.
// CAVEAT: on Aug 3 pageos viewability never tracked our fixed-overlay
// slots (inView stuck false), so config refresh may not fire at all here.
// Verify at go-live via ramp.settings.slots.<unit>.refreshes. Either
// idle outcome (≤100 refreshes or none) beats Nitro's uncapped 30s timer.
export function sweepVideoUnits() {
  rampQue(() => {
    try {
      const videoUnits = activeUnitIds(/video|trendi|bolt/i);
      if (videoUnits.length) window.ramp.destroyUnits(videoUnits);
    } catch (e) {}
  });
}

// Pageviews are registered by the ad slots themselves (bannerAdPlaywire.js),
// but only ONCE per session: slot mounts happen on every screen hop, SP
// round-over remount, and size-flipping resize — counting each would inflate
// pageviews ~2x+ and tank reported RPM. The first spaAds call of the session
// carries countPageView: true; every later one passes false (the layout
// re-declare itself is unaffected).
let pageViewCounted = false;
export function shouldCountPageView() {
  if (pageViewCounted) return false;
  pageViewCounted = true;
  return true;
}
