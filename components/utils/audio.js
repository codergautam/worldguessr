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
  // Declare the page's audio session "ambient" before any sound flows.
  // WebKit-only (Safari/iOS 16.4+ — and every iOS browser is WebKit);
  // navigator.audioSession is undefined elsewhere so this is a silent no-op.
  // Ambient is the AVAudioSession category native games use: our audio MIXES
  // with whatever the user is already playing (Spotify keeps going), the page
  // never registers as Now Playing (no Control Center / lock-screen entry),
  // and the ring/silent switch is respected — all standard game-audio
  // etiquette. Without it, iOS escalates any audible page to a full media
  // session that pauses the user's own music.
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { }
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
// Background music. Played through the SAME Web Audio graph as the sfx —
// deliberately NOT an <audio> element. The moment an HTMLMediaElement plays,
// the OS treats the page as a media app: iOS/Android pause the user's own
// audio (Spotify et al), list us as Now Playing in Control Center / the media
// notification, and hand out media keys that fight the game for the audio
// session. Buffer-source playback triggers none of that (and the 'ambient'
// session hint in ensureContext keeps WebKit from escalating us anyway), so
// game music coexists with the user's own music like every native game.
// The trade: a track must be fully fetched + decoded before it can start —
// ~50-75MB of PCM for a 3-minute stereo track — so unlike the forever-cached
// sfx buffers, AT MOST ONE decoded track is ever held, and it's released the
// moment it ends or music stops. Fetch+decode latency between tracks hides
// under the fade-in; the first track hides behind the extra-slow first fade.
// Shuffled playlist that never repeats a track back-to-back; every track
// start fades in, every stop fades out. Deliberately quiet by default.
// Tracks live in public/music/<name>.mp3 and are loudness-matched to
// ~-14.5 LUFS — check new tracks with
//   ffmpeg -i track.mp3 -af loudnorm=print_format=summary -f null -
// before adding them here.
// Web streams these full-quality masters; mobile streams a 96kbps CBR
// mirror from public/music-96k/ (data cost). Every new track needs BOTH
// copies: ffmpeg -i track.mp3 -map 0:a -b:a 96k -ar 44100 mirror.mp3
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
// (grace 0 — user ruling) and drifts to silence, then the source is stopped
// (position saved) so a backgrounded tab renders nothing; a track that ends
// while hidden doesn't queue a new one.
const MUSIC_HIDDEN_GRACE_S = 0;
const MUSIC_HIDDEN_FADE_S = 5;
const DEFAULT_MUSIC_VOLUME = 0.45; // slider-space; toGain squares it to a ~0.2 gain

