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
 * bundled SFX still work). New-track rule extends to BOTH manifests: web
 * audio.js PLAYLISTS and the copy below, plus the loudnorm check.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
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

/** Perceptual volume mapping — ONLY at the player boundary. */
const toGain = (v: number) => v * v;

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
      p = createAudioPlayer(SFX_SOURCES[name]);
      sfxPlayers.set(name, p);
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
    player.seekTo(0);
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
    const steps = Math.max(1, Math.round((seconds * 1000) / stepMs));
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      try {
        player.volume = start + (target - start) * (i / steps);
      } catch {}
      if (i >= steps) {
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
// both manifests + runs the loudnorm check). Path fragments under /music/.
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
        if (trackAdvancing && (state === 'ready' || status?.playing)) {
          trackAdvancing = false;
        }
        if (state === 'ready') trackHadReady = true;
        if (state === 'failed' || (state === 'idle' && trackHadReady && !trackAdvancing)) {
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

function playNextTrack(): void {
  try {
    const player = ensureMusicPlayer();
    if (!player) return;
    lastTrackIdx = pickNextTrack();
    playingPlaylist = activePlaylist;
    trackAdvancing = true; // cleared by the new track's first non-ended status
    trackHadReady = false;
    musicEnded = false;
    const src = `${SITE_URL}/music/${PLAYLISTS[activePlaylist][lastTrackIdx]}.mp3`;
    player.replace({ uri: src });
    player.volume = 0;
    player.play();
    // Only the session's FIRST successful start spends the slow
    // first-impression fade.
    const fadeInS = musicStartedOnce ? MUSIC_FADE_IN_S : MUSIC_FIRST_FADE_IN_S;
    musicStartedOnce = true;
    fadePlayer(player, musicTargetVolume(), fadeInS);
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
        musicPlayer.play();
        fadePlayer(musicPlayer, musicTargetVolume(), MUSIC_FADE_IN_S);
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
