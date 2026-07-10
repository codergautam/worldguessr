// Tiny Web Audio SFX manager — the single home for game sounds.
//
// Design rules:
//  - Every sound is fetched + decoded EXACTLY once per session: decoded
//    buffers live in an in-memory cache and concurrent plays share one
//    in-flight fetch, so replays cost zero network.
//  - The AudioContext is created lazily (it starts suspended, which is fine
//    for decoding) and resumed inside user gestures, satisfying autoplay
//    policy. Nothing here runs before the first interaction.
//  - Small random pitch jitter + a per-sound cooldown keep repeated effects
//    from grating or machine-gunning.
//  - All sounds are MP3: it's the one compressed format every browser
//    decodes (Safari/iOS can't do Ogg Vorbis). Adding a sound = drop
//    name.mp3 into public/sounds/, call playSfx('name'). If a source
//    arrives in another format, transcode once:
//    ffmpeg -i src.ogg -codec:a libmp3lame -q:a 4 name.mp3
//  - Audio must never break gameplay: every entry point swallows errors.
import { asset } from '@/lib/basePath';
import gameStorage from '@/components/utils/localStorage';

const DEFAULT_VOLUME = 0.85;
const DEFAULT_COOLDOWN_MS = 80;
const DEFAULT_PITCH_JITTER = 0.06;

// Slider→gain perceptual mapping. Loudness perception is roughly
// logarithmic, so wiring slider position straight into a GainNode packs
// nearly all audible change into the bottom sliver — 20% and 100% sound
// alike (a ~14dB spread). Squaring spreads it to ~28dB so the whole slider
// travel does something. Storage and the settings UI stay in slider space
// (0-1); apply this ONLY where a user-facing volume reaches a gain node.
// Per-play SFX `volume` options are mix ratios tuned by ear — keep those
// linear. Defaults above/below are slider-space: 0.85²≈0.7 sfx gain and
// 0.45²≈0.2 music gain, the original tuned loudness.
function toGain(v) {
  return v * v;
}

let ctx = null;
let masterGain = null;
let sfxGain = null;
let cachedVolume = null;

const buffers = new Map();    // name -> decoded AudioBuffer
const inflight = new Map();   // name -> in-flight load Promise
const lastPlayed = new Map(); // name -> last play timestamp (cooldown)
const activeSources = new Map(); // name -> Set of live play handles (for stopSfx)

// Volume-change subscription for UI that mirrors volume state (the navbar
// sound button's muted glyph). Both setters notify; useSyncExternalStore
// consumers re-read via the getters. Returns the unsubscribe.
const volumeListeners = new Set();
export function subscribeVolumes(cb) {
  volumeListeners.add(cb);
  return () => volumeListeners.delete(cb);
}
function notifyVolumes() {
  for (const cb of volumeListeners) { try { cb(); } catch (e) { } }
}

function soundUrl(name) {
  return asset(`/sounds/${name}.mp3`);
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = toGain(getSfxVolume());
  sfxGain.connect(masterGain);
  return ctx;
}