let musicGain = null;
let musicOn = false;          // user-level: music should be sounding
let musicAllowed = false;     // page-level claim (game surface only)
let activePlaylist = 'chill';
let playingPlaylist = null;   // which list the CURRENT track came from
let playlistSwitchTimer = null;
let lastTrackIdx = -1;
let cachedMusicVolume = null;
let musicStartedOnce = false; // the one slow first-impression fade is spent
// The one live track, or null. `source` is non-null only while audio is
// actually rendering; a hidden-tab pause keeps the decoded buffer plus the
// resume offset so return-to-tab continues mid-track instead of refetching.
let musicTrack = null;        // { buffer, source, offset, startedAt }
// Track loads cancel by generation: bumping musicLoadId strands any resolve
// still in flight (a fetch midway through decode can't be aborted, only
// ignored). musicLoadPending distinguishes "loading" from "nothing coming".
let musicLoadId = 0;
let musicLoadPending = false;

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
  if (musicGain) return c;
  musicGain = c.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(masterGain);
  let hiddenPauseTimer = null;
  document.addEventListener('visibilitychange', () => {
    if (!musicOn || !ctx || !musicGain) return;
    const g = musicGain.gain;
    const now = ctx.currentTime;
    if (document.hidden) {
      // Gain ramps run on the audio clock, which background tabs don't
      // throttle — only the final source-stop rides a (throttle-tolerant)
      // timer. The timer firing late is harmless: the resume offset is
      // computed from the audio clock, not from when the timer ran.
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setValueAtTime(g.value, now + MUSIC_HIDDEN_GRACE_S);
      g.linearRampToValueAtTime(0, now + MUSIC_HIDDEN_GRACE_S + MUSIC_HIDDEN_FADE_S);
      hiddenPauseTimer = setTimeout(() => {
        hiddenPauseTimer = null;
        if (document.hidden && musicOn) pauseMusicPlayback();
      }, (MUSIC_HIDDEN_GRACE_S + MUSIC_HIDDEN_FADE_S) * 1000 + 100);
    } else {
      if (hiddenPauseTimer) { clearTimeout(hiddenPauseTimer); hiddenPauseTimer = null; }
      // An OS interruption while away (call, screen lock) can leave the
      // context frozen; revive it so the ramps below actually sound.
      if (ctx.state !== 'running') ctx.resume().catch(() => { });
      // A pending playlist switch owns the next start — visible again, its
      // timer now fires normally.
      if (playlistSwitchTimer) return;
      // Track ended while hidden → start fresh. A load still in flight
      // parks its buffer for this handler instead (musicLoadPending), so
      // don't stampede a second fetch on top of it.
      if (!musicTrack) { if (!musicLoadPending) playNextTrack(); return; }
      // A playlist switch that landed while hidden never started its track
      // (the switch timer skips hidden tabs) — don't resume the stale-mood
      // one, start fresh from the active list.
      if (playingPlaylist !== activePlaylist) { playNextTrack(); return; }
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(toGain(getMusicVolume()), now + MUSIC_FADE_IN_S);
      // Stopped by the hidden timer → fresh source resumes mid-track. If the
      // timer never got to fire the old source is still live and the ramp
      // alone brings it back.
      if (!musicTrack.source) spawnMusicSource(ctx);
    }
  });
  return c;
}

// Create + start a source for the current musicTrack at its saved offset.
// Gain is the caller's job: a fresh track ramps up from 0, a resume ramps
// from wherever the hide-fade left it. Any real start spends the one slow
// first-impression fade (musicStartedOnce).
function spawnMusicSource(c) {
  const src = c.createBufferSource();
  src.buffer = musicTrack.buffer;
  src.connect(musicGain);
  // Natural track end only — deliberate stops (pause, teardown, next track)
  // clear onended first, so "a track finished playing" is unambiguous here.
  src.onended = () => {
    musicTrack = null; // release the decoded PCM immediately
    if (musicOn && !document.hidden && !playlistSwitchTimer) playNextTrack();
  };
  musicTrack.startedAt = c.currentTime;
  musicTrack.source = src;
  src.start(0, Math.min(musicTrack.offset, musicTrack.buffer.duration));
  musicStartedOnce = true;
}

// Stop rendering but keep the decoded buffer and position — the hidden-tab
// pause. Return-to-tab respawns a source from the offset saved here.
function pauseMusicPlayback() {
  if (!musicTrack || !musicTrack.source || !ctx) return;
  const src = musicTrack.source;
  src.onended = null;
  musicTrack.offset = Math.min(
    musicTrack.offset + (ctx.currentTime - musicTrack.startedAt),
    musicTrack.buffer.duration
  );
  musicTrack.source = null;
  try { src.stop(); } catch (e) { }
}

// Hard teardown: stop the source AND release the decoded track.
function killMusicPlayback() {
  if (musicTrack && musicTrack.source) {
    musicTrack.source.onended = null;
    try { musicTrack.source.stop(); } catch (e) { }
  }
  musicTrack = null;
}

function pickNextTrack() {
  const list = PLAYLISTS[activePlaylist];
  if (list.length < 2) return 0;
  let i;
  do { i = Math.floor(Math.random() * list.length); } while (i === lastTrackIdx);
  return i;
}

