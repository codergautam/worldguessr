import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, STARTING_ELO, type UserCosmeticsEquipped } from '../shared';
import { api, ApiError } from '../services/api';
import { wsService } from '../services/websocket';
import { useMultiplayerStore } from './multiplayerStore';
import {
  claimGuestProgressIfAny,
  resetClaimGuestProgressState,
} from '../components/daily/claimGuestProgress';

const SECRET_KEY = 'wg_secret';

/**
 * Build the in-memory User from an auth response.
 *
 * ONE mapper, three call sites (google / apple / restore-session). This used to
 * be three hand-copied destructures, which meant every new server field had to
 * be added in three places and was SILENTLY DROPPED from whichever one was
 * missed — the field arrived over the wire and simply never reached the store.
 * Add new fields HERE and nowhere else.
 */
function userFromAuthResponse(response: any): User {
  return {
    accountId: response.accountId,
    username: response.username || '',
    email: response.email,
    elo: response.elo ?? STARTING_ELO,
    league: response.league ?? null,
    ratedGames: response.ratedGames,
    totalXp: response.totalXp ?? 0,
    totalGamesPlayed: response.totalGamesPlayed ?? 0,
    countryCode: response.countryCode,
    staff: response.staff,
    banned: response.banned,
    banType: response.banType,
    banExpiresAt: response.banExpiresAt,
    banPublicNote: response.banPublicNote,
    pendingNameChange: response.pendingNameChange,
    pendingNameChangePublicNote: response.pendingNameChangePublicNote,
    canChangeUsername: response.canChangeUsername,
    daysUntilNameChange: response.daysUntilNameChange,
    recentChange: response.recentChange,
    pendingDeletion: response.pendingDeletion,
    scheduledDeletionAt: response.scheduledDeletionAt,
    // Stamps / shop. `stampsEnabled` fails CLOSED (undefined -> false): a server
    // predating the feature must not render a shop every call would 404 from.
    stamps: response.stamps ?? 0,
    cosmetics: response.cosmetics ?? { owned: [], equipped: {} },
    adFreeUntil: response.adFreeUntil ?? null,
    stampsEnabled: response.stampsEnabled === true,
    // Season 1 first-login notice. The server OMITS this key entirely once the
    // account has acked, so `?? null` is the "nothing to show" state rather
    // than a default. This whitelist is why the field must be listed at all:
    // anything not named here is silently dropped even when the server sends it.
    eloNotice: response.eloNotice ?? null,
  };
}

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
  /**
   * Optimistically apply a finished game's rewards to the in-memory user so XP /
   * games-played update instantly everywhere (profile, etc.) without an app
   * reload. The server is the source of truth; refreshAccount() reconciles.
   */
  applyGameResult: (delta: { xp?: number; gamesPlayed?: number }) => void;
  /**
   * Re-fetch the signed-in user's authoritative totals (totalXp,
   * totalGamesPlayed, elo) from the server and merge them into the store. Used
   * to reconcile optimistic updates and on profile focus.
   */
  refreshAccount: () => Promise<void>;
  /**
   * Merge a cosmetics/stamps patch into the in-memory user. Fed by the ws
   * `cosmetics` push, the shop purchase/equip responses, and the balance fetch.
   * Every field is optional and only present keys are written, so a partial
   * payload can never wipe a sibling field.
   */
  applyCosmetics: (patch: CosmeticsPatch) => void;
}

