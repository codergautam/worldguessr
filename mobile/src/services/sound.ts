/**
 * Sound service — SFX + music, the native port of web components/utils/audio.js
 * (mobile-team-parity-plan.md §11). Shaped like haptics.ts: an imperative,
 * settings-store-gated, error-swallowing service usable outside React.
 *
 * PRIME DIRECTIVE (carried from web verbatim): every entry point swallows
 * errors — audio must never break gameplay.
 *
 * What ports from web and what deliberately doesn't:
 *  • SFX semantics port exactly: per-play mix volume, anti-repetition pitch
 *    jitter (±6%), deterministic `rate` for pitch that carries MEANING (the
 *    reveal sound), per-sound 80ms cooldown with optional leading-edge
 *    debounce, stop-with-fade for long beds (ticking).
 *  • Music semantics port: two loudness-matched playlists (chill/competitive),
 *    shuffle with no back-to-back repeat, 2s fade-in (10s for the session's
 *    FIRST track — deliberate gentle first impression), 1.5s playlist
 *    crossfade, background = fade then pause with 0s grace, resume/fresh
 *    track on foreground. Resilience invariants (§11.1): status events are
 *    the death signal (no wedge-probe needed — RN gets real callbacks), ONE
 *    idempotent recovery entry point (startMusic), and a failed play DISARMS
 *    and waits for the next trigger — never a hot retry loop.
 *  • Web's autoplay-unlock machinery (suspended-context resume, first-click
 *    unlock swallow, skipWhenSuspended) does NOT port — RN has no autoplay
 *    policy. ui_hover does NOT port (mouse-only; user ruling).
 *
 * Volume model: sliders persist 0–1 in settingsStore; the perceptual mapping
 * toGain(v) = v² applies ONLY where a user-facing volume reaches a player —
 * per-play mix ratios stay linear. Muted costs zero data: preloads are
 * skipped and music never streams.
 *
 * Audio session policy (user sign-off, July 10): respect the iOS silent
 * switch (playsInSilentMode false) and NEVER stomp the user's own
 * Spotify/podcast (mix-with-others; no auto-duck of other apps — a user
 * running their own music zeroes the music slider once and it persists).
 *
 * Assets: the 6 SFX are BUNDLED (small, latency-critical); music STREAMS
 * from prod (12 tracks would bloat the binary; offline = silent music,
 * bundled SFX still work), with a download-once device cache on top: each
 * track's first play streams AND saves it to the OS-purgeable cache dir, so
 * later plays cost zero network. New-track rule extends to BOTH manifests:
 * web audio.js PLAYLISTS and the copy below, plus the loudnorm check.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { useSettingsStore } from '../store/settingsStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { SITE_URL } from '../constants/config';

// ── Constants (web audio.js parity) ─────────────────────────────────────────

const DEFAULT_COOLDOWN_MS = 80;
const DEFAULT_PITCH_JITTER = 0.06;
const MUSIC_FADE_IN_S = 2;
const MUSIC_FIRST_FADE_IN_S = 10;
const MUSIC_FADE_OUT_S = 1;
const MUSIC_SWITCH_FADE_OUT_S = 1.5;
const MUSIC_HIDDEN_FADE_S = 5; // background fade (0s grace — user ruling)
// Post-start verification delay (armStartVerify): long enough that any track
// that's going to play is audibly playing, short enough that a killed start
// heals before the first round is over.
const MUSIC_START_VERIFY_MS = 8000;

/** Perceptual volume mapping — ONLY at a player boundary (exported for the
 * embed WebView's in-page pin click, whose gain the host computes). */
export const toGain = (v: number) => v * v;

// ── SFX ─────────────────────────────────────────────────────────────────────

// Bundled MP3s (MP3-ONLY — Safari ruling on web, also the safe RN codec).
// ui_hover is deliberately absent (mouse-only on web; excluded by ruling).
const SFX_SOURCES = {
  click_2: require('../../assets/sounds/click_2.mp3'),
  ui_click: require('../../assets/sounds/ui_click.mp3'),
  pin: require('../../assets/sounds/pin.mp3'),
  guess: require('../../assets/sounds/guess.mp3'),
  ticking: require('../../assets/sounds/ticking.mp3'),
  multinoti: require('../../assets/sounds/multinoti.mp3'),
} as const;

