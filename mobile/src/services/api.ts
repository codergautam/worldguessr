import { GameSettings, t } from '../shared';
import { API_URL, AUTH_URL, HTTP_TIMEOUT_MS } from '../constants/config';
import { fetchWithTimeout, TimeoutError } from './fetchWithTimeout';
import type {
  DailyLocationsResponse,
  DailyResultsResponse,
  DailyLeaderboardResponse,
  DailySubmitBody,
  DailySubmitResponse,
  DailyClaimResponse,
} from '@shared/daily/types';
/**
 * Thrown when the server responds with a non-2xx status. Carries the HTTP
 * status so callers can distinguish a definitive rejection (e.g. 400/401/403)
 * from a transient failure. Mirrors the typed-error pattern of TimeoutError.
 * Network/timeout failures (no response) still throw a plain localized Error.
 */
export class ApiError extends Error {
  status: number;
  /** Parsed JSON body of the failed response (when it had one). The email login
   * endpoints put a locale KEY in `body.error`, which the sign-in sheet branches
   * on; `message` alone would lose it whenever the body also carries a sentence. */
  body: Record<string, any> | null;
  constructor(message: string, status: number, body: Record<string, any> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface MapItem {
  id?: string;
  slug: string;
  name: string;
  created_by_name?: string;
  /** Creator's equipped name-glow sku (sendableMap.created_by_glow). The SKU,
   *  not a colour — PlayerName owns sku -> paint, same as everywhere else. */
  created_by_glow?: string | null;
  plays: number;
  hearts: number;
  hearted?: boolean;
  locations?: number;
  description_short?: string;
  official?: boolean;
  accepted?: boolean;
  countryMap?: string; // country code for official country maps
  countryCode?: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  baseUrl = API_URL,
  timeoutMs = HTTP_TIMEOUT_MS,
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      },
      timeoutMs,
    );
  } catch (err) {
    // We never got a response: the request timed out, or the device is offline /
    // DNS failed. Every UI surface renders `error.message` straight into its
    // error state, so translate these into clean, localized, user-safe strings
    // here — this is what the user now sees instead of a spinner that never stops.
    if (err instanceof TimeoutError) {
      throw new Error(
        t('errorRequestTimedOut'),
      );
    }
    throw new Error(
      t('errorNetworkRequest'),
    );
  }

  if (!response.ok) {
    let message = `API error: ${response.status}`;
    let body: Record<string, any> | null = null;
    try {
      body = await response.json();
      if (body?.message) message = body.message;
      if (body?.error) message = body.error;
    } catch {}
    throw new ApiError(message, response.status, body);
  }

  return response.json();
}

export interface FeedbackPayload {
  /** Account secret if signed in; omitted/undefined for guests. */
  secret?: string | null;
  stars: number;
  comment?: string;
  /** Device + locale context so support can reproduce/help (see useReviewPrompt). */
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  buildVersion?: string;
  deviceModel?: string;
  deviceName?: string;
  /** Selected in-app language. */
  language?: string;
  /** Country code from the signed-in account, if any. */
  accountCountry?: string | null;
  /** Device locale tag + region from expo-localization. */
  deviceLocale?: string;
  deviceRegion?: string;
  timezone?: string;
}

/**
 * The device's current IANA timezone (e.g. "America/New_York"). Sent to the
 * server on auth so brand-new accounts get their country flag auto-assigned
 * instantly (server maps tz → countryCode). Returns undefined if unavailable.
 */
function getDeviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// ── Stamps shop ──────────────────────────────────────────────────────────────
// Every action goes through ONE endpoint, POST /api/stampShop, discriminated by
// `action`. Auth is the raw account secret in the body as `token`, same as every
// other authenticated endpoint in this file.

