import { GameSettings } from '../shared';

// TODO: Replace with environment variable
const API_URL = 'https://api.worldguessr.com';

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
    throw new Error(`API error: ${response.status}`);
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
    }>('/api/googleAuth', {
      method: 'POST',
      body: JSON.stringify({ code: idToken }),
    });
  },

  setName: async (secret: string, name: string) => {
    return fetchApi<{ success: boolean; error?: string }>('/api/setName', {
      method: 'POST',
      body: JSON.stringify({ secret, name }),
    });
  },

  // Account
  publicAccount: async (secret: string) => {
    return fetchApi<{
      username: string;
      email?: string;
      elo: number;
      totalXp: number;
      totalGamesPlayed: number;
      countryCode?: string;
      staff?: boolean;
      supporter?: boolean;
    }>(`/api/publicAccount?secret=${encodeURIComponent(secret)}`);
  },

  publicProfile: async (username: string) => {
    return fetchApi<{
      username: string;
      elo: number;
      totalXp: number;
      totalGamesPlayed: number;
      countryCode?: string;
      supporter?: boolean;
      wins?: number;
      losses?: number;
      draws?: number;
    }>(`/api/publicProfile?username=${encodeURIComponent(username)}`);
  },

  updateCountryCode: async (secret: string, countryCode: string) => {
    return fetchApi<{ success: boolean }>('/api/updateCountryCode', {
      method: 'POST',
      body: JSON.stringify({ secret, countryCode }),
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
        rounds: Array<{
          location: { lat: number; long: number };
          guesses: Record<string, { guessLat: number; guessLong: number; points: number }>;
        }>;
        players: Array<{ username: string; totalScore: number }>;
        settings: GameSettings;
      };
    }>('/api/gameDetails', {
      method: 'POST',
      body: JSON.stringify({ secret, gameId }),
    });
  },

  // Maps
  mapHome: async () => {
    return fetchApi<{
      maps: Array<{
        slug: string;
        name: string;
        created_by: string;
        plays: number;
        hearts: number;
        locationCount: number;
        description?: string;
      }>;
    }>('/api/map/mapHome');
  },

  searchMap: async (query: string) => {
    return fetchApi<{
      maps: Array<{
        slug: string;
        name: string;
        created_by: string;
        plays: number;
        hearts: number;
        locationCount: number;
      }>;
    }>(`/api/map/searchMap?q=${encodeURIComponent(query)}`);
  },

  // Reports
  submitReport: async (
    secret: string,
    reportedUser: string,
    reason: 'inappropriate_username' | 'cheating' | 'other',
    details?: string
  ) => {
    return fetchApi<{ success: boolean }>('/api/submitReport', {
      method: 'POST',
      body: JSON.stringify({ secret, reportedUser, reason, details }),
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