export type SfxName = keyof typeof SFX_SOURCES;

interface PlayOptions {
  /** Linear per-play mix ratio (multinoti ships at 0.5 — user ruling). */
  volume?: number;
  /** Anti-repetition jitter; ±fraction applied to playbackRate. */
  pitchJitter?: number;
  /**
   * Deterministic playbackRate (pitch and speed together, like a record
   * player) — for sounds whose pitch carries MEANING (the reveal sound
   * tracks guess quality). Overrides the jitter entirely: meaningful pitch
   * must not wobble.
   */
  rate?: number | null;
  cooldownMs?: number;
  /**
   * A swallowed attempt still pushes the cooldown window forward, so a
   * continuous event stream plays once then stays silent until it rests
   * (leading-edge debounce). Without it this is a plain throttle.
   */
  debounce?: boolean;
}

const sfxPlayers = new Map<SfxName, AudioPlayer>();
const lastPlayed = new Map<SfxName, number>();
/** Ad-break duck (Poki-QA rule class): master multiplier over ALL audio. */
let duckFactor = 1;

function sfxSliderVolume(): number {
  return useSettingsStore.getState().sfxVolume;
}

function getSfxPlayer(name: SfxName): AudioPlayer | null {
  try {
    let p = sfxPlayers.get(name);
    if (!p) {
      const created = createAudioPlayer(SFX_SOURCES[name]);
      // Re-arm at position 0 the moment playback ENDS — off the hot path. A
      // media player left at its end position needs a seek before it can
      // replay, and expo-audio's seekTo is an async native dispatch: the old
      // seek-before-every-play design spent that dispatch (tens of ms on
      // ExoPlayer/AVPlayer) before every single sound, which is why mobile
      // SFX felt laggier than web's sample-accurate buffer sources. Android's
      // didJustFinish is level-based (repeats per status update at
      // STATE_ENDED) — pause+seek exits that state, so the re-arm is
      // naturally idempotent.
      created.addListener('playbackStatusUpdate', (status: any) => {
        try {
          if (status?.didJustFinish) {
            created.pause();
            created.seekTo(0);
          }
        } catch {}
      });
      sfxPlayers.set(name, created);
      p = created;
    }
    return p;
  } catch {
    return null;
  }
}

/**
 * Decode ahead of the moment that needs zero latency (map mount → pin/guess,
 * timed round possible → ticking, live game → multinoti). Skipped entirely
 * while muted (mute = zero cost).
 */
export function preloadSfx(...names: SfxName[]): void {
  try {
    if (sfxSliderVolume() <= 0) return;
    for (const name of names) getSfxPlayer(name);
  } catch {}
}

export function playSfx(
  name: SfxName,
  {
    volume = 1,
    pitchJitter = DEFAULT_PITCH_JITTER,
    rate = null,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    debounce = false,
  }: PlayOptions = {},
): void {
  try {
    const slider = sfxSliderVolume();
    if (slider <= 0) return;
    const now = Date.now();
    if (now - (lastPlayed.get(name) ?? 0) < cooldownMs) {
      if (debounce) lastPlayed.set(name, now);
      return;
    }
    lastPlayed.set(name, now);

    const player = getSfxPlayer(name);
    if (!player) return;
    // Record-player semantics: rate changes pitch too (correction OFF).
    // MUST be the setPlaybackRate() FUNCTION — expo-audio's native
    // playbackRate property is getter-only on iOS AND Android (only the web
    // build has a setter), so a property assignment throws in strict-mode
    // Hermes, the outer catch swallows it, and every SFX goes silently dead
    // on device while working fine in Expo-Web testing.
    const rateValue =
      rate != null ? rate : pitchJitter > 0 ? 1 + (Math.random() * 2 - 1) * pitchJitter : 1;
    player.shouldCorrectPitch = false;
    player.setPlaybackRate(rateValue);
    // Linear mix × perceptual master × ad-duck — same chain as web's
    // per-play gain → sfxGain → masterGain.
    player.volume = Math.max(0, Math.min(1, volume * toGain(slider) * duckFactor));
    // HOT PATH HAS NO SEEK: the finish listener (getSfxPlayer) already
    // re-armed the player at 0, so play() fires immediately. Seek only when
    // it's actually needed — a retrigger mid-play (restart-from-top keeps the
    // percussive feel) or a player parked mid-track (stopSfx'd ticking bed,
    // or a re-arm the listener missed).
    if (player.playing || player.currentTime > 0.05) player.seekTo(0);
    player.play();
  } catch {}
}