/** A catalogue entry as served by `action:'catalog'` (shared/shop/catalog.js). */
export interface ShopItem {
  sku: string;
  type: 'background' | 'glow' | 'marker' | 'emote' | 'pass';
  name: string;
  price: number;
  platforms: string[];
  /**
   * Glows only. TRUE MEANS MOBILE CANNOT RENDER THE ANIMATION: React Native's
   * `textShadowRadius` is not animatable on the native driver, so an animated
   * tier degrades to its STATIC glowDark/glowLight here. Never hide the item —
   * degrading beats rendering blank.
   */
  animated?: boolean;
  /** Glow colour on dark surfaces (HUD, menus, leaderboards). */
  glowDark?: string;
  /** Glow colour on LIGHT surfaces (white cards, map tooltips). */
  glowLight?: string;
  /** Pass items: how long the pass lasts. */
  durationMs?: number;
  /**
   * How many times this sku has been bought, ever — the "1.2K bought" line under
   * a card. ALWAYS A NUMBER from a current server (0 when nobody has), optional
   * here only so an older API that predates the field does not type-error; an
   * absent value renders exactly like a zero, which is nothing.
   *
   * It is a DENORMALISED counter behind a 5-minute server cache
   * (models/ShopPurchaseCount.js), so treat it as a display figure and never as
   * something to transact against. The buyer's own purchase is added locally —
   * see bumpBuyCount() in app/shop.tsx.
   */
  purchases?: number;
  /** Bundle items: the skus it grants. */
  includes?: string[];
  region?: string;
  path?: string;
  /**
   * Backgrounds only: the ISO 3166-1 alpha-2 code the card draws its flag from.
   * A country CODE and not a flag emoji, because CountryFlag renders the same
   * flagcdn image every username in the app already uses.
   */
  cc?: string | null;
  /**
   * Backgrounds only: the three-tone palette the home screen recolours to.
   *
   * NOTHING ON THIS CLIENT READS IT off the wire — src/shared/cosmetics.ts
   * mirrors the same values locally, because the home screen needs them on the
   * first frame and the shop catalogue is an HTTP call it has not made. It is
   * declared so the field is visible where the response is described rather
   * than looking like something the server forgot to send.
   */
  accent?: { deep: string; wash: string; surface: string } | null;
}

/** One emote as served by `action:'catalog'` (shared/emotes/catalog.js). */
export interface ShopEmote {
  id: string;
  name: string;
  glyph: string;
  free: boolean;
  sku: string | null;
  legacyIndex: number | null;
  owned: boolean;
}

export interface ShopCosmetics {
  owned?: string[];
  equipped?: { background?: string | null; nameGlow?: string | null; markerSkin?: string | null };
  emoteOrder?: string[];
}

/**
 * THE ENTITLEMENT BLOCK, EXACTLY AS THE SERVER SENDS IT.
 *
 * `owned`, `equipped` and `emoteOrder` live UNDER `cosmetics` — see
 * entitlementFields() in api/stampShop.js, which builds this block once for
 * every response that carries one. These interfaces used to declare `owned` and
 * `equipped` at the TOP level, where the server has never put them, so every
 * read of them was `undefined`: a purchase on this platform did not update the
 * local inventory at all, and the card you had just bought went on showing its
 * price until the app refetched the account. Nothing warned, because
 * `Array.isArray(undefined)` is simply false and the patch was skipped.
 */
export interface ShopEntitlements {
  stamps?: number;
  cosmetics?: ShopCosmetics;
  adFreeUntil?: string | null;
  stampsEnabled?: boolean;
}

export interface ShopCatalogResponse extends ShopEntitlements {
  items: ShopItem[];
  /** The FULL emote table, free entries included — the shop's emote shelf. */
  emotes?: ShopEmote[];
  enabled?: boolean;
}

export interface ShopMutationResponse extends ShopEntitlements {
  success?: boolean;
  /** True when the server recognised this purchaseKey as an already-applied buy. */
  duplicate?: boolean;
  error?: string;
  message?: string;
}