// Older Safari only supports the callback form of decodeAudioData; modern
// browsers return a promise. Resolve is idempotent, so wiring both is safe.
function decode(c, data) {
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

function loadBuffer(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name));
  if (inflight.has(name)) return inflight.get(name);
  const promise = fetch(soundUrl(name))
    .then((res) => {
      if (!res.ok) throw new Error(`sfx ${name}: HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => {
      const c = ensureContext();
      if (!c) throw new Error('no AudioContext');
      return decode(c, data);
    })
    .then((buffer) => {
      buffers.set(name, buffer);
      return buffer;
    })
    .catch((e) => {
      // Not cached — a later play retries (e.g. transient network blip).
      console.warn('sfx load failed', name, e);
      return null;
    })
    .finally(() => inflight.delete(name));
  inflight.set(name, promise);
  return promise;
}

// Fetch + decode ahead of time so the first play has zero latency. Only call
// from post-interaction surfaces (component mounts inside the game), never at
// page load. Skipped entirely while muted so muted users spend no data.
export function preloadSfx(...names) {
  try {
    if (typeof window === 'undefined') return;
    if (getSfxVolume() <= 0) return;
    for (const name of names) loadBuffer(name);
  } catch (e) { }
}

// `rate` = deterministic playbackRate (pitch and speed together, like a
// record player) — for sounds whose pitch carries MEANING (the reveal sound
// tracks guess quality). Overrides the anti-repetition jitter entirely:
// meaningful pitch must not wobble.
export function playSfx(name, { volume = 1, pitchJitter = DEFAULT_PITCH_JITTER, rate = null, cooldownMs = DEFAULT_COOLDOWN_MS, skipWhenSuspended = false, debounce = false } = {}) {
  try {
    if (typeof window === 'undefined') return;
    if (getSfxVolume() <= 0) return;
    const now = Date.now();
    const blocked = now - (lastPlayed.get(name) || 0) < cooldownMs;
    if (blocked) {
      // debounce: a swallowed attempt still pushes the window forward, so a
      // continuous event stream plays once and then stays silent until it
      // rests for cooldownMs (leading-edge debounce). Without it this is a
      // plain throttle (periodic replays every cooldownMs).
      if (debounce) lastPlayed.set(name, now);
      return;
    }
    lastPlayed.set(name, now);

    const c = ensureContext();
    if (!c) return;
    // A context that isn't rendering yet — fresh context still opening its
    // output stream (a new AudioContext is born 'suspended' and flips to
    // 'running' async), or suspended pre-unlock / after an OS interruption —
    // swallows short one-shots scheduled into the spin-up window: the classic
    // silent FIRST click of a session. Hold the start until resume() resolves
    // (see the Promise.all below), then cushion it slightly into the future.
    let unlocked = null;
    if (c.state !== 'running') {
      unlocked = c.resume().catch(() => { });
      // Non-gesture sounds (hover) can't unlock the context; starting them
      // while suspended would queue them all up to burst out together on the
      // first real click. Drop them instead — they're disposable.
      if (skipWhenSuspended && c.state === 'suspended') return;
    }

    // Registered before the (usually cached) load resolves so stopSfx can
    // cancel a play that is still fetching/decoding.
    const handle = { source: null, gainNode: null, cancelled: false };
    let live = activeSources.get(name);
    if (!live) { live = new Set(); activeSources.set(name, live); }
    live.add(handle);

    Promise.all([loadBuffer(name), unlocked]).then(([buffer]) => {
      if (!buffer || !ctx || handle.cancelled) { live.delete(handle); return; }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (rate != null) {
        source.playbackRate.value = rate;
      } else if (pitchJitter > 0) {
        source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchJitter;
      }
      // Per-play gain (even at volume 1) so stopSfx can fade this instance.
      const g = ctx.createGain();
      g.gain.value = volume;
      source.connect(g);
      g.connect(sfxGain);
      handle.source = source;
      handle.gainNode = g;
      source.onended = () => live.delete(handle);
      // Unlock plays start 50ms out so the sound clears the just-opened
      // output stream; warm plays keep zero added latency.
      source.start(unlocked ? ctx.currentTime + 0.05 : 0);
    });
  } catch (e) { }
}

// Fade out and stop every live instance of a sound. For long beds (the
// round-clock ticking) whose reason can vanish early — the round advancing
// before the clock runs out must not leave ticks playing over the reveal.
// One-shots never need this; they just end.
export function stopSfx(name, fadeOutS = 0.25) {
  try {
    const live = activeSources.get(name);
    if (!live || live.size === 0) return;
    for (const h of live) {
      h.cancelled = true; // covers a play still fetching/decoding
      if (h.source && h.gainNode && ctx) {
        const g = h.gainNode.gain;
        const now = ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + fadeOutS);
        try { h.source.stop(now + fadeOutS + 0.02); } catch (e) { }
      }
    }
    live.clear();
  } catch (e) { }
}

export function getSfxVolume() {
  if (cachedVolume !== null) return cachedVolume;
  let v = NaN;
  try {
    const raw = gameStorage.getItem('sfxVolume');
    if (raw !== null && raw !== undefined && raw !== '') v = Number(raw);
  } catch (e) { }
  cachedVolume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  return cachedVolume;
}

export function setSfxVolume(v) {
  try {
    cachedVolume = Math.min(1, Math.max(0, Number(v) || 0));
    notifyVolumes();
    try { gameStorage.setItem('sfxVolume', String(cachedVolume)); } catch (e) { }
    if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(toGain(cachedVolume), ctx.currentTime, 0.02);
  } catch (e) { }
}

// One delegated listener sounds every button in the app: the home main menu
// (.g2_nav_ui) keeps its distinct 'ui_click', everything else (next round,
// back, map selector, modals, ...) gets the subtler 'click_2'. Container-
// scoped split, so new menu entries inherit the menu sound and every other
// button works with zero wiring. Buttons whose press already triggers its own
// immediate sound can opt out with data-no-click-sfx (e.g. the singleplayer
// guess button, where the reveal whoosh lands on the same press). Capture
// phase so handlers that stopPropagation can't eat it; the shared per-sound
// cooldown absorbs double-fires. Call once from the app shell.
export function attachUiClickSounds() {
  try {
    if (typeof window === 'undefined' || window.__uiClickSfx) return;
    window.__uiClickSfx = true;
    // Decode ahead on the first pointer activity anywhere (fetch/decode need
    // no gesture — only playback does), so the first audible sound is instant.
    const warm = () => {
      window.removeEventListener('pointerdown', warm, true);
      window.removeEventListener('pointerover', warm, true);
      preloadSfx('ui_click', 'ui_hover', 'click_2');
    };
    window.addEventListener('pointerdown', warm, true);
    window.addEventListener('pointerover', warm, true);
    // Background music starts on the first click anywhere on a music-allowed
    // page — click is a user activation event in every browser, so play()
    // can't be refused. Attached for the app's lifetime (startMusic no-ops
    // when playing / muted / not allowed, so idle clicks cost nothing): a
    // client-side nav off the game surface stops the music, and the next
    // click back on it must be able to restart.
    window.addEventListener('click', () => startMusic(), true);
    // Connectivity returning is the click-free resume: a track that died
    // while offline disarmed musicOn (error handler / play() rejection), and
    // the user may just be sitting there watching the reconnect toast.
    // startMusic no-ops unless music is allowed, audible, and actually dead.
    window.addEventListener('online', () => startMusic());
    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest && e.target.closest('button, [role="button"]');
      if (!el || el.disabled || el.hasAttribute('data-no-click-sfx')) return;
      playSfx(el.closest('.g2_nav_ui') ? 'ui_click' : 'click_2');
    }, true);
    // Hover tick. pointerenter doesn't bubble, so delegate pointerover and
    // ignore moves between children of the same button (relatedTarget = the
    // element the pointer came from). Mouse only: on touch, pointerover fires
    // as part of every tap and would double up with the click sound.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const el = e.target && e.target.closest && e.target.closest('.g2_nav_ui button');
      if (!el || el.disabled) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      // Debounce sweep-across-the-menu spam: first hover ticks instantly,
      // further ticks are swallowed until the pointer rests 150ms. (Leading
      // edge on purpose — a trailing debounce would delay the tick.)
      playSfx('ui_hover', { skipWhenSuspended: true, volume: 0.12, cooldownMs: 100, debounce: true });
    }, true);
  } catch (e) { }
}

// ---------------------------------------------------------------------------
// Background music. Streamed through an <audio> element into the same graph —
// never decoded into AudioBuffers, so a track costs memory only while it
// plays. Shuffled playlist that never repeats a track back-to-back; every
// track start fades in, every stop fades out. Deliberately quiet by default.
// Tracks live in public/music/<name>.mp3 and are loudness-matched to
// ~-14.5 LUFS — check new tracks with
//   ffmpeg -i track.mp3 -af loudnorm=print_format=summary -f null -
// before adding them here.
// Two moods, one player: 'chill' everywhere, 'competitive' only inside
// matchmade duels/2v2 (home.js flips the playlist on match entry/exit).
// Entries are path fragments under public/music/.
const PLAYLISTS = {
  chill: [
    'drift-across-moss',
    'glass-puzzle-horizon',
    'glass-tide',
    'mosslight-drift',
    'open-horizon-drift',
    'puzzle-ambient-1',
    'puzzle-ambient-2',
  ],
  competitive: [
    'competitive/drift-between-glass',
    'competitive/flowing-forward',
    'competitive/glass-circuit',
    'competitive/pulsing-current',
    'competitive/slow-drift-circuit',
  ],
};
const MUSIC_FADE_IN_S = 2;
// The very first track of a page load eases in far slower — music sneaking
// up on a fresh visitor reads gentler than a 2s swell out of silence.
// Module state scopes it naturally: one slow fade per page load.
const MUSIC_FIRST_FADE_IN_S = 10;
const MUSIC_FADE_OUT_S = 1;
// Playlist switches get a slightly longer out-fade than a plain stop: the
// mood handoff should breathe, not clip.
const MUSIC_SWITCH_FADE_OUT_S = 1.5;
// Hidden-tab behavior: no hard cut. Fading starts the moment the tab hides
// (grace 0 — user ruling) and drifts to silence, then pauses so a
// backgrounded tab streams nothing; a track that ends while hidden doesn't
// queue a new one.
const MUSIC_HIDDEN_GRACE_S = 0;
const MUSIC_HIDDEN_FADE_S = 5;
const DEFAULT_MUSIC_VOLUME = 0.45; // slider-space; toGain squares it to a ~0.2 gain

let musicEl = null;
let musicGain = null;
let musicOn = false;
let musicAllowed = false;
let activePlaylist = 'chill';
let playingPlaylist = null;   // which list the CURRENT track came from
let playlistSwitchTimer = null;
let lastTrackIdx = -1;
let cachedMusicVolume = null;
let musicPlayPending = false; // a playNextTrack() play() awaiting its verdict
let musicStallPos = -1;       // wedge probe: last nudge's currentTime...
let musicStallAt = 0;         // ...and when it was stamped (see startMusic)

// Music belongs to the game surface only: the Home component claims it on
// mount and releases it on unmount (see components/home.js), so standalone
// pages (/leaderboard, /map, /user, embeds, ...) stay silent without
// maintaining a route list here. Revoking mid-play fades the music out.
export function setMusicAllowed(allowed) {
  try {
    musicAllowed = !!allowed;
    if (!musicAllowed) stopMusic();
  } catch (e) { }
}

function ensureMusicNodes() {
  const c = ensureContext();
  if (!c) return null;
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.preload = 'auto';
    const source = c.createMediaElementSource(musicEl);
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    source.connect(musicGain);
    musicGain.connect(masterGain);
    // No next track while hidden — the visibility handler starts one on
    // return if the current track ended while away. A pending playlist
    // switch owns the next start (else the two would double-start).
    musicEl.addEventListener('ended', () => {
      if (musicOn && !document.hidden && !playlistSwitchTimer) playNextTrack();
    });
    // A track that dies mid-play (network drop, server blip) fires 'error',
    // never 'ended' — nothing advances, musicOn stays true, and every restart
    // path no-ops on it: permanent silence. Disarm like an autoplay refusal;
    // the next nudge (any click, or connectivity returning) restarts cleanly
    // via startMusic().
    musicEl.addEventListener('error', () => { musicOn = false; });
    let hiddenPauseTimer = null;
    document.addEventListener('visibilitychange', () => {
      if (!musicOn || !musicEl || !ctx) return;
      const g = musicGain.gain;
      const now = ctx.currentTime;
      if (document.hidden) {
        // Gain ramps run on the audio clock, which background tabs don't
        // throttle — only the final pause rides a (throttle-tolerant) timer.
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.setValueAtTime(g.value, now + MUSIC_HIDDEN_GRACE_S);
        g.linearRampToValueAtTime(0, now + MUSIC_HIDDEN_GRACE_S + MUSIC_HIDDEN_FADE_S);
        hiddenPauseTimer = setTimeout(() => {
          hiddenPauseTimer = null;
          if (document.hidden && musicOn && musicEl) musicEl.pause();
        }, (MUSIC_HIDDEN_GRACE_S + MUSIC_HIDDEN_FADE_S) * 1000 + 100);
      } else {
        if (hiddenPauseTimer) { clearTimeout(hiddenPauseTimer); hiddenPauseTimer = null; }
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(toGain(getMusicVolume()), now + MUSIC_FADE_IN_S);
        // A playlist switch that landed while hidden never started its track
        // (the switch timer skips hidden tabs) — don't resume the stale-mood
        // one, start fresh from the active list.
        if (musicEl.ended || playingPlaylist !== activePlaylist) {
          playNextTrack();
        } else if (musicEl.paused) {
          musicEl.play().catch(() => { });
        }
      }
    });
  }
  return c;
}

function pickNextTrack() {
  const list = PLAYLISTS[activePlaylist];
  if (list.length < 2) return 0;
  let i;
  do { i = Math.floor(Math.random() * list.length); } while (i === lastTrackIdx);
  return i;
}

let musicStartedOnce = false;

function playNextTrack() {
  const c = ensureMusicNodes();
  if (!c) return;
  lastTrackIdx = pickNextTrack();
  playingPlaylist = activePlaylist;
  musicEl.src = asset(`/music/${PLAYLISTS[activePlaylist][lastTrackIdx]}.mp3`);
  musicPlayPending = true;
  musicEl.play().then(() => {
    musicPlayPending = false;
    // Stamped only on a successful start: an autoplay refusal must not
    // spend the one slow first-impression fade.
    const fadeInS = musicStartedOnce ? MUSIC_FADE_IN_S : MUSIC_FIRST_FADE_IN_S;
    musicStartedOnce = true;
    const g = musicGain.gain;
    const now = c.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(toGain(getMusicVolume()), now + fadeInS);
  }).catch(() => {
    musicPlayPending = false;
    // Autoplay refused (call site wasn't a real user gesture) or the source
    // failed to load (offline). Disarm so the next nudge — a click or the
    // 'online' event — retries cleanly via startMusic().
    musicOn = false;
  });
}

// Idempotent; must be called from (or after) a user gesture. Muted users
// (musicVolume 0) stream nothing at all; non-game pages never start.
// Also the single recovery nudge: when music is nominally on but the element
// is silently dead (paused by media keys / an OS interruption, errored, or
// ended while its handler was gated), revive it in place instead of no-oping.
// Every resume trigger — any click, connectivity returning — funnels here.
export function startMusic() {
  try {
    // Hidden tabs must stream nothing (user ruling) — a gesture caller can't
    // be hidden, but the 'online' listener can; return-to-tab owns resume.
    if (typeof window === 'undefined' || !musicAllowed || document.hidden) return;
    if (getMusicVolume() <= 0) return;
    if (musicOn) {
      // A pending playlist switch owns the next start.
      if (!musicEl || playlistSwitchTimer) return;
      if (musicEl.error || musicEl.ended) playNextTrack();
      else if (musicEl.paused) musicEl.play().catch(() => { });
      else {
        // Starved corpse: a connection that dies without a clean reset
        // starves the element mid-track — no 'error' ever fires, 'ended'
        // never comes, paused stays false; currentTime just freezes.
        // Element state can't tell that from a brief rebuffer, but time
        // can: two nudges >5s apart stuck at the same position (with no
        // fresh play() still settling) means wedged — start a new track.
        const pos = musicEl.currentTime;
        if (!musicPlayPending && pos === musicStallPos) {
          if (Date.now() - musicStallAt > 5000) playNextTrack();
        } else {
          musicStallPos = pos;
          musicStallAt = Date.now();
        }
      }
      return;
    }
    musicOn = true;
    playNextTrack();
  } catch (e) { }
}

// Swap between the PLAYLISTS moods with a graceful handoff: the playing
// track fades out over MUSIC_SWITCH_FADE_OUT_S, then a track from the new
// list opens with the standard fade-in. No-op when the mood is already
// active; while music is off the new list simply applies to the next start.
export function setMusicPlaylist(name) {
  try {
    if (!PLAYLISTS[name] || name === activePlaylist) return;
    activePlaylist = name;
    lastTrackIdx = -1; // no-repeat memory is per-list
    if (playlistSwitchTimer) { clearTimeout(playlistSwitchTimer); playlistSwitchTimer = null; }
    if (!musicOn || !musicEl || !ctx) return;
    const g = musicGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + MUSIC_SWITCH_FADE_OUT_S);
    playlistSwitchTimer = setTimeout(() => {
      playlistSwitchTimer = null;
      // Hidden tabs skip the restart — the visibilitychange handler starts a
      // fresh active-list track on return (playingPlaylist mismatch).
      if (musicOn && !document.hidden) playNextTrack();
    }, MUSIC_SWITCH_FADE_OUT_S * 1000 + 50);
  } catch (e) { }
}

export function stopMusic() {
  try {
    if (!musicOn || !musicEl || !ctx) return;
    musicOn = false;
    if (playlistSwitchTimer) { clearTimeout(playlistSwitchTimer); playlistSwitchTimer = null; }
    const g = musicGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + MUSIC_FADE_OUT_S);
    const el = musicEl;
    setTimeout(() => { if (!musicOn) el.pause(); }, MUSIC_FADE_OUT_S * 1000 + 50);
  } catch (e) { }
}

export function getMusicVolume() {
  if (cachedMusicVolume !== null) return cachedMusicVolume;
  let v = NaN;
  try {
    const raw = gameStorage.getItem('musicVolume');
    if (raw !== null && raw !== undefined && raw !== '') v = Number(raw);
  } catch (e) { }
  cachedMusicVolume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_MUSIC_VOLUME;
  return cachedMusicVolume;
}

export function setMusicVolume(v) {
  try {
    cachedMusicVolume = Math.min(1, Math.max(0, Number(v) || 0));
    notifyVolumes();
    gameStorage.setItem('musicVolume', String(cachedMusicVolume));
    if (cachedMusicVolume <= 0) { stopMusic(); return; }
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(toGain(cachedMusicVolume), ctx.currentTime, 0.05);
    if (!musicOn) startMusic(); // unmuting resumes (slider drag = gesture)
  } catch (e) { }
}

// Ad-break hook: the crazyMidgame() dispatcher (and future music) should call
// duckAudio(true) when an interstitial starts and duckAudio(false) when it
// ends — Poki QA checks that game audio is silent during commercialBreak.
export function duckAudio(ducked) {
  try {
    if (masterGain && ctx) masterGain.gain.setTargetAtTime(ducked ? 0 : 1, ctx.currentTime, 0.05);
  } catch (e) { }
}