function playNextTrack() {
  const c = ensureMusicNodes();
  if (!c) return;
  // This call IS the continuation of any pending switch (or supersedes it) —
  // a timer left armed here would double-start.
  if (playlistSwitchTimer) { clearTimeout(playlistSwitchTimer); playlistSwitchTimer = null; }
  killMusicPlayback();
  lastTrackIdx = pickNextTrack();
  playingPlaylist = activePlaylist;
  const name = PLAYLISTS[activePlaylist][lastTrackIdx];
  const loadId = ++musicLoadId;
  musicLoadPending = true;
  fetch(asset(`/music/${name}.mp3`))
    .then((res) => {
      if (!res.ok) throw new Error(`music ${name}: HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => decode(c, data))
    .then((buffer) => {
      if (loadId !== musicLoadId) return; // superseded by a newer start/stop
      musicLoadPending = false;
      if (!musicOn) return; // stopped while loading; the buffer just drops
      musicTrack = { buffer, source: null, offset: 0, startedAt: 0 };
      // Hidden tabs render nothing — park the decoded track; the
      // visibilitychange handler starts it on return.
      if (document.hidden) return;
      const fadeInS = musicStartedOnce ? MUSIC_FADE_IN_S : MUSIC_FIRST_FADE_IN_S;
      spawnMusicSource(c);
      const g = musicGain.gain;
      const now = c.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(toGain(getMusicVolume()), now + fadeInS);
    })
    .catch((e) => {
      if (loadId !== musicLoadId) return;
      musicLoadPending = false;
      // Offline or a server blip. Disarm so the next nudge — any click, or
      // connectivity returning — retries cleanly via startMusic().
      console.warn('music load failed', name, e);
      musicOn = false;
    });
}

// Idempotent; must be called from (or after) a user gesture. Muted users
// (musicVolume 0) download nothing at all; non-game pages never start.
// Every recovery nudge — any click, connectivity returning — funnels here.
// The HTMLMediaElement failure zoo the old player policed (media-key pauses,
// mid-stream errors, starved-connection wedges) is structurally gone: a
// decoded buffer can't stall and no OS control can pause it. The two silent
// states left are a suspended/interrupted context (revived below, gesture-
// blessed so it can't be refused) and a failed track load (which disarmed
// musicOn, so the next nudge lands in playNextTrack).
export function startMusic() {
  try {
    // Hidden tabs must render nothing (user ruling) — a gesture caller can't
    // be hidden, but the 'online' listener can; return-to-tab owns resume.
    if (typeof window === 'undefined' || !musicAllowed || document.hidden) return;
    if (getMusicVolume() <= 0) return;
    const c = ensureMusicNodes();
    if (!c) return;
    // A phone call / Siri / audio-route change freezes the whole graph
    // mid-sample ('interrupted' on iOS, 'suspended' elsewhere); resuming
    // revives music and sfx alike from exactly where they stopped.
    if (c.state !== 'running') c.resume().catch(() => { });
    if (musicOn) return; // playing, loading, or a pending switch owns the next start
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
    if (!musicOn || !ctx || !musicGain) return;
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
    if (!musicOn) return;
    musicOn = false;
    musicLoadId++; // strand any in-flight track load
    musicLoadPending = false;
    if (playlistSwitchTimer) { clearTimeout(playlistSwitchTimer); playlistSwitchTimer = null; }
    if (!ctx || !musicGain) { musicTrack = null; return; }
    const g = musicGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + MUSIC_FADE_OUT_S);
    // Full teardown after the fade — unlike the hidden-tab pause, a stop
    // releases the decoded track (tens of MB): music memory belongs to the
    // game surface only. A later restart opens a fresh track, which suits a
    // shuffled ambient bed better than resuming a stale one anyway.
    setTimeout(() => { if (!musicOn) killMusicPlayback(); }, MUSIC_FADE_OUT_S * 1000 + 50);
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

// On CrazyGames gameStorage routes through CrazyGames.SDK.data, which is
// unreadable until the SDK has initialized — but the navbar's render-time
// mute check calls the getters before that, so the caches seed with the
// defaults and the player's saved volumes are orphaned for the session
// (music turned back on at 45% for muted players). home.js calls this the
// moment the SDK is ready: drop the caches, re-read through the live store,
// and push the real values into anything already running. Not a gesture —
// never starts music; the permanent click listener owns that.
export function refreshVolumesFromStorage() {
  try {
    cachedVolume = null;
    cachedMusicVolume = null;
    const sfx = getSfxVolume();
    const music = getMusicVolume();
    notifyVolumes();
    if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(toGain(sfx), ctx.currentTime, 0.02);
    if (music <= 0) { stopMusic(); return; }
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(toGain(music), ctx.currentTime, 0.05);
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
