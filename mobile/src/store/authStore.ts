import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User } from '../shared';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import {
  claimGuestProgressIfAny,
  resetClaimGuestProgressState,
} from '../components/daily/claimGuestProgress';

const SECRET_KEY = 'wg_secret';

interface AuthState {
  secret: string | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  loadSession: () => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<{ success: boolean; error?: string }>;
  loginWithApple: (identityToken: string) => Promise<{ success: boolean; error?: string }>;
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
        // Merge any pre-signin guest daily progress into this account.
        // Fire-and-forget — failure shouldn't block auth.
        claimGuestProgressIfAny(response.secret).catch(() => {});
        return { success: true };
      }
      set({ isLoading: false });
      // Authenticated at the transport level but the server returned no secret —
      // pass along any server-provided reason so the UI can show it.
      return { success: false, error: (response as any).error };
    } catch (error: any) {
      console.error('Google auth failed:', error);
      set({ isLoading: false });
      // error.message is already a clean, localized string for network/timeout
      // failures (see fetchApi) or the server's message for HTTP errors.
      return { success: false, error: error?.message };
    }
  },

  loginWithApple: async (identityToken: string) => {
    try {
      set({ isLoading: true });
      const response = await api.appleAuth(identityToken);

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
        // Merge any pre-signin guest daily progress into this account.
        // Fire-and-forget — failure shouldn't block auth.
        claimGuestProgressIfAny(response.secret).catch(() => {});
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, error: (response as any).error };
    } catch (error: any) {
      console.error('Apple auth failed:', error);
      set({ isLoading: false });
      return { success: false, error: error?.message };
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
        // Merge any pre-signin guest daily progress into this account.
        // Fire-and-forget — failure shouldn't block auth.
        claimGuestProgressIfAny(response.secret).catch(() => {});
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
      // Force a WS reconnect so the server re-reads this account with its new
      // username. The secret hasn't changed, so the persistent socket would
      // otherwise keep serving the stale (username-less) session — the web app
      // sidesteps this by doing a full page reload after setName. force=true
      // tears the socket down and sends a fresh `verify`, re-syncing presence,
      // streak, profile name, etc. Fire-and-forget; failure just falls back to
      // the existing socket and the normal reconnect machinery.
      wsService.connect(secret, true).catch(() => {});
      return { success: true };
    } catch (error: any) {
      console.error('Set username failed:', error);
      return { success: false, error: 'Connection error. Please try again.' };
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(SECRET_KEY);
    resetClaimGuestProgressState();
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
