import { GameSettings } from '../shared';

// TODO: Replace with environment variable
// const API_URL = 'https://api.worldguessr.com';
const API_URL = 'http://172.20.10.2:3001'; // Local dev server (use your machine's local IP)
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
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const body = await response.json();
      if (body.message) message = body.message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
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
      body: JSON.stringify({ id_token: idToken }),
    });
  },

  setName: async (secret: string, username: string) => {
    const url = `${API_URL}/api/setName`;
    const response = await fetch(url, {
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
      body: JSON.stringify({ secret }),
    });
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
    return fetchApi<{ success: boolean }>('/api/updateCountryCode', {
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
      rounds: Array<{
        lat: number;
        long: number;
        guessLat: number;
        guessLong: number;
        points: number;
        time: number;
      }>;
      settings: GameSettings;
      totalScore: number;
      totalXp: number;
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

  // Locations
  fetchAllLocations: async () => {
    return fetchApi<{
      ready: boolean;
      locations: Array<{
        lat: number;
        long: number;
        country?: string;
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
        country?: string;
      }>;
      maxDist?: number;
    }>(`/countryLocations/${countryCode}`);
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
      }>;
      maxDist?: number;
    }>(`/mapLocations/${mapSlug}`);
  },
};