/**
 * Fade out and stop a sound. For long beds (the round-clock ticking) whose
 * reason can vanish early — the round advancing before the clock runs out
 * must not leave ticks playing over the reveal. One-shots never need this.
 */
export function stopSfx(name: SfxName, fadeOutS = 0.25): void {
  try {
    const player = sfxPlayers.get(name);
    if (!player) return;
    fadePlayer(player, 0, fadeOutS, () => {
      try {
        player.pause();
      } catch {}
    });
  } catch {}
}

// ── Convenience wrappers (the haptics.ts-style curated API) ────────────────

export const sound = {
  /** Generic button press (web click_2 via the delegated listener). */
  click: () => playSfx('click_2'),
  /** Home main-menu buttons only (web .g2_nav_ui scope). */
  uiClick: () => playSfx('ui_click'),
  play: playSfx,
  stop: stopSfx,
  preload: preloadSfx,
};

// ── JS fade engine ──────────────────────────────────────────────────────────
// expo-audio has no gain ramps; a 50ms-step interval is inaudible for these
// fade lengths and keeps the players' volume the single source of loudness.

const fadeTimers = new Map<AudioPlayer, ReturnType<typeof setInterval>>();

function cancelFade(player: AudioPlayer): void {
  const t = fadeTimers.get(player);
  if (t) {
    clearInterval(t);
    fadeTimers.delete(player);
  }
}

function fadePlayer(player: AudioPlayer, target: number, seconds: number, onDone?: () => void): void {
  cancelFade(player);
  try {
    if (seconds <= 0) {
      player.volume = target;
      onDone?.();
      return;
    }
    const stepMs = 50;
    const start = player.volume;
    const startedAt = Date.now();
    const durationMs = seconds * 1000;
    const timer = setInterval(() => {
      // Progress is ELAPSED TIME, never tick count: RN timers starve and then
      // burst whenever the JS thread is busy — and playlist switches fire at
      // exactly the busiest moments (match entry, WebViews mounting). A
      // tick-counted fade renders a starved window as 2-3 audible volume
      // cliffs stretched past the intended duration; time-based progress
      // degrades to fewer-but-correct steps and always lands on schedule.
      const frac = Math.min(1, (Date.now() - startedAt) / durationMs);
      try {
        player.volume = start + (target - start) * frac;
      } catch {}
      if (frac >= 1) {
        cancelFade(player);
        onDone?.();
      }
    }, stepMs);
    fadeTimers.set(player, timer);
  } catch {
    onDone?.();
  }
}

// ── Music ───────────────────────────────────────────────────────────────────

// Keep in LOCKSTEP with web audio.js PLAYLISTS (the new-track rule updates
// both manifests + runs the loudnorm check). Path fragments under
// /music-96k/ — mobile streams the 96kbps CBR mirror (data cost); web keeps
// the full-quality masters in /music/. New tracks need both copies.
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
} as const;

type PlaylistName = keyof typeof PLAYLISTS;

// ── Music cache (download-once) ─────────────────────────────────────────────
// Tracks live in the OS-purgeable cache directory (never Paths.document:
// it's iCloud-backed, and Apple rejects re-downloadable content in backups).
// Eviction is expected and harmless — a missing file just streams again.
// The version suffix is the invalidation lever: bump it whenever tracks are
// re-encoded IN PLACE on prod (new tracks get new names and need nothing).
const MUSIC_CACHE_DIR = 'music-v1';