export interface StampBalanceResponse {
  stamps?: number;
  cosmetics?: {
    owned?: string[];
    equipped?: { background?: string | null; nameGlow?: string | null; markerSkin?: string | null };
    emoteOrder?: string[];
  };
  adFreeUntil?: string | null;
  stampsEnabled?: boolean;
}

export interface StampHistoryEntry {
  amount: number;
  reason?: string;
  sku?: string;
  createdAt?: string;
}

/**
 * A v4-shaped UUID for the purchase idempotency key.
 *
 * Prefers a real CSPRNG when the runtime exposes one; Hermes ships neither
 * `crypto.randomUUID` nor `getRandomValues` by default and this app carries no
 * crypto dependency, so the Math.random path is the realistic one. That is
 * FINE here and only here: this value is an idempotency token, not a secret or
 * a capability — it is scoped to one authenticated account's purchase, and the
 * server rejects an unknown key rather than trusting it. Do not reuse this
 * helper for anything that must be unguessable.
 */
export function newPurchaseKey(): string {
  return uuidV4();
}

/**
 * The email-code login's session nonce (web parity: LoginModal newClientId;
 * server: serverUtils/loginSession.js). Sent with emailLoginStart and
 * emailLoginVerify so the server recognises OUR retries and hands back the
 * code / login already issued instead of a 429 / 409. Not a secret and not a
 * capability (the emailed code is); it only has to be ours.
 */
export function newLoginSessionId(): string {
  return uuidV4();
}

