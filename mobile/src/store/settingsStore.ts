import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDeviceLanguage,
  setLocaleLanguage,
  type SupportedLanguage,
} from '../shared/locale';
import { getDeviceUnits, type Units } from '../shared/units';

/**
 * User preferences mirrored from the web settings modal (components/settingsModal.js):
 * units, map tile type, language, and the multiplayer emote toggle. The web's
 * debug-only "Show RAM Usage" option is intentionally omitted (no equivalent on
 * mobile). Persisted as a single JSON blob in AsyncStorage.
 *
 * First run auto-detects units AND language from the device locale, then persists
 * the resolved values so the choice sticks and we don't re-detect every launch.
 */

const SETTINGS_KEY = 'wg_settings';

/** Google Maps tile layer codes: m=normal, s=satellite, p=terrain, y=hybrid. */
export type MapType = 'm' | 's' | 'p' | 'y';

interface PersistedSettings {
  units: Units;
  mapType: MapType;
  language: SupportedLanguage;
  multiplayerEmotesEnabled: boolean;
  hapticsEnabled: boolean;
  /**
   * Audio volumes in SLIDER space 0–1 (perceptual toGain(v)=v² applies only at
   * the player boundary in sound.ts). Defaults stay in lockstep with web
   * audio.js (music 0.5, sfx 0.85). Setting either to 0 is a real mute:
   * loads/streams are skipped entirely, not just silenced.
   */
  musicVolume: number;
  sfxVolume: number;
}

interface SettingsState extends PersistedSettings {
  /** True once AsyncStorage has been read (and the locale table primed). */
  loaded: boolean;
  loadSettings: () => Promise<void>;
  setUnits: (units: Units) => void;
  setMapType: (mapType: MapType) => void;
  setLanguage: (language: SupportedLanguage) => void;
  setMultiplayerEmotesEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
}

const DEFAULTS: PersistedSettings = {
  units: 'metric',
  mapType: 'm',
  language: 'en',
  multiplayerEmotesEnabled: true,
  hapticsEnabled: true,
  musicVolume: 0.5,
  sfxVolume: 0.85,
};

function persist(s: PersistedSettings): void {
  const data: PersistedSettings = {
    units: s.units,
    mapType: s.mapType,
    language: s.language,
    multiplayerEmotesEnabled: s.multiplayerEmotesEnabled,
    hapticsEnabled: s.hapticsEnabled,
    musicVolume: s.musicVolume,
    sfxVolume: s.sfxVolume,
  };
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(data)).catch(() => {});
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// The volume sliders call their setters on EVERY drag frame (~100 events per
// full-range drag) for live preview; persisting each one would hammer
// AsyncStorage with serialized writes. Trailing debounce: the last position
// lands ~300ms after the drag rests (a killed app mid-drag loses at most the
// final slider position — acceptable).
let persistDebounce: ReturnType<typeof setTimeout> | null = null;
function persistDebounced(s: PersistedSettings): void {
  if (persistDebounce) clearTimeout(persistDebounce);
  persistDebounce = setTimeout(() => {
    persistDebounce = null;
    persist(s);
  }, 300);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  loadSettings: async () => {
    let stored: Partial<PersistedSettings> = {};
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) stored = (JSON.parse(raw) as Partial<PersistedSettings>) ?? {};
    } catch {
      // Unreadable storage → fall through to device-detected defaults.
    }

    const resolved: PersistedSettings = {
      units: stored.units ?? getDeviceUnits(),
      mapType: stored.mapType ?? DEFAULTS.mapType,
      language: stored.language ?? getDeviceLanguage(),
      multiplayerEmotesEnabled:
        typeof stored.multiplayerEmotesEnabled === 'boolean'
          ? stored.multiplayerEmotesEnabled
          : DEFAULTS.multiplayerEmotesEnabled,
      hapticsEnabled:
        typeof stored.hapticsEnabled === 'boolean'
          ? stored.hapticsEnabled
          : DEFAULTS.hapticsEnabled,
      musicVolume:
        typeof stored.musicVolume === 'number' ? clamp01(stored.musicVolume) : DEFAULTS.musicVolume,
      sfxVolume:
        typeof stored.sfxVolume === 'number' ? clamp01(stored.sfxVolume) : DEFAULTS.sfxVolume,
    };

    // Prime the i18n table before anything renders so t() is correct from frame 1.
    setLocaleLanguage(resolved.language);
    set({ ...resolved, loaded: true });
    persist(resolved);
  },

  setUnits: (units) => {
    set({ units });
    persist(get());
  },

  setMapType: (mapType) => {
    set({ mapType });
    persist(get());
  },

  setLanguage: (language) => {
    setLocaleLanguage(language);
    set({ language });
    persist(get());
  },

  setMultiplayerEmotesEnabled: (multiplayerEmotesEnabled) => {
    set({ multiplayerEmotesEnabled });
    persist(get());
  },

  setHapticsEnabled: (hapticsEnabled) => {
    set({ hapticsEnabled });
    persist(get());
  },

  setMusicVolume: (v) => {
    set({ musicVolume: clamp01(v) });
    persistDebounced(get());
  },

  setSfxVolume: (v) => {
    set({ sfxVolume: clamp01(v) });
    persistDebounced(get());
  },
}));