let musicCacheDir: Directory | null = null;
const musicDownloadsInFlight = new Set<string>();
// The cached File backing the CURRENT track, when playing from cache — so a
// player death can evict a corrupt/truncated file instead of re-poisoning
// every future play of that track.
let currentCachedFile: File | null = null;

// 'competitive/glass-circuit' → 'competitive_glass-circuit.mp3' (flat dir).
const trackFileName = (trackPath: string) => `${trackPath.replace(/\//g, '_')}.mp3`;

function ensureMusicCacheDir(): Directory | null {
  if (musicCacheDir) return musicCacheDir;
  try {
    // Reap superseded versions first, or stale dirs linger until the OS
    // gets around to purging the cache.
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry.name.startsWith('music-v') && entry.name !== MUSIC_CACHE_DIR) {
        try {
          entry.delete();
        } catch {}
      }
    }
  } catch {}
  try {
    const dir = new Directory(Paths.cache, MUSIC_CACHE_DIR);
    dir.create({ intermediates: true, idempotent: true });
    musicCacheDir = dir;
  } catch {
    musicCacheDir = null; // cache unavailable → pure streaming, as before
  }
  return musicCacheDir;
}

/**
 * Cached file's URI when the track is already on disk; otherwise the remote
 * URL — and in that case a background download starts so every LATER play of
 * this track is free. First-ever play of a track therefore costs ~2× its
 * size (stream + cache fill), a one-time cost per install that buys zero
 * network forever after. Downloads only ever start from an actual play, so
 * muted users still transfer nothing.
 */
function resolveTrackSource(trackPath: string): string {
  // music-96k = the mobile mirror; byte-identical to what /music/ served
  // before the HQ/96k split, so music-v1 cache entries stay valid (no bump).
  const remote = `${SITE_URL}/music-96k/${trackPath}.mp3`;
  currentCachedFile = null;
  const dir = ensureMusicCacheDir();
  if (!dir) return remote;
  try {
    const cached = new File(dir, trackFileName(trackPath));
    // size > 0 guards zero-byte husks (interrupted writes, exotic failures).
    if (cached.exists && cached.size > 0) {
      currentCachedFile = cached;
      return cached.uri;
    }
  } catch {}
  downloadTrack(remote, trackPath);
  return remote;
}

function downloadTrack(url: string, trackPath: string): void {
  const dir = musicCacheDir;
  if (!dir || musicDownloadsInFlight.has(trackPath)) return;
  musicDownloadsInFlight.add(trackPath);
  const dest = new File(dir, trackFileName(trackPath));
  File.downloadFileAsync(url, dest, { idempotent: true })
    .catch(() => {
      // Android streams straight into the destination and leaves a partial
      // file when the transfer dies mid-way — delete it or the next resolve
      // would "hit" a truncated track. (iOS downloads to a temp location
      // and moves on success, so there's nothing to clean.)
      try {
        if (dest.exists) dest.delete();
      } catch {}
    })
    .finally(() => {
      musicDownloadsInFlight.delete(trackPath);
    });
}

/** Player-death hook: a corrupt cached track must not survive to poison the
 * next play. Streaming sources have nothing to evict. */
function evictCurrentCachedTrack(): void {
  try {
    currentCachedFile?.delete();
  } catch {}
  currentCachedFile = null;
}

// ── Dev-reload ghost guard ──────────────────────────────────────────────────
// Fast Refresh re-evaluates this module with FRESH state (musicPlayer = null)
// while the previous instance's native expo-audio player keeps playing,
// unreachable — every code edit stacked another simultaneous track, and the
// ghosts ignored duckAudio/stopMusic (no live reference reaches them). Native
// players outlive JS module state, so the live handle is parked on globalThis
// and any previously parked player is executed here, at re-evaluation time.
// Prod builds never re-evaluate modules; this is dev-lifecycle hygiene.
const ghostRegistry = globalThis as { __wgMusicPlayer?: AudioPlayer };
try {
  ghostRegistry.__wgMusicPlayer?.pause();
} catch {}
try {
  ghostRegistry.__wgMusicPlayer?.release();
} catch {}
ghostRegistry.__wgMusicPlayer = undefined;

