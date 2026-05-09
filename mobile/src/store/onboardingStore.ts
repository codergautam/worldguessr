import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_DONE_KEY = 'wg_onboarding_done';
const COUNTRY_STREAK_KEY = 'wg_country_streak';
const CONTINENT_STREAK_KEY = 'wg_continent_streak';

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

  loadFlag: () => Promise<void>;
  markComplete: () => Promise<void>;
  reset: () => Promise<void>;
  bumpStreak: (mode: 'country' | 'continent') => Promise<void>;
  resetStreak: (mode: 'country' | 'continent') => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  completed: true,
  loaded: false,
  countryStreak: 0,
  continentStreak: 0,

  loadFlag: async () => {
    try {
      const [doneRaw, countryRaw, continentRaw] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_DONE_KEY),
        AsyncStorage.getItem(COUNTRY_STREAK_KEY),
        AsyncStorage.getItem(CONTINENT_STREAK_KEY),
      ]);
      set({
        completed: doneRaw === 'true',
        countryStreak: countryRaw ? parseInt(countryRaw, 10) || 0 : 0,
        continentStreak: continentRaw ? parseInt(continentRaw, 10) || 0 : 0,
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
    set({ completed: false, countryStreak: 0, continentStreak: 0 });
    try {
      await AsyncStorage.multiRemove([
        ONBOARDING_DONE_KEY,
        COUNTRY_STREAK_KEY,
        CONTINENT_STREAK_KEY,
      ]);
    } catch {}
  },

  bumpStreak: async (mode) => {
    const key = mode === 'country' ? 'countryStreak' : 'continentStreak';
    const next = get()[key] + 1;
    set({ [key]: next } as Partial<OnboardingState>);
    try {
      await AsyncStorage.setItem(
        mode === 'country' ? COUNTRY_STREAK_KEY : CONTINENT_STREAK_KEY,
        String(next),
      );
    } catch {}
  },

  resetStreak: async (mode) => {
    const key = mode === 'country' ? 'countryStreak' : 'continentStreak';
    set({ [key]: 0 } as Partial<OnboardingState>);
    try {
      await AsyncStorage.setItem(
        mode === 'country' ? COUNTRY_STREAK_KEY : CONTINENT_STREAK_KEY,
        '0',
      );
    } catch {}
  },
}));
