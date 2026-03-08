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
  setUsername: (username: string) => Promise<{ success: boolean; error?: string }>;
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
        const success = await get().loginWithSecret(secret);
        if (!success) {
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
            accountId: response.accountId,
            username: response.username || '',
            email: response.email,
            elo: response.elo ?? 1000,
            totalXp: response.totalXp ?? 0,
            totalGamesPlayed: response.totalGamesPlayed ?? 0,
            countryCode: response.countryCode,
            staff: response.staff,
            supporter: response.supporter,
            banned: response.banned,
            banType: response.banType,
            banExpiresAt: response.banExpiresAt,
            banPublicNote: response.banPublicNote,
            pendingNameChange: response.pendingNameChange,
            pendingNameChangePublicNote: response.pendingNameChangePublicNote,
            canChangeUsername: response.canChangeUsername,
            daysUntilNameChange: response.daysUntilNameChange,
            recentChange: response.recentChange,
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
      // Use same endpoint as web (POST /api/googleAuth with { secret })
      const response = await api.restoreSession(secret);

      if (response && response.secret && !response.error) {
        await SecureStore.setItemAsync(SECRET_KEY, response.secret);
        set({
          secret: response.secret,
          user: {
            accountId: response.accountId,
            username: response.username || '',
            email: response.email,
            elo: response.elo ?? 1000,
            totalXp: response.totalXp ?? 0,
            totalGamesPlayed: response.totalGamesPlayed ?? 0,
            countryCode: response.countryCode,
            staff: response.staff,
            supporter: response.supporter,
            banned: response.banned,
            banType: response.banType,
            banExpiresAt: response.banExpiresAt,
            banPublicNote: response.banPublicNote,
            pendingNameChange: response.pendingNameChange,
            pendingNameChangePublicNote: response.pendingNameChangePublicNote,
            canChangeUsername: response.canChangeUsername,
            daysUntilNameChange: response.daysUntilNameChange,
            recentChange: response.recentChange,
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
    if (!secret) return { success: false, error: 'Not authenticated' };

    try {
      const response = await api.setName(secret, username);
      if (response.message) {
        // Server returned an error message
        return { success: false, error: response.message };
      }
      // Success — update user in store
      set((state) => ({
        user: state.user ? { ...state.user, username } : null,
      }));
      return { success: true };
    } catch (error: any) {
      console.error('Set username failed:', error);
      return { success: false, error: 'Connection error. Please try again.' };
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
