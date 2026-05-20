import { GameSettings } from '../shared';
import { API_URL, AUTH_URL } from '../constants/config';
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
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;

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
      if (body.error) message = body.error;
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
      body: JSON.stringify({ apple_identity_token: identityToken }),
    }, AUTH_URL);
  },

  setName: async (secret: string, username: string) => {
    const url = `${AUTH_URL}/api/setName`;
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
      await fetch(`${API_URL}/mapPlay/${encodeURIComponent(slug)}`, { method: 'POST' });
    } catch {}
  },

  // Daily Challenge
  dailyChallenge: {
    locations: async (date: string, secret?: string) => {
      const q = new URLSearchParams({ date });
      if (secret) q.set('secret', secret);
      return fetchApi<{
        date: string;
        challengeNumber: number;
        sessionToken: string;
        timePerRound: number;
        totalRounds: number;
        locations: Array<{ lat: number; long: number; heading?: number; country?: string; panoId?: string }>;
      }>(`/api/dailyChallenge/locations?${q.toString()}`);
    },

    results: async (date: string, secret?: string, guestId?: string) => {
      const q = new URLSearchParams({ date });
      if (secret) q.set('secret', secret);
      else if (guestId) q.set('guestId', guestId);
      return fetchApi<{
        date: string;
        distribution?: {
          totalPlays: number;
          avgScore: number;
          buckets: number[];
          roundAverages: number[];
        };
        top10?: Array<{ rank: number; username: string; score: number }>;
        user?: {
          username?: string;
          streak?: number;
          streakBest?: number;
          graceDay?: boolean;
          playedToday?: boolean;
          disqualifiedToday?: boolean;
          ownScore?: number;
          ownRank?: number;
          ownRounds?: Array<{
            score: number;
            distance?: number;
            timeMs?: number;
            guessLat?: number;
            guessLng?: number;
            country?: string;
          }>;
          ownTotalTime?: number;
          history?: Array<{ date: string; score: number; rank?: number }>;
          personalBest?: number;
        };
      }>(`/api/dailyChallenge/results?${q.toString()}`);
    },

    submit: async (body: {
      date: string;
      score: number;
      totalTime: number;
      rounds: Array<{
        score: number;
        timeMs: number | null;
        guessLat: number | null;
        guessLng: number | null;
        country: string | null;
      }>;
      sessionToken?: string;
      disqualified?: boolean;
      secret?: string;
      guestId?: string;
    }) => {
      return fetchApi<{
        score: number;
        rank?: number;
        totalPlays: number;
        percentile?: number;
        streak?: number;
        streakBest?: number;
        graceUsed?: boolean;
        newPersonalBest?: boolean;
        disqualified?: boolean;
        alreadySubmitted?: boolean;
        guest?: boolean;
      }>('/api/dailyChallenge/submit', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    claimGuestProgress: async (secret: string, guestId: string) => {
      return fetchApi<{
        ok?: boolean;
        mergedDays?: number;
        streak?: number;
        code?: string;
      }>('/api/dailyChallenge/claimGuestProgress', {
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
