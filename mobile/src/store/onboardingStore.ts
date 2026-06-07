import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_DONE_KEY = 'wg_onboarding_done';
const COUNTRY_STREAK_KEY = 'wg_country_streak';
const CONTINENT_STREAK_KEY = 'wg_continent_streak';
// Classic world-map ("location: all") country streak — web's gameStorage
// "countryStreak" (home.js). Distinct from the country-GUESSER streak above.
const WORLD_STREAK_KEY = 'wg_world_streak';

type StreakMode = 'country' | 'continent' | 'world';

// mode → { in-memory field, AsyncStorage key } so bump/reset stay one code path.
const STREAK_FIELD = {
  country: 'countryStreak',
  continent: 'continentStreak',
  world: 'worldStreak',
} as const;
const STREAK_STORAGE_KEY: Record<StreakMode, string> = {
  country: COUNTRY_STREAK_KEY,
  continent: CONTINENT_STREAK_KEY,
  world: WORLD_STREAK_KEY,
};

interface OnboardingState {
  /** True once the welcome flow has run (or been skipped). Start `true` so we never
   *  flash the overlay before AsyncStorage answers; `loadFlag()` flips it to false
   *  when no record exists yet. */
  completed: boolean;
  /** Loaded once on app start so the home screen can decide whether to render
   *  the overlay without an AsyncStorage round-trip on every render. */
  loaded: boolean;
  countryStreak: number;
  continentStreak: number;
  /** Classic world-map country streak (web parity: home.js countryStreak). */
  worldStreak: number;

  loadFlag: () => Promise<void>;
  markComplete: () => Promise<void>;
  reset: () => Promise<void>;
  bumpStreak: (mode: StreakMode) => Promise<void>;
  resetStreak: (mode: StreakMode) => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  completed: true,
  loaded: false,
  countryStreak: 0,
  continentStreak: 0,
  worldStreak: 0,

  loadFlag: async () => {
    try {
      const [doneRaw, countryRaw, continentRaw, worldRaw] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_DONE_KEY),
        AsyncStorage.getItem(COUNTRY_STREAK_KEY),
        AsyncStorage.getItem(CONTINENT_STREAK_KEY),
        AsyncStorage.getItem(WORLD_STREAK_KEY),
      ]);
      set({
        completed: doneRaw === 'true',
        countryStreak: countryRaw ? parseInt(countryRaw, 10) || 0 : 0,
        continentStreak: continentRaw ? parseInt(continentRaw, 10) || 0 : 0,
        worldStreak: worldRaw ? parseInt(worldRaw, 10) || 0 : 0,
        loaded: true,
      });
    } catch {
      // If storage is unreadable we'd rather skip onboarding than blow up — the
      // welcome modal can always be re-triggered manually from a dev menu later.
      set({ completed: true, loaded: true });
    }
  },

  markComplete: async () => {
    set({ completed: true });
    try {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    } catch {}
  },

  reset: async () => {
    set({ completed: false, countryStreak: 0, continentStreak: 0, worldStreak: 0 });
    try {
      await AsyncStorage.multiRemove([
        ONBOARDING_DONE_KEY,
        COUNTRY_STREAK_KEY,
        CONTINENT_STREAK_KEY,
        WORLD_STREAK_KEY,
      ]);
    } catch {}
  },

  bumpStreak: async (mode) => {
    const key = STREAK_FIELD[mode];
    const next = get()[key] + 1;
    set({ [key]: next } as Partial<OnboardingState>);
    try {
      await AsyncStorage.setItem(STREAK_STORAGE_KEY[mode], String(next));
    } catch {}
  },

  resetStreak: async (mode) => {
    const key = STREAK_FIELD[mode];
    set({ [key]: 0 } as Partial<OnboardingState>);
    try {
      await AsyncStorage.setItem(STREAK_STORAGE_KEY[mode], '0');
    } catch {}
  },
}));