function uuidV4(): string {
  const c: any = (globalThis as any).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Everything /api/googleAuth returns, for all three entry points (google,
 * apple, restore-session — they are literally the same route). ONE declaration:
 * these were three hand-copied literals, and a field missing from one of them
 * was silently dropped for that sign-in path only.
 */
export interface AuthResponse {
  secret: string;
  username: string;
  email?: string;
  elo?: number;
  /** Server-computed league for `elo`; prefer it over the local table. */
  league?: string | { name?: string; min?: number; max?: number; emoji?: string; color?: string; light?: string } | null;
  ratedGames?: number;
  totalXp?: number;
  totalGamesPlayed?: number;
  countryCode?: string;
  staff?: boolean;
  needsUsername?: boolean;
  accountId?: string;
  error?: string;
  banned?: boolean;
  banType?: string;
  banExpiresAt?: string;
  banPublicNote?: string;
  pendingNameChange?: boolean;
  pendingNameChangePublicNote?: string;
  canChangeUsername?: boolean;
  daysUntilNameChange?: number;
  recentChange?: boolean;
  pendingDeletion?: boolean;
  scheduledDeletionAt?: string;
  // Stamps / shop — added with the shop wave.
  stamps?: number;
  cosmetics?: {
    owned?: string[];
    equipped?: { background?: string | null; nameGlow?: string | null; markerSkin?: string | null };
    emoteOrder?: string[];
  };
  adFreeUntil?: string | null;
  stampsEnabled?: boolean;
}

function stampShop<T>(body: Record<string, unknown>): Promise<T> {
  return fetchApi<T>('/api/stampShop', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const api = {
  // Auth
  googleAuth: async (idToken: string) => {
    return fetchApi<AuthResponse>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, tz: getDeviceTimezone() }),
    }, AUTH_URL);
  },

  appleAuth: async (identityToken: string) => {
    return fetchApi<AuthResponse>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ apple_identity_token: identityToken, tz: getDeviceTimezone() }),
    }, AUTH_URL);
  },

  // Email + 6-digit code login (web parity: components/auth/LoginModal.js).
  // Step 1: send the code; `exists` decides whether a username step comes next.
  emailLoginStart: async (email: string, clientId: string) => {
    return fetchApi<{ loginId: string; exists: boolean; resendAfter: number; resent?: boolean }>('/api/emailLogin', {
      method: 'POST',
      body: JSON.stringify({ email, tz: getDeviceTimezone(), clientId }),
    }, AUTH_URL);
  },

  // Step 2 (new accounts): live availability. Advisory; emailVerify re-checks.
  checkUsername: async (username: string) => {
    return fetchApi<{ available: boolean; error?: string }>('/api/checkUsername', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }, AUTH_URL);
  },

  // Step 3: redeem the code. Same response shape as googleAuth (+ isNewAccount).
  // Errors arrive as ApiError with body.error = locale key (wrongCode,
  // codeExpired, codeUsed, usernameTaken, ...).
  emailLoginVerify: async (loginId: string, code: string, username: string | undefined, clientId: string) => {
    return fetchApi<AuthResponse & { isNewAccount?: boolean }>('/api/emailVerify', {
      method: 'POST',
      body: JSON.stringify({ loginId, code, username, tz: getDeviceTimezone(), clientId }),
    }, AUTH_URL);
  },

  setName: async (secret: string, username: string) => {
    const url = `${AUTH_URL}/api/setName`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: secret, username }),
    });
    const data = await response.json();
    return data as { success?: boolean; message?: string; pendingReview?: boolean };
  },

  // Restore session with stored secret (matches web auth.js flow)
  restoreSession: async (secret: string) => {
    return fetchApi<AuthResponse>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ secret, tz: getDeviceTimezone() }),
    }, AUTH_URL);
  },

  // Account deletion (30-day grace period). deleteAccount schedules deletion and
  // logs the user out instantly; cancelDeletion restores within the window.
  // Both are FAST (no cascade) — the heavy purge runs later in the cron process.
  deleteAccount: async (secret: string) =>
    fetchApi<{ success: boolean; scheduledDeletionAt?: string; alreadyScheduled?: boolean }>(
      '/api/deleteAccount',
      { method: 'POST', body: JSON.stringify({ secret }) },
    ),

  cancelDeletion: async (secret: string) =>
    fetchApi<{ success: boolean; alreadyActive?: boolean }>(
      '/api/cancelDeletion',
      { method: 'POST', body: JSON.stringify({ secret }) },
    ),

  // Mint the same short-lived, single-use forum session bridge used by the
  // web home CTA. Native cannot share SecureStore with the browser, so the
  // bridge hands the signed-in session across without putting the secret in
  // the URL. Guests skip this call and open the public forum directly.
  createForumBridge: async (secret: string) =>
    fetchApi<{ success: boolean; code: string }>('/api/forumBridge', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', secret }),
    }),

  checkNameChangeStatus: async (secret: string) => {
    return fetchApi<{
      hasPendingRequest: boolean;
      pendingNameChange: boolean;
      request?: {
        requestedUsername: string;
        status: 'pending' | 'rejected';
        rejectionReason?: string;
        rejectionCount?: number;
        createdAt: string;
      } | null;
    }>('/api/checkNameChangeStatus', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
  },

  // Account
  publicAccount: async (accountId: string) => {
    return fetchApi<{
      username: string;
      totalXp: number;
      createdAt?: string;
      gamesLen: number;
      lastLogin?: string;
      canChangeUsername: boolean;
      daysUntilNameChange: number;
      recentChange: boolean;
      countryCode?: string;
      // Season 0 record, mirroring api/publicProfile.js. This is the OWN-profile
      // payload, so without these the OG badge shows on everyone's profile
      // except your own.
      seasonPeakElo?: number | null;
      seasonPeakLeague?: string | null;
      season0Elo?: number | null;
      season0Rank?: number | null;
      ogAccount?: boolean;
    }>('/api/publicAccount', {
      method: 'POST',
      body: JSON.stringify({ id: accountId }),
    });
  },

  // Web pages/user.js parity: id is the stable lookup key (usernames change);
  // plain string = username, kept for old links and in-app navigation.
  publicProfile: async (lookup: string | { id: string }) => {
    const query =
      typeof lookup === 'string'
        ? `username=${encodeURIComponent(lookup)}`
        : `id=${encodeURIComponent(lookup.id)}`;
    return fetchApi<{
      username: string;
      elo: number;
      totalXp: number;
      gamesPlayed: number;
      createdAt?: string;
      profileViews?: number;
      countryCode?: string;
      rank?: number;
      duelStats?: {
        wins: number;
        losses: number;
        ties: number;
        winRate: number;
      };
      // Season 0 record behind the OG badge. `season0Rank` is the closing place
      // on the old ladder, from the server's frozen rank table — never a live
      // count and never comparable to `rank` above, which ranks Season 1.
      seasonPeakElo?: number | null;
      seasonPeakLeague?: string | null;
      season0Elo?: number | null;
      season0Rank?: number | null;
      ogAccount?: boolean;
    }>(`/api/publicProfile?${query}`);
  },

  eloRank: async (username: string) => {
    return fetchApi<{
      elo: number;
      rank: number;
      /**
       * The WHOLE league object as the server computed it (`getLeague(user.elo)`).
       * Prefer it over the local cutoff table wherever the tier is rendered.
       */
      league?: { name?: string; min?: number; max?: number; emoji?: string; color?: string; light?: string };
      /** Rated-game count — drives the v2 K-factor schedule. */
      ratedGames?: number;
      duels_wins: number;
      duels_losses: number;
      duels_tied: number;
      win_rate: number;
      // 2v2 team stats — in the same payload (api/eloRank.js), no extra fetch.
      team2v2_wins?: number;
      team2v2_losses?: number;
      team2v2_tied?: number;
      team2v2_win_rate?: number;
    }>(`/api/eloRank?username=${encodeURIComponent(username)}`);
  },

  userProgression: async (identifier: { username: string } | { userId: string }) => {
    return fetchApi<{
      progression: Array<{
        timestamp: string;
        totalXp: number;
        xpGain?: number;
        xpRank?: number;
        rankImprovement?: number;
        elo?: number;
        eloChange?: number;
        eloRank?: number;
      }>;
    }>('/api/userProgression', {
      method: 'POST',
      body: JSON.stringify(identifier),
    });
  },

  updateCountryCode: async (secret: string, countryCode: string) => {
    return fetchApi<{ success: boolean; countryCode: string | null }>('/api/updateCountryCode', {
      method: 'POST',
      body: JSON.stringify({ token: secret, countryCode }),
    });
  },

  // Leaderboard
  leaderboard: async (options: {
    mode?: 'xp' | 'elo';
    pastDay?: boolean;
    username?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (options.mode) params.set('mode', options.mode);
    if (options.pastDay) params.set('pastDay', 'true');
    if (options.username) params.set('username', options.username);

    return fetchApi<{
      leaderboard: Array<{
        rank: number;
        username: string;
        elo?: number;
        totalXp?: number;
        countryCode?: string;
        /** Equipped name-glow sku (api/leaderboard.js sendableUser). */
        nameGlow?: string | null;
      }>;
      myRank?: number;
      myElo?: number;
      myXp?: number;
      myCountryCode?: string;
      /**
       * The VIEWER's own glow, for the "Your Rank" card. It cannot be read off
       * `leaderboard` — the whole point of that card is that the viewer is
       * usually not in the top 100.
       */
      myNameGlow?: string | null;
    }>(`/api/leaderboard?${params.toString()}`);
  },

  // Games
  storeGame: async (
    secret: string,
    gameData: {
      official: boolean;
      location: string;
      countryGuesser?: boolean;
      countryGuessrSubMode?: 'country' | 'continent';
      rounds: Array<{
        lat: number;
        long: number;
        actualLat: number;
        actualLong: number;
        panoId?: string;
        country?: string;
        usedHint: boolean;
        maxDist: number;
        roundTime: number;
        xp: number;
        points: number;
      }>;
    }
  ) => {
    return fetchApi<{ success: boolean; gameId?: string }>('/api/storeGame', {
      method: 'POST',
      body: JSON.stringify({ secret, ...gameData }),
    });
  },

  gameHistory: async (secret: string, page = 1, limit = 10) => {
    return fetchApi<{
      games: Array<{
        gameId: string;
        gameType: string;
        settings: GameSettings;
        endedAt: string;
        userStats: {
          totalPoints: number;
          totalXp: number;
          finalRank?: number;
          elo?: { change: number };
          /** Team assignment in team modes ('a' | 'b'); null on solo modes. */
          team?: 'a' | 'b' | null;
        };
        opponent?: { username: string; countryCode?: string; accountId?: string | null };
        /** Team games only (2v2 / party team mode): user's teammates + opposing team. */
        teammates?: Array<{ username: string; accountId?: string | null; countryCode?: string | null }> | null;
        opponents?: Array<{ username: string; accountId?: string | null; countryCode?: string | null }> | null;
        roundsPlayed: number;
        totalDuration: number;
        result: {
          maxPossiblePoints: number;
          winningTeam?: 'a' | 'b' | null;
          teamScores?: { a: number | null; b: number | null };
        };
        multiplayer?: { playerCount: number };
      }>;
      pagination: {
        currentPage: number;
        totalPages: number;
        totalGames: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    }>('/api/gameHistory', {
      method: 'POST',
      body: JSON.stringify({ secret, page, limit }),
    });
  },

  gameDetails: async (secret: string, gameId: string) => {
    return fetchApi<{
      game: {
        gameId: string;
        gameType: string;
        settings: GameSettings;
        rounds: Array<{
          roundNumber: number;
          location: { lat: number; long: number; panoId?: string };
          guess: {
            guessLat: number;
            guessLong: number;
            points: number;
            timeTaken: number;
            xpEarned?: number;
            usedHint?: boolean;
          } | null;
          allGuesses: Array<{
            playerId: string;
            username: string;
            countryCode?: string;
            guessLat: number;
            guessLong: number;
            points: number;
            timeTaken: number;
            xpEarned?: number;
          }>;
          /** Team-mode round stamps — null on solo modes / pre-stamp docs. */
          teamRoundScores?: { a: number; b: number } | null;
          teamDamage?: number | null;
          teamDamageMultiplier?: number | null;
        }>;
        players: Array<{
          playerId: string;
          username: string;
          accountId: string;
          countryCode?: string;
          totalPoints: number;
          finalRank?: number;
          elo?: { before?: number; after?: number; change?: number };
          /** Team assignment in team modes ('a' | 'b'); null on solo modes. */
          team?: 'a' | 'b' | null;
          /** Match-time cosmetics frozen in the saved roster. Legacy game
           *  documents fall back to the player's current equipment. */
          nameGlow?: string | null;
          markerSkin?: string | null;
        }>;
        result: {
          maxPossiblePoints: number;
          isDraw?: boolean;
          winningTeam?: 'a' | 'b' | null;
          teamScores?: { a: number | null; b: number | null };
        };
        /** What this game paid the REQUESTING player, rebuilt from the stamps
         *  ledger — the same { total, lines } shape the live `stampsEarned`
         *  socket message carries. null when nothing was paid; absent on a
         *  server older than the rebuild. */
        stampsEarned?: {
          total: number;
          lines: Array<{ reason: string; amount: number }>;
        } | null;
        currentUserId: string;
      };
    }>('/api/gameDetails', {
      method: 'POST',
      body: JSON.stringify({ secret, gameId }),
    });
  },

  // Maps
  mapHome: async (secret?: string) => {
    if (secret) {
      // Authenticated POST — returns myMaps, likedMaps, hearted status
      return fetchApi<Record<string, Array<MapItem>>>('/api/map/mapHome', {
        method: 'POST',
        body: JSON.stringify({ secret }),
      });
    }
    // Anonymous GET with ?anon=true (no auth needed, cacheable)
    return fetchApi<Record<string, Array<MapItem>>>('/api/map/mapHome?anon=true');
  },

  mapPublicData: async (slug: string, secret?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) headers['authorization'] = `Bearer ${secret}`;
    return fetchApi<{ mapData: any }>(`/api/map/publicData?slug=${encodeURIComponent(slug)}`, { headers });
  },

  heartMap: async (secret: string, mapId: string) => {
    return fetchApi<{ success: boolean; hearted: boolean; hearts: number }>('/api/map/heartMap', {
      method: 'POST',
      body: JSON.stringify({ secret, mapId }),
    });
  },

  searchMap: async (query: string) => {
    // searchMap requires POST with body
    return fetchApi<Array<MapItem>>('/api/map/searchMap', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  },

  // Moderation
  userModerationData: async (secret: string) => {
    return fetchApi<{
      totalEloRefunded: number;
      reportStats: { total: number; open: number; ignored: number; actionTaken: number };
      eloRefunds: Array<{ id: string; amount: number; bannedUsername: string; date: string; newElo?: number }>;
      moderationHistory: Array<{ id: string; actionType: string; actionDescription: string; publicNote?: string; date: string; expiresAt?: string; durationString?: string }>;
      submittedReports: Array<{ id: string; reportedUsername: string; reason: string; status: string; date: string }>;
    }>('/api/userModerationData', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
  },

  // Reports
  submitReport: async (
    secret: string,
    reason: 'inappropriate_username' | 'cheating' | 'other',
    description: string,
    gameId: string,
    gameType: string,
    reportedUserAccountId?: string,
  ) => {
    return fetchApi<{ message: string; reportId?: string }>('/api/submitReport', {
      method: 'POST',
      body: JSON.stringify({ secret, reason, description, gameId, gameType, reportedUserAccountId }),
    });
  },

  // In-app rate-us feedback (1–4★) → forwarded to a Discord webhook server-side.
  submitFeedback: async (payload: FeedbackPayload) => {
    return fetchApi<{ message: string }>('/api/submitFeedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Locations
  fetchAllLocations: async () => {
    return fetchApi<{
      ready: boolean;
      locations: Array<{
        lat: number;
        long: number;
        lng?: number;
        country?: string;
        panoId?: string;
        heading?: number;
        head?: number;
        pitch?: number;
      }>;
      maxDist?: number;
    }>('/allCountries.json');
  },

  fetchCountryLocations: async (countryCode: string) => {
    return fetchApi<{
      ready: boolean;
      locations: Array<{
        lat: number;
        long: number;
        lng?: number;
        country?: string;
        panoId?: string;
        heading?: number;
        head?: number;
        pitch?: number;
      }>;
      maxDist?: number;
    }>(`/countryLocations/${countryCode}`);
  },

  trackMapPlay: async (slug: string) => {
    try {
      await fetchWithTimeout(`${API_URL}/mapPlay/${encodeURIComponent(slug)}`, { method: 'POST' });
    } catch {}
  },

  // Daily Challenge
  dailyChallenge: {
    locations: async (date: string, secret?: string) => {
      const q = new URLSearchParams({ date });
      if (secret) q.set('secret', secret);
      return fetchApi<DailyLocationsResponse>(`/api/dailyChallenge/locations?${q.toString()}`);
    },

    results: async (date: string, secret?: string, guestId?: string) => {
      const q = new URLSearchParams({ date });
      if (secret) q.set('secret', secret);
      else if (guestId) q.set('guestId', guestId);
      return fetchApi<DailyResultsResponse>(`/api/dailyChallenge/results?${q.toString()}`);
    },

    leaderboard: async (date: string) => {
      const q = new URLSearchParams({ date });
      return fetchApi<DailyLeaderboardResponse>(`/api/dailyChallenge/leaderboard?${q.toString()}`);
    },

    submit: async (body: DailySubmitBody) => {
      return fetchApi<DailySubmitResponse>('/api/dailyChallenge/submit', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    claimGuestProgress: async (secret: string, guestId: string) => {
      return fetchApi<DailyClaimResponse>('/api/dailyChallenge/claimGuestProgress', {
        method: 'POST',
        body: JSON.stringify({ secret, guestId }),
      });
    },
  },

  // ── Stamps shop ────────────────────────────────────────────────────────────

  /**
   * Storefront. `platform:'mobile'` is filtered SERVER-SIDE — backgrounds are
   * web-only in v1, so nothing this app cannot render ever reaches the grid.
   * The token is optional so a signed-out user can still browse.
   */
  getShopCatalog: async (secret?: string | null) => {
    return stampShop<ShopCatalogResponse>({
      action: 'catalog',
      platform: 'mobile',
      ...(secret ? { token: secret } : {}),
    });
  },

  /**
   * Buy one sku. THE CLIENT HALF OF THE IDEMPOTENCY CONTRACT LIVES HERE.
   *
   * `purchaseKey` is minted ONCE per button press by the caller and passed in.
   * On a TIMEOUT we genuinely do not know whether the debit landed, so we retry
   * with the SAME key — the server recognises it and returns the original
   * result instead of charging twice. On a 4xx we know the server decided
   * (insufficient stamps, already owned, unknown sku, bad token), so we NEVER
   * retry: a retry there can only turn one clean rejection into two.
   *
   * The caller must NOT mint a fresh key to retry a failed purchase. That is
   * exactly the double-charge this contract exists to prevent.
   */
  purchaseCosmetic: async (secret: string, sku: string, purchaseKey: string) => {
    const body = { action: 'purchase', token: secret, sku, purchaseKey };
    try {
      return await stampShop<ShopMutationResponse>(body);
    } catch (err) {
      // ApiError = the server answered. Its verdict stands, retry or not.
      if (err instanceof ApiError) throw err;
      // No response at all (timeout / offline / DNS). fetchApi turns these into
      // plain Errors. One retry on the SAME key resolves the ambiguity.
      return await stampShop<ShopMutationResponse>(body);
    }
  },

  /**
   * Equip (or, with `sku: null`, unequip) a cosmetic slot. Idempotent by nature
   * — it sets state rather than moving currency — so no purchase key.
   */
  equipCosmetic: async (
    secret: string,
    slot: 'nameGlow' | 'markerSkin' | 'background',
    sku: string | null,
  ) => {
    return stampShop<ShopMutationResponse>({
      action: 'equip',
      token: secret,
      slot,
      sku,
    });
  },

  /**
   * Write the emote bar — the ORDERED list of emote ids the in-game picker
   * renders. Same `equip` action, which takes a slot and/or an emoteOrder and
   * needs at least one of them; this is the emoteOrder half, and it exists
   * because this app had no way to send one at all. `[]` means "the stock bar".
   *
   * The server re-checks ownership and the length cap, so a client that gets
   * either wrong is rejected rather than trusted. Build the list with
   * toEmoteBarIds() (src/shared/emotes.ts) and it cannot be either.
   */
  equipEmoteOrder: async (secret: string, emoteOrder: string[]) => {
    return stampShop<ShopMutationResponse>({
      action: 'equip',
      token: secret,
      emoteOrder,
    });
  },

  getStampBalance: async (secret: string) => {
    return stampShop<StampBalanceResponse>({ action: 'balance', token: secret });
  },

  getStampHistory: async (secret: string) => {
    return stampShop<{ history: StampHistoryEntry[] }>({ action: 'history', token: secret });
  },

  fetchMapLocations: async (mapSlug: string) => {
    return fetchApi<{
      ready: boolean;
      name: string;
      official: boolean;
      locations: Array<{
        lat: number;
        long: number;
        lng?: number; // Some use lng instead of long
        country?: string;
        panoId?: string;
        heading?: number;
        head?: number;
        pitch?: number;
      }>;
      maxDist?: number;
    }>(`/mapLocations/${mapSlug}`);
  },
};
