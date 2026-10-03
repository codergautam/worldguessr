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
// its terminal event ('closed' / 'failed', per the SDK docs) releases our
// latch; video duration is not ours, so the opened leash is generous. If a
// platform adapter never sends a terminal event, the leash releases only OUR
// latch: applyAudioState still honors the platform pause flag, which the docs
// make authoritative ("pause gameplay, timers, and audio while isPaused").
const START_TIMEOUT_MS = 15000;
const OPENED_TIMEOUT_MS = 120000;
// Lifecycle messages queued before game_ready. The docs make game_ready the
// only required message; the rest are hints, so the queue is bounded.
const PENDING_MESSAGE_LIMIT = 32;
// Placement id declared in scripts/embed-assets/6x/playgama-bridge-config.json
// (interstitial.placements / preloadOnStart / placementFallback).
export const INTERSTITIAL_PLACEMENT = "round_end";

let initPromise = null;   // Promise<bridge|null>, created once
let readyBridge = null;   // the live bridge after initialize(), else null
let gameReadyWanted = false;
let gameReadySent = false;
let pendingFinish = null; // callbacks waiting for the single in-flight ad
let startTimer = null;    // request → 'opened' leash
let openedTimer = null;   // 'opened' → terminal-event leash
let scriptLoaded = false; // the SDK <script> executed (window.bridge is ours)
let wantedBanner = null;  // 'top' | 'bottom' | null (last write wins)
let paused = false;
let audioEnabled = true;
let adActive = false;     // an SDK interstitial is requested or on screen
let gameplayPaused = false;
let stateTimer = null;
let visibilityListenersInstalled = false;
const pauseListeners = new Set();
const readyListeners = new Set();
let ignoredPause = false;  // a blur pause the SDK failed to clear on replay
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
  const hostPaused = paused && !ignoredPause;
  duckAudio(hostPaused || !audioEnabled || adActive || hidden);
  const next = hostPaused || adActive || hidden;
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
  if (openedTimer) clearTimeout(openedTimer);
  openedTimer = null;
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
    if (openedTimer) clearTimeout(openedTimer);
    openedTimer = setTimeout(() => {
      openedTimer = null;
      console.warn("[Playgama] interstitial reported opened but never closed; releasing the round advance");
      finishInterstitial();
    }, OPENED_TIMEOUT_MS);
    adActive = true;
    applyAudioState();
  } else if (state === "closed" || state === "failed") {
    finishInterstitial();
  }
}

// interstitialState is a getter on the SDK; a throwing adapter must not
// take a timer callback down with it.
function readInterstitialState() {
  try { return readyBridge?.advertisement?.interstitialState; } catch (e) { return undefined; }
}

// The ONE deliberate deviation from "pause while isPaused": the SDK treats
// a window blur as page-hidden, and clicking the Street View iframe blurs
// the window while the player is actively playing. Once the focused iframe
// settles (a task later), replaying the REAL document visibility lets Bridge
// clear ONLY its visibility reason; its ad and host pause/mute reasons stay
// intact. Never manufacture a focus event or discard all visible-tab pauses
// (host overlays are visible too). Triggered from both the blur itself and
// from the SDK's pause event, so it does not depend on the SDK emitting its
// pause synchronously inside the blur handler.
function isPanoFrameFocused() {
  const frame = document.activeElement;
  return document.visibilityState === "visible" && document.hasFocus() && frame?.tagName === "IFRAME" &&
    (frame.id === "streetview" || !!frame.closest?.(".daily-meta-card__pano"));
}

function replayVisibilityIfPanoFocused() {
  setTimeout(() => {
    if (!isPanoFrameFocused()) return;
    document.dispatchEvent(new Event("visibilitychange"));
    // Safety net. On SDK 2.2.0 the replay above clears the blur pause
    // synchronously (its visibilitychange handler re-reads the document
    // state), so this never fires. Should a future SDK keep the pause, every
    // panorama click would otherwise strand the player behind the cover: a
    // pause that survives the replay while our own iframe holds focus and no
    // ad is on screen is treated as that blur pause and ignored until the
    // next pause event.
    setTimeout(() => {
      if (paused && !ignoredPause && !adActive && isPanoFrameFocused()) {
        console.warn("[Playgama] ignoring a visible-tab pause caused by focusing the panorama");
        ignoredPause = true;
        schedulePlatformState();
      }
    }, 0);
  }, 0);
}