let musicPlayer: AudioPlayer | null = null;
let musicOn = false;
let activePlaylist: PlaylistName = 'chill';
let playingPlaylist: PlaylistName | null = null;
let playlistSwitchTimer: ReturnType<typeof setTimeout> | null = null;
let lastTrackIdx = -1;
let musicStartedOnce = false;
let appActive = true;
// Advance-in-flight latch: Android's didJustFinish is LEVEL-based (true on
// every status update while the player sits at STATE_ENDED, and the end
// fires two listener callbacks in the same turn) — without the latch a
// single track end triggers a playNextTrack() storm.
let trackAdvancing = false;
// The current track reached 'ready' at least once — an 'idle' AFTER that is
// the Android post-error state (Media3 errors transition to STATE_IDLE; the
// library never emits an 'error' playbackState), so it's our death signal.
let trackHadReady = false;
// A track that finished while we couldn't auto-advance (backgrounded /
// mid-switch) — startMusic() must start a FRESH track, not play() the ended
// one (iOS never reports 'ended'; this JS flag is the only portable signal).
let musicEnded = false;

function musicSliderVolume(): number {
  return useSettingsStore.getState().musicVolume;
}

function musicTargetVolume(): number {
  return toGain(musicSliderVolume()) * duckFactor;
}

function ensureMusicPlayer(): AudioPlayer | null {
  try {
    if (musicPlayer) return musicPlayer;
    musicPlayer = createAudioPlayer();
    ghostRegistry.__wgMusicPlayer = musicPlayer; // park for the reload guard
    musicPlayer.volume = 0;
    // Status events are the RN death/end signal (web's element goes silent —
    // here we get real callbacks):
    //  • didJustFinish → next shuffled track (latched: Android reports it
    //    level-based on every update at STATE_ENDED, and the end fires two
    //    callbacks in one turn — unlatched this is a playNextTrack storm);
    //  • a mid-track stream death → DISARM (musicOn false) and wait for the
    //    next trigger, never a hot retry loop (§11.1). The library emits NO
    //    'error' playbackState: Android post-error is a bounce back to
    //    'idle' AFTER the track had been 'ready'; iOS reports 'failed'.
    musicPlayer.addListener('playbackStatusUpdate', (status: any) => {
      try {
        if (!musicOn) return;
        const state = status?.playbackState;
        if (status?.didJustFinish) {
          if (trackAdvancing) return;
          if (appActive && !playlistSwitchTimer) {
            playNextTrack();
          } else {
            // Can't auto-advance now — remember the corpse so the next
            // startMusic() nudge starts FRESH instead of play()ing it.
            musicEnded = true;
          }
          return;
        }
        // First non-ended status of the freshly replaced track → the advance
        // landed; re-arm the latch for the next natural end.
        // 'ready' is Android (Media3) vocabulary; iOS (AVPlayer) reports
        // 'readyToPlay' and NEVER emits 'ready'/'idle'/'ended' — without the
        // iOS spelling, trackHadReady never armed there and startMusic's
        // revive branch couldn't tell a healthy paused track from a load that
        // died mid-buffer (the insta-queue silent-match bug).
        const reachedReady = state === 'ready' || state === 'readyToPlay';
        if (trackAdvancing && (reachedReady || status?.playing)) {
          trackAdvancing = false;
        }
        if (reachedReady) trackHadReady = true;
        if (state === 'failed' || (state === 'idle' && trackHadReady && !trackAdvancing)) {
          // If the corpse was a cached file it's likely corrupt/evicted
          // mid-read — remove it so the next attempt streams fresh.
          evictCurrentCachedTrack();
          musicOn = false;
        }
      } catch {}
    });
    return musicPlayer;
  } catch {
    return null;
  }
}

function pickNextTrack(): number {
  const list = PLAYLISTS[activePlaylist];
  if (list.length < 2) return 0;
  let i: number;
  do {
    i = Math.floor(Math.random() * list.length);
  } while (i === lastTrackIdx);
  return i;
}

