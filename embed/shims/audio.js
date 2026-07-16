// Audio shim for the standalone embed (WebView) — a no-op EXCEPT the pin.
//
// The WebView must NOT carry the web Web Audio engine: it would play sounds
// governed by the WebView's own private localStorage volumes that the app's
// native sound settings can never reach. But the PIN click is latency-
// critical, and playing it natively meant tap → Leaflet click → postMessage
// bridge → RN JS → expo-audio — the bridge hop read as lag on device. So this
// shim implements exactly ONE sound, 'pin', as a Web Audio buffer source
// fired inside the same click handler web uses (Map.js ClickHandler, with its
// answerShown / already-final guards) — web-identical sample accuracy, zero
// bridge in the audio path.
//
// VOLUME STAYS NATIVE-GOVERNED: the host pushes the app's effective SFX gain
// (perceptual toGain(slider), 0..1) into `window.__nativeSfxGain` on every
// updateProps (EmbeddedMap `sfxGain` prop → entry.jsx). No localStorage, no
// second source of truth; gain 0 = no fetch, no decode, no sound.
//
// AUDIO SESSION: the WebView does NOT share the app's AVAudioSession. The
// moment this page activates an AudioContext — even a silent one — WebKit
// raises its own DEFAULT ('auto' → non-mixable playback) audio session,
// which OS-interrupts the app's ambient expo-audio music: a pause+resume
// blip on every map mount/unmount (every game entry/exit). ensureCtx
// declares the page's session 'ambient' BEFORE constructing the context so
// it mixes and never grabs focus; ambient also respects the ring/silent
// switch, matching the app's playsInSilentMode: false policy.
//
// Every other export keeps the no-op surface so no other web sound can sneak
// into the bundle.

import PIN_SRC from '../../public/sounds/pin.mp3';

const PIN_COOLDOWN_MS = 80;
const PIN_PITCH_JITTER = 0.06;

let ctx = null;
let pinBuffer = null;
let pinDecode = null;
let lastPinAt = 0;

function hostGain() {
  const g = typeof window !== 'undefined' ? window.__nativeSfxGain : 0;
  return typeof g === 'number' && g > 0 ? Math.min(1, g) : 0;
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    // Ambient BEFORE construction — see the AUDIO SESSION note in the header.
    // WebKit-only API (iOS 16.4+); guarded no-op on Android, where Chromium
    // doesn't focus-grab for a silent context in the first place.
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { }
    ctx = new AC();
  }
  // Warm the context off the tap path — the host sets
  // mediaPlaybackRequiresUserAction={false}, so this usually succeeds before
  // the first tap. Where the platform still insists on a gesture it's a
  // harmless rejection; the unlock-gated play below covers that first tap.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function ensurePinBuffer() {
  if (pinBuffer || pinDecode) return pinDecode;
  const c = ensureCtx();
  if (!c) return null;
  pinDecode = fetch(PIN_SRC)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      pinBuffer = buf;
    })
    .catch(() => {
      pinDecode = null; // retry on the next preload/play
    });
  return pinDecode;
}

function spawnPin(gain, startAt) {
  const src = ctx.createBufferSource();
  src.buffer = pinBuffer;
  // Anti-repetition jitter — same ±6% as the app/web engines.
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * PIN_PITCH_JITTER;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(ctx.destination);
  src.start(startAt);
}

export function preloadSfx(...names) {
  try {
    if (names.indexOf('pin') !== -1 && hostGain() > 0) ensurePinBuffer();
  } catch (e) {}
}

export function playSfx(name) {
  try {
    if (name !== 'pin') return; // only the pin lives in the WebView
    const gain = hostGain();
    if (gain <= 0) return;
    const now = Date.now();
    if (now - lastPinAt < PIN_COOLDOWN_MS) return;
    lastPinAt = now;
    ensurePinBuffer();
    if (!ctx) return;
    if (ctx.state === 'running' && pinBuffer) {
      spawnPin(gain, 0); // hot path: sample-accurate, zero added latency
      return;
    }
    // First-tap unlock: gate on decode + resume, then a 50ms cushion so the
    // click isn't swallowed into dropped quanta while the output stream opens
    // (web audio.js first-play-of-session lore).
    Promise.all([pinDecode, ctx.resume()])
      .then(() => {
        if (pinBuffer) spawnPin(gain, ctx.currentTime + 0.05);
      })
      .catch(() => {});
  } catch (e) {}
}

export function subscribeVolumes() {
  return () => {};
}
export function stopSfx() {}
export function getSfxVolume() {
  return 0;
}
export function setSfxVolume() {}
export function attachUiClickSounds() {
  return () => {};
}
export function setMusicAllowed() {}
export function startMusic() {}
export function setMusicPlaylist() {}
export function stopMusic() {}
export function getMusicVolume() {
  return 0;
}
export function setMusicVolume() {}
export function duckAudio() {}
