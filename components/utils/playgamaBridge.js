// Playgama Bridge SDK glue — 6x portal build ONLY. Bootstrap initializes it;
// Home/GameUI report readiness, rounds and ad breaks; the banner component
// owns menu banners. Other builds never load or initialize the SDK.
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
// - window 'blur' is treated as page-hidden. Focusing our panorama iframe
//   must restore the SDK's visibility reason without ignoring host pauses.
// - banner hide() is a no-op while the banner is still 'loading'.
import { duckAudio } from "@/components/utils/audio";

const SCRIPT_SRC = "https://bridge.playgama.com/v2/stable/playgama-bridge.js";

// A request that never starts must not strand the player. Once an ad opens,
// only its terminal event can release gameplay; video duration is not ours.
const START_TIMEOUT_MS = 15000;

let initPromise = null;   // Promise<bridge|null>, created once
let readyBridge = null;   // the live bridge after initialize(), else null
let gameReadyWanted = false;
let gameReadySent = false;
let pendingFinish = null; // callbacks waiting for the single in-flight ad
let startTimer = null;    // request → 'opened' leash
let wantedBanner = null;  // 'top' | 'bottom' | null (last write wins)
let paused = false;
let audioEnabled = true;
let adActive = false;     // an SDK interstitial is requested or on screen
let gameplayPaused = false;
let stateTimer = null;
let visibilityListenersInstalled = false;
const pauseListeners = new Set();
const finishedCallbacks = [];
const pendingMessages = [];

export function getPlaygamaPaused() { return gameplayPaused; }

export function subscribePlaygamaPause(listener) {
  pauseListeners.add(listener);
  return () => pauseListeners.delete(listener);
}

// ONE writer for the master gain: the platform pause event, the platform
// audio event, and the interstitial lifecycle all funnel through here so
// the three signals can never fight over duckAudio. crazyMidgame's 6x branch
// passes its raw callback before touching the other portals' audio wrapper.
function applyAudioState() {
  const hidden = document.visibilityState === "hidden";
  duckAudio(paused || !audioEnabled || adActive || hidden);
  const next = paused || adActive || hidden;
  if (next !== gameplayPaused) {
    gameplayPaused = next;
    pauseListeners.forEach((listener) => listener());
  }
  // Bridge emits an ad's closed event BEFORE releasing its platform pause.
  // Run round advances only after that release (or a later tab resume), once
  // timer subscribers have compensated for the time spent paused.
  while (!gameplayPaused && finishedCallbacks.length) {
    finishCallback(finishedCallbacks.shift());
  }
}

function schedulePlatformState() {
  if (stateTimer !== null) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    applyAudioState();
  }, 0);
}

// Exactly-once latch for the in-flight request's callbacks. Clear the latch
// before notifying, so a second state event or timeout cannot repeat them.
// Always re-derives the gain, even with nothing latched: a stale ad that
// opened after its request timed out still needs the unduck on close.
function finishInterstitial() {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
  adActive = false;
  if (pendingFinish) finishedCallbacks.push(...pendingFinish);
  pendingFinish = null;
  applyAudioState();
}

function finishCallback(callback) {
  try { callback(); }
  catch (e) { console.warn("[Playgama] adFinished callback threw", e); }
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
    adActive = true;
    applyAudioState();
  } else if (state === "closed" || state === "failed") {
    finishInterstitial();
  }
}