// ── Start verification ──────────────────────────────────────────────────────
// "Status events are the death signal" (§11.1) has a hole either platform can
// hit when a track start races heavy native work — exactly what an instant
// queue→match produces: the playlist-switch timer's playNextTrack lands inside
// the game screen's WebView mount storm.
//  • iOS: an audio-session interruption (WebKit session churn is the known
//    culprit) that begins while the new track is still BUFFERING pauses it,
//    but expo-audio only registers isPlaying players for interruption resume —
//    a buffering track is skipped, so it never plays and never emits ANY
//    status. Silent for the whole match.
//  • Android: a failed load bounces Media3 to 'idle' with trackHadReady still
//    false, which the death detector deliberately ignores (that shape is also
//    a normal replace() transient) — no disarm, no retry.
// So every start is VERIFIED: one re-check after MUSIC_START_VERIFY_MS that
// funnels into startMusic (the single recovery entry point). A start that the
// verify pass itself issued does NOT re-arm — one bounded re-attempt per
// trigger, never a hot retry loop (§11.1).
let startVerifyTimer: ReturnType<typeof setTimeout> | null = null;
let inStartVerify = false;

function armStartVerify(): void {
  if (startVerifyTimer) {
    clearTimeout(startVerifyTimer);
    startVerifyTimer = null;
  }
  if (inStartVerify) return; // the bounded single re-attempt — never loop
  startVerifyTimer = setTimeout(() => {
    startVerifyTimer = null;
    try {
      // Healthy start → no-op. Wedged start → startMusic's revive branch
      // resumes a ready-but-paused track in place, or replaces one that
      // never reached ready (see trackHadReady). All its own gates (muted,
      // backgrounded, disarmed, mid-switch) apply unchanged.
      if (!musicOn || !musicPlayer || musicPlayer.playing) return;
      inStartVerify = true;
      try {
        startMusic();
      } finally {
        inStartVerify = false;
      }
    } catch {}
  }, MUSIC_START_VERIFY_MS);
}

function playNextTrack(): void {
  try {
    const player = ensureMusicPlayer();
    if (!player) return;
    lastTrackIdx = pickNextTrack();
    playingPlaylist = activePlaylist;
    trackAdvancing = true; // cleared by the new track's first non-ended status
    trackHadReady = false;
    musicEnded = false;
    const src = resolveTrackSource(PLAYLISTS[activePlaylist][lastTrackIdx]);
    player.replace({ uri: src });
    player.volume = 0;
    player.play();
    // Only the session's FIRST successful start spends the slow
    // first-impression fade.
    const fadeInS = musicStartedOnce ? MUSIC_FADE_IN_S : MUSIC_FIRST_FADE_IN_S;
    musicStartedOnce = true;
    fadePlayer(player, musicTargetVolume(), fadeInS);
    armStartVerify();
  } catch {
    // Load failed (offline) → disarm; the next trigger retries cleanly.
    musicOn = false;
  }
}

/**
 * Idempotent start + the SINGLE recovery nudge (§11.1 invariant 2): every
 * resume trigger — app foreground, volume unmute, app mount — funnels here.
 * Muted users stream nothing at all.
 */
export function startMusic(): void {
  try {
    if (!appActive) return; // backgrounded apps stream nothing (user ruling)
    if (musicSliderVolume() <= 0) return;
    if (musicOn) {
      if (!musicPlayer || playlistSwitchTimer) return;
      // Revive a silently dead player in place: mood changed while away, the
      // track ENDED while we couldn't auto-advance (musicEnded — play()ing
      // the corpse would be silence on iOS, which never reports 'ended'), or
      // an OS interruption paused us without flipping musicOn.
      if (playingPlaylist !== activePlaylist || musicEnded) {
        playNextTrack();
      } else if (!musicPlayer.playing) {
        if (!trackHadReady) {
          // The current track NEVER reached ready — its load was killed
          // without a death status (interruption mid-buffer, silent fetch
          // failure). play() on that corpse is silence; only a fresh
          // replace recovers. playingPlaylist can't discriminate here:
          // playNextTrack stamps it optimistically before the load lands.
          playNextTrack();
        } else {
          musicPlayer.play();
          fadePlayer(musicPlayer, musicTargetVolume(), MUSIC_FADE_IN_S);
        }
      } else {
        // Natively auto-resumed (expo-audio replays paused players on
        // foreground BEFORE this JS runs) — the player reads `playing` but
        // its volume is wherever the background fade left it. Always re-ramp
        // (web's visibilitychange handler did this unconditionally).
        fadePlayer(musicPlayer, musicTargetVolume(), MUSIC_FADE_IN_S);
      }
      return;
    }
    musicOn = true;
    playNextTrack();
  } catch {}
}

