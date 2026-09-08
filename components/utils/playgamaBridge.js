// Playgama Bridge SDK glue — 6x portal build ONLY. Three consumers:
// the script loader (headContent.js's NEXT_PUBLIC_6X branch), the
// interstitial dispatcher (home.js crazyMidgame's 6x branch), and the
// headless banner component (bannerAdPlaygama.js). Nothing here runs on
// any other build: every caller sits behind a NEXT_PUBLIC_6X gate.
//
// The SDK auto-detects its host platform; on an unsupported host (local
// zip testing, dev) it falls back to a mock platform whose ad calls
// return safe defaults — which is why every entry point here must
// short-circuit fast instead of waiting on timeouts.
//
// SDK BEHAVIOUR THE DOCS DO NOT MENTION (verified against the de-minified
// v2.1.0 bundle, Aug 31 — re-check there, not in the wiki, when in doubt):
// - showInterstitial() is dropped SILENTLY (no state event, no throw)
//   while interstitialState is 'loading' or 'opened'. A platform that never
//   answers a request leaves the state stuck there for the session, so
//   every later request must consult interstitialState first.
// - A request inside minimumDelayBetweenInterstitial emits 'failed'
//   synchronously; the delay counts from the previous ad's 'closed'.
// - Interstitials also fail for initialInterstitialDelay (default 60s)
//   after game_ready, and NEVER serve until game_ready was sent. The zip's
//   config sets that delay to 0.
// - window 'blur' is treated as page-hidden: PAUSE_STATE_CHANGED(true) +
//   AUDIO_STATE_CHANGED(false). Clicking the cross-origin Street View
//   iframe blurs the top window, so those events must be filtered.
// - banner hide() is a no-op while the banner is still 'loading'.
import { duckAudio } from "@/components/utils/audio";

const SCRIPT_SRC = "https://bridge.playgama.com/v2/stable/playgama-bridge.js";

// An interstitial that never reaches 'opened' is treated as dead after 15s
// (mirrors the GD path's safety timeout). Once 'opened' fires, the ad owns
// the screen and gets a far longer leash — resuming mid-ad would advance
// the round underneath a running video.
const START_TIMEOUT_MS = 15000;
const OPENED_WATCHDOG_MS = 90000;

let initPromise = null;   // Promise<bridge|null>, created once
let readyBridge = null;   // the live bridge after initialize(), else null
let gameReadyWanted = false;
let gameReadySent = false;
let pendingFinish = null; // the single in-flight request's callback
let startTimer = null;    // request → 'opened' leash
let openedTimer = null;   // 'opened' → 'closed' leash
let wantedBanner = null;  // 'top' | 'bottom' | null (last write wins)
let paused = false;
let audioEnabled = true;
let adActive = false;     // an SDK interstitial is requested or on screen

// ONE writer for the master gain: the platform pause event, the platform
// audio event, and the interstitial lifecycle all funnel through here so
// the three signals can never fight over duckAudio. crazyMidgame's 6x
// branch passes its RAW callback (not the ducking wrapper) for the same
// reason — its top-of-function duckAudio(true) is undone here, by the
// derived state, on every exit path.
function applyAudioState() {
  duckAudio(paused || !audioEnabled || adActive);
}

// Exactly-once latch for the in-flight request's callback. Read-and-null
// FIRST so a second arrival (state event after a timeout, etc.) is a no-op.
// Always re-derives the gain, even with nothing latched: a stale ad that
// opened after its request timed out still needs the unduck on close.
function finishInterstitial() {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
  adActive = false;
  applyAudioState();
  const finish = pendingFinish;
  if (!finish) return;
  pendingFinish = null;
  try {
    finish();
  } catch (e) {
    console.warn("[Playgama] adFinished callback threw", e);
  }
}

// Persistent module-lifetime subscription (registered once at init) — never
// subscribe per showInterstitial call: on() has no verified unsubscribe
// contract and per-ad listeners would accumulate for the session.
// Deliberately NOT keyed to pendingFinish: an ad that opens late (after the
// start timeout already resumed the game) still gets ducked while it is on
// screen and unducked when it closes.
function onInterstitialState(state) {
  if (state === "opened") {
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    if (openedTimer) clearTimeout(openedTimer);
    openedTimer = setTimeout(() => {
      openedTimer = null;
      console.warn("[Playgama] interstitial never closed, resuming");
      finishInterstitial();
    }, OPENED_WATCHDOG_MS);
    adActive = true;
    applyAudioState();
  } else if (state === "closed" || state === "failed") {
    if (openedTimer) clearTimeout(openedTimer);
    openedTimer = null;
    finishInterstitial();
  }
}

// The SDK maps window 'blur' to page-hidden, and focusing the cross-origin
// Street View iframe blurs the top window (the repo's documented focus
// steal, see gameUI.js), so a pause/mute that arrives while the document
// is still visible is a click on the pano, not a real pause. Real tab hides
// arrive with visibilityState 'hidden'. Resumes are always honoured.
function isSpuriousHide() {
  try {
    return document.visibilityState === "visible";
  } catch (e) {
    return false;
  }
}

function subscribe(emitter, eventName, handler, label) {
  try {
    emitter.on(eventName, handler);
  } catch (e) {
    console.warn(`[Playgama] could not subscribe to ${label}`, e);
  }
}

