import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User } from '../shared';
import { api } from '../services/api';

const SECRET_KEY = 'wg_secret';

interface AuthState {
  secret: string | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  loadSession: () => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<boolean>;
  loginWithSecret: (secret: string) => Promise<boolean>;
  setUsername: (username: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  secret: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  loadSession: async () => {
    try {
      const secret = await SecureStore.getItemAsync(SECRET_KEY);
      if (secret) {
        // Validate the secret with the server
        const success = await get().loginWithSecret(secret);
        if (!success) {
          // Invalid secret, clear it
          await SecureStore.deleteItemAsync(SECRET_KEY);
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithGoogle: async (idToken: string) => {
    try {
      set({ isLoading: true });
      const response = await api.googleAuth(idToken);

      if (response.secret) {
        await SecureStore.setItemAsync(SECRET_KEY, response.secret);
        set({
          secret: response.secret,
          user: {
            username: response.username,
            email: response.email,
            elo: response.elo ?? 1000,
            totalXp: response.totalXp ?? 0,
            totalGamesPlayed: response.totalGamesPlayed ?? 0,
            countryCode: response.countryCode,
            staff: response.staff,
            supporter: response.supporter,
          },
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }
      set({ isLoading: false });
      return false;
    } catch (error) {
      console.error('Google auth failed:', error);
      set({ isLoading: false });
      return false;
    }
  },

  loginWithSecret: async (secret: string) => {
    try {
      const response = await api.publicAccount(secret);

      if (response && response.username) {
        await SecureStore.setItemAsync(SECRET_KEY, secret);
        set({
          secret,
          user: {
            username: response.username,
            email: response.email,
            elo: response.elo ?? 1000,
            totalXp: response.totalXp ?? 0,
            totalGamesPlayed: response.totalGamesPlayed ?? 0,
            countryCode: response.countryCode,
            staff: response.staff,
            supporter: response.supporter,
          },
          isAuthenticated: true,
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login with secret failed:', error);
      return false;
    }
  },

  setUsername: async (username: string) => {
    const { secret } = get();
    if (!secret) return false;

    try {
      const response = await api.setName(secret, username);
      if (response.success) {
        set((state) => ({
          user: state.user ? { ...state.user, username } : null,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Set username failed:', error);
      return false;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(SECRET_KEY);
    set({
      secret: null,
      user: null,
      isAuthenticated: false,
    });
  },

  updateUser: (updates: Partial<User>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }));
  },
}));
