import { GameSettings, t } from '../shared';
import { API_URL, AUTH_URL, HTTP_TIMEOUT_MS } from '../constants/config';
import { fetchWithTimeout, TimeoutError } from './fetchWithTimeout';
import type {
  DailyLocationsResponse,
  DailyResultsResponse,
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
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface MapItem {
  id?: string;
  slug: string;
  name: string;
  created_by_name?: string;
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
        t('errorRequestTimedOut', undefined, 'Request timed out. Check your connection and try again.'),
      );
    }
    throw new Error(
      t('errorNetworkRequest', undefined, 'Network error. Check your connection and try again.'),
    );
  }

  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const body = await response.json();
      if (body.message) message = body.message;
      if (body.error) message = body.error;
    } catch {}
    throw new ApiError(message, response.status);
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

export const api = {
  // Auth
  googleAuth: async (idToken: string) => {
    return fetchApi<{
      secret: string;
      username: string;
      email?: string;
      elo?: number;
      totalXp?: number;
      totalGamesPlayed?: number;
      countryCode?: string;
      staff?: boolean;
      supporter?: boolean;
      needsUsername?: boolean;
      accountId?: string;
      banned?: boolean;
      banType?: string;
      banExpiresAt?: string;
      banPublicNote?: string;
      pendingNameChange?: boolean;
      pendingNameChangePublicNote?: string;
      canChangeUsername?: boolean;
      daysUntilNameChange?: number;
      recentChange?: boolean;
    }>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, tz: getDeviceTimezone() }),
    }, AUTH_URL);
  },

  appleAuth: async (identityToken: string) => {
    return fetchApi<{
      secret: string;
      username: string;
      email?: string;
      elo?: number;
      totalXp?: number;
      totalGamesPlayed?: number;
      countryCode?: string;
      staff?: boolean;
      supporter?: boolean;
      needsUsername?: boolean;
      accountId?: string;
      banned?: boolean;
      banType?: string;
      banExpiresAt?: string;
      banPublicNote?: string;
      pendingNameChange?: boolean;
      pendingNameChangePublicNote?: string;
      canChangeUsername?: boolean;
      daysUntilNameChange?: number;
      recentChange?: boolean;
    }>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ apple_identity_token: identityToken, tz: getDeviceTimezone() }),
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
    return fetchApi<{
      secret: string;
      username: string;
      email?: string;
      elo?: number;
      totalXp?: number;
      totalGamesPlayed?: number;
      countryCode?: string;
      staff?: boolean;
      supporter?: boolean;
      error?: string;
      accountId?: string;
      banned?: boolean;
      banType?: string;
      banExpiresAt?: string;
      banPublicNote?: string;
      pendingNameChange?: boolean;
      pendingNameChangePublicNote?: string;
      canChangeUsername?: boolean;
      daysUntilNameChange?: number;
      recentChange?: boolean;
    }>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ secret, tz: getDeviceTimezone() }),
    }, AUTH_URL);
  },

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
    }>('/api/publicAccount', {
      method: 'POST',
      body: JSON.stringify({ id: accountId }),
    });
  },

  publicProfile: async (username: string) => {
    return fetchApi<{
      username: string;
      elo: number;
      totalXp: number;
      gamesPlayed: number;
      createdAt?: string;
      profileViews?: number;
      countryCode?: string;
      supporter?: boolean;
      rank?: number;
      duelStats?: {
        wins: number;
        losses: number;
        ties: number;
        winRate: number;
      };
    }>(`/api/publicProfile?username=${encodeURIComponent(username)}`);
  },

  eloRank: async (username: string) => {
    return fetchApi<{
      elo: number;
      rank: number;
      duels_wins: number;
      duels_losses: number;
      duels_tied: number;
      win_rate: number;
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
      }>;
      myRank?: number;
      myElo?: number;
      myXp?: number;
      myCountryCode?: string;
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
        };
        opponent?: { username: string; countryCode?: string };
        roundsPlayed: number;
        totalDuration: number;
        result: { maxPossiblePoints: number };
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
        }>;
        players: Array<{
          playerId: string;
          username: string;
          accountId: string;
          countryCode?: string;
          totalPoints: number;
          finalRank?: number;
          elo?: { before?: number; after?: number; change?: number };
        }>;
        result: { maxPossiblePoints: number; isDraw?: boolean };
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