function onBridgeReady(bridge) {
  readyBridge = bridge;
  const events = bridge.EVENT_NAME || {};
  try {
    // Fallback only: when the zip's playgama-bridge-config.json loads, the
    // SDK ignores this setter and the config's value wins. It matters if
    // the config 404s at an unexpected mount depth.
    bridge.advertisement.setMinimumDelayBetweenInterstitial(30);
  } catch (e) {}
  subscribe(bridge.advertisement, events.INTERSTITIAL_STATE_CHANGED, onInterstitialState, "interstitial state");
  subscribe(bridge.advertisement, events.BANNER_STATE_CHANGED, (state) => {
    // hide() is dropped while the banner is 'loading'; when it finally
    // shows after the home screen already unmounted, hide it now.
    if (state === "shown" && !wantedBanner) applyBanner();
  }, "banner state");
  subscribe(bridge.platform, events.PAUSE_STATE_CHANGED, (isPaused) => {
    if (isPaused && isSpuriousHide()) return;
    paused = !!isPaused;
    applyAudioState();
  }, "pause state");
  subscribe(bridge.platform, events.AUDIO_STATE_CHANGED, (isEnabled) => {
    if (!isEnabled && isSpuriousHide()) return;
    audioEnabled = !!isEnabled;
    applyAudioState();
  }, "audio state");
  try {
    audioEnabled = bridge.platform.isAudioEnabled !== false;
  } catch (e) {}
  applyAudioState();
  // The local-verification signal: on a zip test this logs the mock
  // platform with both supports false; on the real portal it names the
  // detected platform and which ad formats will actually serve. A 'mock'
  // here in production means the host is not passing a platform id.
  try {
    console.log("[Playgama] ready", bridge.platform.id, {
      interstitial: !!bridge.advertisement.isInterstitialSupported,
      banner: !!bridge.advertisement.isBannerSupported,
    });
  } catch (e) {}
  // Anything requested while the SDK was still loading applies now.
  flushGameReady();
  applyBanner();
}

// Idempotent script injection + initialize(). Resolves the SAME promise for
// every caller; resolves null (never rejects) on script or init error. No
// guard timer: a slow initialize() must not be mistaken for a dead one —
// consumers re-apply from onBridgeReady whenever it lands.
export function loadPlaygamaBridge() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = "playgama-bridge";
    script.src = SCRIPT_SRC;
    script.async = false;
    script.onerror = () => resolve(null);
    script.onload = () => {
      try {
        window.bridge
          .initialize()
          .then(() => {
            try {
              onBridgeReady(window.bridge);
            } catch (e) {
              console.warn("[Playgama] post-init setup threw", e);
            }
            resolve(readyBridge);
          })
          .catch((e) => {
            console.warn("[Playgama] initialize failed", e);
            resolve(null);
          });
      } catch (e) {
        resolve(null);
      }
    };
    document.body.appendChild(script);
  });
  return initPromise;
}

// The crazyMidgame worker. SYNCHRONOUS readiness checks, never await: if
// the SDK is absent, mock, unsupported, or already busy, the round advance
// must be instant — missing an ad beats a stalled loading cover. The SDK
// paces frequency itself (minimumDelayBetweenInterstitial → synchronous
// 'failed', which resolves the latch through onInterstitialState), so
// there is deliberately no local throttle.
export function showPlaygamaInterstitial(onFinished = () => {}) {
  // A second break point while a request is live (only effects and timers
  // can do this; the UI is under the ad): run it when the ad ends instead
  // of resuming the game underneath the ad.
  if (pendingFinish) {
    const first = pendingFinish;
    pendingFinish = () => {
      first();
      onFinished();
    };
    return;
  }
  const bail = () => {
    applyAudioState();
    onFinished();
  };
  if (!readyBridge) return bail();
  let supported = false;
  let busy = false;
  try {
    supported = !!readyBridge.advertisement.isInterstitialSupported;
    const state = readyBridge.advertisement.interstitialState;
    busy = state === "loading" || state === "opened";
  } catch (e) {}
  if (!supported || busy) return bail();
  pendingFinish = onFinished;
  adActive = true;
  applyAudioState();
  startTimer = setTimeout(() => {
    startTimer = null;
    console.warn("[Playgama] interstitial never started, resuming");
    finishInterstitial();
  }, START_TIMEOUT_MS);
  try {
    readyBridge.advertisement.showInterstitial();
  } catch (e) {
    console.warn("[Playgama] showInterstitial threw", e);
    finishInterstitial();
  }
}

// Single entry point for the SDK-overlay banner. `wantedBanner` is written
// synchronously and read at apply time, so a hide issued before init still
// wins and rapid mount/unmount resolves to the last write.
function applyBanner() {
  if (!readyBridge) return;
  try {
    if (!readyBridge.advertisement.isBannerSupported) return;
    if (wantedBanner) readyBridge.advertisement.showBanner(wantedBanner);
    else readyBridge.advertisement.hideBanner();
  } catch (e) {
    // Platform without banners — no-op by design.
  }
}

export function setPlaygamaBanner(position) {
  if (typeof window === "undefined") return;
  wantedBanner = position || null;
  applyBanner();
}

// Platform requirement: game_ready at the first playable frame — the
// platform holds its own loading screen until it arrives, and the SDK
// refuses every interstitial until it has been sent. Latched only once the
// message actually went out, so a request that lands before init is kept
// and flushed from onBridgeReady.
function flushGameReady() {
  if (gameReadySent || !gameReadyWanted || !readyBridge) return;
  try {
    readyBridge.platform.sendMessage("game_ready");
    gameReadySent = true;
  } catch (e) {
    console.warn("[Playgama] game_ready failed", e);
  }
}

export function sendPlaygamaGameReady() {
  gameReadyWanted = true;
  flushGameReady();
}

// DELIBERATELY NOT integrated (pending decisions, on record in
// docs/environment-variables.md "### 6x"): rewarded ads (no portal build
// grants rewards), bridge.storage (6x is accountless; localStorage prefs
// stay), bridge.platform.language localization.