/**
 * Swap moods with a graceful handoff: fade out, then a track from the new
 * list opens with the standard fade-in. No-op when already active; while
 * music is off the new list simply applies to the next start.
 */
export function setMusicPlaylist(name: PlaylistName): void {
  try {
    if (!PLAYLISTS[name] || name === activePlaylist) return;
    activePlaylist = name;
    lastTrackIdx = -1; // no-repeat memory is per-list
    if (playlistSwitchTimer) {
      clearTimeout(playlistSwitchTimer);
      playlistSwitchTimer = null;
    }
    if (!musicOn || !musicPlayer) return;
    fadePlayer(musicPlayer, 0, MUSIC_SWITCH_FADE_OUT_S);
    playlistSwitchTimer = setTimeout(
      () => {
        playlistSwitchTimer = null;
        // Backgrounded apps skip the restart — the foreground handler starts
        // a fresh active-list track on return (playingPlaylist mismatch).
        if (musicOn && appActive) playNextTrack();
      },
      MUSIC_SWITCH_FADE_OUT_S * 1000 + 50,
    );
  } catch {}
}

export function stopMusic(): void {
  try {
    if (!musicOn || !musicPlayer) return;
    musicOn = false;
    if (playlistSwitchTimer) {
      clearTimeout(playlistSwitchTimer);
      playlistSwitchTimer = null;
    }
    if (startVerifyTimer) {
      clearTimeout(startVerifyTimer);
      startVerifyTimer = null;
    }
    const player = musicPlayer;
    fadePlayer(player, 0, MUSIC_FADE_OUT_S, () => {
      try {
        if (!musicOn) player.pause();
      } catch {}
    });
  } catch {}
}

/**
 * Volume boundary reactions (called by the settings setters' subscriber in
 * initSoundSystem): music slider hitting 0 STOPS the stream entirely;
 * unmuting restarts it. Mid-play changes retarget the live fade.
 */
function onMusicVolumeChanged(): void {
  try {
    if (musicSliderVolume() <= 0) {
      stopMusic();
      return;
    }
    if (musicOn && musicPlayer && !playlistSwitchTimer) {
      fadePlayer(musicPlayer, musicTargetVolume(), 0.1);
    }
    if (!musicOn) startMusic(); // unmuting resumes
  } catch {}
}

/**
 * Ad-break hook: collapse ALL audio around a full-screen interstitial
 * (web crazyMidgame parity — and AdMob may already silence the app; this
 * guarantees it either way).
 */
export function duckAudio(ducked: boolean): void {
  try {
    duckFactor = ducked ? 0 : 1;
    if (musicOn && musicPlayer && !playlistSwitchTimer) {
      fadePlayer(musicPlayer, musicTargetVolume(), 0.1);
    }
  } catch {}
}

// ── System wiring ───────────────────────────────────────────────────────────

let initialized = false;
let hiddenPauseTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * One-time boot, called from the root layout once settings are loaded.
 * Music is allowed on ALL app routes (user sign-off — the whole app is the
 * game surface), so this both starts it and wires every lifecycle trigger:
 *  • audio session: respect the iOS silent switch, mix with other apps'
 *    audio (never stomp Spotify), stay silent in the background;
 *  • AppState: background = fade out then pause (0s grace); foreground =
 *    the startMusic recovery funnel (resume, or fresh track if the current
 *    one ended / the playlist switched while away);
 *  • competitive-playlist gate: `(inGame && public) || queued` — NEVER gate
 *    on `duel` (unranked "duels" are public non-duel FFA server-side). The
 *    gameQueued term keeps competitive music through the 2v2 stage-2
 *    null-gameData window for free.
 */