// Register BEFORE loading Bridge, so this task precedes our deferred pause
// notification. The focused iframe settles after blur. Replaying the real
// document visibility lets Bridge clear ONLY its visibility reason; its ad
// and host pause/mute reasons remain intact. Never manufacture a focus event
// or discard all visible-tab pauses (host overlays are visible too).
function installVisibilityListeners() {
  if (visibilityListenersInstalled) return;
  visibilityListenersInstalled = true;
  window.addEventListener("blur", () => {
    setTimeout(() => {
      const frame = document.activeElement;
      if (document.visibilityState === "visible" && document.hasFocus() && frame?.tagName === "IFRAME" &&
          (frame.id === "streetview" || frame.closest?.(".daily-meta-card__pano"))) {
        document.dispatchEvent(new Event("visibilitychange"));
      }
    }, 0);
  });
  document.addEventListener("visibilitychange", schedulePlatformState);
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
    paused = !!isPaused;
    schedulePlatformState();
  }, "pause state");
  subscribe(bridge.platform, events.AUDIO_STATE_CHANGED, (isEnabled) => {
    audioEnabled = !!isEnabled;
    schedulePlatformState();
  }, "audio state");
  try {
    audioEnabled = bridge.platform.isAudioEnabled !== false;
    paused = !!bridge.platform.isPaused;
    adActive = bridge.advertisement.interstitialState === "opened";
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
  installVisibilityListeners();
  initPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = "playgama-bridge";
    script.src = SCRIPT_SRC;
    script.async = false;
    const fail = (error) => {
      console.warn("[Playgama] initialization failed", error);
      script.remove();
      initPromise = null;
      resolve(null);
    };
    script.onerror = fail;
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
          .catch(fail);
      } catch (e) {
        fail(e);
      }
    };
    document.body.appendChild(script);
  });
  return initPromise;
}

// The crazyMidgame worker. SYNCHRONOUS readiness checks, never await: if
// the SDK is absent, mock, unsupported, or stuck loading, skip the request.
// An existing open ad must finish before a new round can advance. The SDK
// paces frequency itself (minimumDelayBetweenInterstitial → synchronous
// 'failed', which resolves the latch through onInterstitialState), so
// there is deliberately no local throttle.
export function showPlaygamaInterstitial(onFinished = () => {}) {
  // A second break point while a request is live (only effects and timers
  // can do this; the UI is under the ad): run it when the ad ends instead
  // of resuming the game underneath the ad.
  if (pendingFinish) {
    pendingFinish.push(onFinished);
    return;
  }
  const bail = () => {
    finishedCallbacks.push(onFinished);
    applyAudioState();
  };
  if (!readyBridge) return bail();
  let supported = false;
  let state;
  try {
    supported = !!readyBridge.advertisement.isInterstitialSupported;
    state = readyBridge.advertisement.interstitialState;
  } catch (e) {}
  if (!supported) return bail();
  // A late ad may have opened after its startup timeout. Join its completion
  // instead of advancing a new round under a live ad.
  if (state === "opened") {
    pendingFinish = [onFinished];
    onInterstitialState("opened");
    return;
  }
  if (state === "loading") return bail();
  pendingFinish = [onFinished];
  adActive = true;
  applyAudioState();
  startTimer = setTimeout(() => {
    startTimer = null;
    if (readyBridge.advertisement.interstitialState === "opened") {
      onInterstitialState("opened");
      return;
    }
    console.warn("[Playgama] interstitial never started, resuming");
    finishInterstitial();
  }, START_TIMEOUT_MS);
  const callbacks = pendingFinish;
  try {
    const request = readyBridge.advertisement.showInterstitial();
    // Current Bridge uses state events. Catch a rejected promise too if a
    // platform adapter provides one; resolving is NOT evidence the ad ended.
    if (request?.catch) request.catch(() => {
      if (pendingFinish === callbacks && readyBridge.advertisement.interstitialState !== "opened") finishInterstitial();
    });
  } catch (e) {
    console.warn("[Playgama] showInterstitial threw", e);
    if (pendingFinish === callbacks) finishInterstitial();
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
    const result = readyBridge.platform.sendMessage("game_ready");
    gameReadySent = true;
    result?.catch?.((e) => console.warn("[Playgama] game_ready delivery failed", e));
    pendingMessages.splice(0).forEach(([message, parameters]) => sendPlaygamaMessage(message, parameters));
  } catch (e) {
    console.warn("[Playgama] game_ready failed", e);
  }
}

export function sendPlaygamaGameReady() {
  gameReadyWanted = true;
  flushGameReady();
}

export function sendPlaygamaMessage(message, parameters) {
  if (process.env.NEXT_PUBLIC_6X !== "true") return;
  if (!readyBridge || !gameReadySent) {
    pendingMessages.push([message, parameters]);
    return;
  }
  try {
    readyBridge.platform.sendMessage(message, parameters)?.catch?.((e) => {
      console.warn(`[Playgama] ${message} delivery failed`, e);
    });
  } catch (e) { console.warn(`[Playgama] ${message} failed`, e); }
}