/** Partial cosmetics/stamps update. Absent key = "leave that field alone". */
export interface CosmeticsPatch {
  stamps?: number;
  owned?: string[];
  equipped?: UserCosmeticsEquipped;
  emoteOrder?: string[];
  adFreeUntil?: string | null;
  stampsEnabled?: boolean;
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
        const ok = await get().loginWithSecret(secret);
        if (!ok) {
          // Definitive only: the server rejected the secret as invalid/expired.
          // Full local sign-out (reuse logout()) so in-memory user/isAuthenticated
          // are cleared too, not just the stored secret.
          await get().logout();
        }
      }
    } catch (error) {
      // Transient (offline / timeout / 5xx): loginWithSecret rethrows these.
      // Keep the stored secret so the next launch/refresh retries. Web parity.
      console.warn('loadSession: transient error, keeping stored secret', error);
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
          user: userFromAuthResponse(response),
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
          user: userFromAuthResponse(response),
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
          user: userFromAuthResponse(response),
          isAuthenticated: true,
        });
        // Merge any pre-signin guest daily progress into this account.
        // Fire-and-forget — failure shouldn't block auth.
        claimGuestProgressIfAny(response.secret).catch(() => {});
        return true;
      }
      return false;
    } catch (error) {
      // Definitive auth rejection: server responded that the secret is invalid/expired.
      if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
        console.warn('Login with secret rejected (invalid/expired):', error.status);
        return false; // -> loadSession clears the secret via logout()
      }
      // Transient (offline / timeout / 5xx): keep the secret, let the caller retry.
      throw error;
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
    // Clear account-scoped multiplayer state (friends/presence + sent/received/
    // incoming requests + game invites + settings toggles) on logout — web
    // parity with signOut()'s full page reload. Run BEFORE set({secret:null})
    // so stale friends are gone before the useWebSocket secret-change effect
    // kicks off the guest reconnect, leaving no window where stale account
    // data coexists with a fresh guest socket. resetAccount() (NOT reset(),
    // which is game-scoped only) preserves connected/verified, which the
    // reconnect re-syncs.
    useMultiplayerStore.getState().resetAccount();
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

  applyGameResult: (delta) => {
    const xp = Math.max(0, Math.round(delta.xp ?? 0));
    const gamesPlayed = Math.max(0, Math.round(delta.gamesPlayed ?? 0));
    if (xp === 0 && gamesPlayed === 0) return;
    set((state) => {
      if (!state.user) return {};
      return {
        user: {
          ...state.user,
          totalXp: (state.user.totalXp ?? 0) + xp,
          totalGamesPlayed: (state.user.totalGamesPlayed ?? 0) + gamesPlayed,
        },
      };
    });
  },

  refreshAccount: async () => {
    const { user, secret } = get();
    const accountId = user?.accountId;
    if (!accountId) return;
    try {
      // publicAccount is authoritative for totalXp / totalGamesPlayed (gamesLen).
      // The stamps balance lives behind the authenticated shop endpoint, so it
      // rides alongside — allSettled, never all: a shop outage must not cost us
      // the XP/games reconciliation. Skipped entirely unless the SERVER said the
      // feature is on, so this never becomes a wasted round trip per refresh on
      // a deployment that has no shop.
      const wantBalance = !!secret && user?.stampsEnabled === true;
      const [accountRes, balanceRes] = await Promise.allSettled([
        api.publicAccount(accountId),
        wantBalance ? api.getStampBalance(secret!) : Promise.reject(new Error('shop disabled')),
      ]);
      if (accountRes.status !== 'fulfilled') throw accountRes.reason;
      const account = accountRes.value;
      const balance = balanceRes.status === 'fulfilled' ? balanceRes.value : null;
      set((state) => {
        if (!state.user) return {};
        // publicAccount is cached server-side (~20s), so a refresh fired right
        // after a game can return pre-game totals. XP / games only ever grow, so
        // never let a stale cached read regress an optimistic value — take the
        // max. Country code isn't monotonic, so always trust the server for it.
        const serverXp = account.totalXp ?? 0;
        const serverGames = account.gamesLen ?? 0;
        return {
          user: {
            ...state.user,
            totalXp: Math.max(state.user.totalXp ?? 0, serverXp),
            totalGamesPlayed: Math.max(state.user.totalGamesPlayed ?? 0, serverGames),
            countryCode: account.countryCode ?? state.user.countryCode,
            // Stamps are NOT monotonic (spending them goes down), so the server
            // value wins outright whenever we actually got one. A failed balance
            // call leaves the existing value alone rather than zeroing it.
            ...(balance
              ? {
                  stamps: balance.stamps ?? state.user.stamps,
                  cosmetics: balance.cosmetics ?? state.user.cosmetics,
                  adFreeUntil: balance.adFreeUntil ?? null,
                  ...(typeof balance.stampsEnabled === 'boolean'
                    ? { stampsEnabled: balance.stampsEnabled }
                    : {}),
                }
              : {}),
          },
        };
      });
    } catch (error) {
      console.warn('refreshAccount failed:', error);
    }
  },

  applyCosmetics: (patch) => {
    set((state) => {
      if (!state.user) return {};
      const prev = state.user.cosmetics ?? {};
      return {
        user: {
          ...state.user,
          // MERGE, never replace: the ws `cosmetics` push carries equipped+owned
          // but no stamps, and the purchase response carries stamps+adFreeUntil
          // but may omit a slot. A whole-object assign from either would wipe
          // whatever the other one owns.
          ...(patch.stamps !== undefined ? { stamps: patch.stamps } : {}),
          ...(patch.adFreeUntil !== undefined ? { adFreeUntil: patch.adFreeUntil } : {}),
          ...(patch.stampsEnabled !== undefined ? { stampsEnabled: patch.stampsEnabled } : {}),
          cosmetics: {
            ...prev,
            ...(patch.owned !== undefined ? { owned: patch.owned } : {}),
            ...(patch.emoteOrder !== undefined ? { emoteOrder: patch.emoteOrder } : {}),
            ...(patch.equipped !== undefined
              ? { equipped: { ...(prev.equipped ?? {}), ...patch.equipped } }
              : {}),
          },
        },
      };
    });
  },
}));