export function initSoundSystem(): void {
  if (initialized) return;
  initialized = true;
  try {
    setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'duckOthers',
      shouldPlayInBackground: false,
    }).catch(() => {});

    // Warm the delegated-click sounds so the session's very first button
    // press is audible with zero decode latency (web attachUiClickSounds'
    // first-pointerdown warm-up). Muted users skip inside preloadSfx.
    preloadSfx('click_2', 'ui_click');

    AppState.addEventListener('change', (next: AppStateStatus) => {
      try {
        // iOS 'inactive' (call banners, Control Center, app switcher) is
        // TRANSIENT and must not deactivate: expo-audio doesn't pause players
        // there, so starting the 5s fade on it silenced music behind a
        // 2-second Control Center pull (the fade completed with the player
        // still "playing" and nothing ever re-ramped). Only a true
        // 'background' counts — mirroring web's visibilitychange semantics.
        const nowActive = next !== 'background';
        if (nowActive === appActive) return;
        appActive = nowActive;
        if (!musicOn || !musicPlayer) return;
        if (!nowActive) {
          fadePlayer(musicPlayer, 0, MUSIC_HIDDEN_FADE_S);
          hiddenPauseTimer = setTimeout(
            () => {
              hiddenPauseTimer = null;
              try {
                if (!appActive && musicOn && musicPlayer) musicPlayer.pause();
              } catch {}
            },
            MUSIC_HIDDEN_FADE_S * 1000 + 100,
          );
        } else {
          if (hiddenPauseTimer) {
            clearTimeout(hiddenPauseTimer);
            hiddenPauseTimer = null;
          }
          // A playlist switch that landed while backgrounded never started
          // its track — start fresh from the active list instead of resuming
          // the stale mood (playingPlaylist mismatch inside startMusic).
          // startMusic ALWAYS re-ramps the volume: expo-audio natively
          // auto-resumes paused players on foreground before this JS runs,
          // so `playing` is true while the volume still sits at the
          // background fade's 0 — without the unconditional ramp every
          // roundtrip left "playing" silence until the track ended.
          startMusic();
        }
      } catch {}
    });

    // Competitive-playlist gate, driven by store subscription (services read
    // stores imperatively — the haptics.ts precedent). The nextGameQueued
    // term is web home.js parity: without it Play Again blips chill between
    // matches (leaveGame drops the pipeline for the interstitial beat before
    // the requeue lands).
    let lastPipeline = false;
    let lastConnected = useMultiplayerStore.getState().connected;
    useMultiplayerStore.subscribe((s) => {
      try {
        const inPipeline =
          (s.inGame && !!s.gameData?.public) || !!s.gameQueued || !!s.nextGameQueued;
        if (inPipeline !== lastPipeline) {
          lastPipeline = inPipeline;
          setMusicPlaylist(inPipeline ? 'competitive' : 'chill');
          // The mood flip is ALSO a recovery trigger: if music was disarmed
          // earlier (a stream death anywhere in the session), setMusicPlaylist
          // no-ops and nothing else would start the competitive list until
          // foreground/reconnect/unmute — i.e. a whole match of silence. When
          // music is healthy this is a no-op (the pending switch timer makes
          // startMusic early-return), so the normal crossfade is untouched.
          startMusic();
        }
        // Connectivity-restore nudge (§11.1 — web's 'online' listener): the
        // WS reconnecting is the app's own connectivity signal, so no NetInfo
        // dependency. A stream that died offline disarmed musicOn; this
        // restarts it cleanly (startMusic is idempotent and self-gating).
        if (s.connected !== lastConnected) {
          lastConnected = s.connected;
          if (s.connected) startMusic();
        }
      } catch {}
    });

    // Volume boundary reactions (mute stops the stream; unmute restarts).
    let lastMusicVol = musicSliderVolume();
    useSettingsStore.subscribe((s) => {
      try {
        if (s.musicVolume !== lastMusicVol) {
          lastMusicVol = s.musicVolume;
          onMusicVolumeChanged();
        }
      } catch {}
    });

    startMusic();
  } catch {}
}