// Register BEFORE loading Bridge, so this task precedes our deferred pause
// notification.
function installVisibilityListeners() {
  if (visibilityListenersInstalled) return;
  visibilityListenersInstalled = true;
  window.addEventListener("blur", replayVisibilityIfPanoFocused);
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
    ignoredPause = false;
    if (paused) replayVisibilityIfPanoFocused();
    schedulePlatformState();
  }, "pause state");
  subscribe(bridge.platform, events.AUDIO_STATE_CHANGED, (isEnabled) => {
    audioEnabled = !!isEnabled;
    schedulePlatformState();
  }, "audio state");
  try {
    audioEnabled = bridge.platform.isAudioEnabled !== false;
    paused = !!bridge.platform.isPaused;
  } catch (e) {}
  // Docs: "Check interstitialState at game start. If the state is opened,
  // immediately mute audio and pause gameplay." Routed through the event
  // handler so the terminal-event leash covers a stale startup state too.
  if (readInterstitialState() === "opened") onInterstitialState("opened");
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
  readyListeners.forEach((listener) => {
    try { listener(bridge); } catch (e) { console.warn("[Playgama] ready listener threw", e); }
  });
}

// Fires once initialize() has succeeded, including for a subscriber that
// arrives afterwards. The boot gate uses it to attach the save and apply the
// platform language when the SDK only became available after the game
// mounted (headContent retries loadPlaygamaBridge on mount).
export function subscribePlaygamaReady(listener) {
  readyListeners.add(listener);
  if (readyBridge) {
    try { listener(readyBridge); } catch (e) { console.warn("[Playgama] ready listener threw", e); }
  }
  return () => readyListeners.delete(listener);
}

// Idempotent script injection + initialize(). Resolves the SAME promise for
// every caller; resolves null (never rejects) on script or init error. No
// guard timer: a slow initialize() must not be mistaken for a dead one —
// consumers re-apply from onBridgeReady whenever it lands. A retry after an
// initialize() rejection re-runs initialize() on the already-loaded SDK; only
// a script that never loaded gets injected again (the docs' Cocos note warns
// that two copies of the SDK is a broken setup).
export function loadPlaygamaBridge() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (initPromise) return initPromise;
  installVisibilityListeners();
  initPromise = new Promise((resolve) => {
    const fail = (error) => {
      console.warn("[Playgama] initialization failed", error);
      initPromise = null;
      resolve(null);
    };
    const initialize = () => {
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
    if (scriptLoaded && window.bridge) {
      initialize();
      return;
    }
    const script = document.createElement("script");
    script.id = "playgama-bridge";
    script.src = SCRIPT_SRC;
    script.async = false;
    script.onerror = (error) => {
      script.remove();
      fail(error);
    };
    script.onload = () => {
      scriptLoaded = true;
      initialize();
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
  // instead of advancing a new round under a live ad. Only an ad we saw open
  // (event or startup read) counts: a getter stuck on 'opened' after the
  // leash released it would otherwise cost every round advance two minutes,
  // so that case skips the ad instead.
  if (state === "opened") {
    if (!adActive) return bail();
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
    if (readInterstitialState() === "opened") {
      onInterstitialState("opened");
      return;
    }
    console.warn("[Playgama] interstitial never started, resuming");
    finishInterstitial();
  }, START_TIMEOUT_MS);
  const callbacks = pendingFinish;
  try {
    // Placement id per the docs' showInterstitial(placement) signature; the
    // zip config declares it and preloads it after initialization.
    const request = readyBridge.advertisement.showInterstitial(INTERSTITIAL_PLACEMENT);
    // The docs document state events, not a return contract. Catch a
    // rejected promise too if a platform adapter provides one; resolving is
    // NOT evidence the ad ended.
    if (request?.catch) request.catch(() => {
      if (pendingFinish === callbacks && readInterstitialState() !== "opened") finishInterstitial();
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
    if (pendingMessages.length >= PENDING_MESSAGE_LIMIT) pendingMessages.shift();
    pendingMessages.push([message, parameters]);
    return;
  }
  try {
    readyBridge.platform.sendMessage(message, parameters)?.catch?.((e) => {
      console.warn(`[Playgama] ${message} delivery failed`, e);
    });
  } catch (e) { console.warn(`[Playgama] ${message} failed`, e); }
}
