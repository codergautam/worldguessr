// Daily Challenge API response contract — the shapes returned by
// /api/dailyChallenge/{locations,results,submit,claimGuestProgress,leaderboard}.
// Single source of truth for the request/response shapes both clients depend
// on. Consumed by the mobile TS app; documents the contract for the web app
// and server.

export interface DailyLocation {
  lat: number;
  long: number;
  heading?: number;
  country?: string;
  panoId?: string;
}

export interface DailyLocationsResponse {
  date: string;
  challengeNumber: number;
  sessionToken: string;
  timePerRound: number;
  totalRounds: number;
  locations: DailyLocation[];
}

export interface DailyDistribution {
  totalPlays: number;
  avgScore: number;
  buckets: number[];
  roundAverages: number[];
}

export interface DailyLeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

// Top-100 board behind the opt-in leaderboard modal/sheet. Pagination is
// client-side — the whole (small) list comes down in one response.
export interface DailyLeaderboardResponse {
  date: string;
  leaderboard: DailyLeaderboardEntry[];
}

export interface DailyOwnRound {
  score: number;
  distance?: number;
  timeMs?: number;
  guessLat?: number;
  guessLng?: number;
  country?: string;
}

export interface DailyUser {
  username?: string;
  streak?: number;
  streakBest?: number;
  graceDay?: boolean;
  /** True once today is locked for this identity — INCLUDING disqualified
   * runs (a DQ still advances the streak; only ranking fields are nulled). */
  playedToday?: boolean;
  disqualifiedToday?: boolean;
  ownScore?: number;
  ownRank?: number;
  ownRounds?: DailyOwnRound[];
  ownTotalTime?: number;
  history?: Array<{ date: string; score: number; rank?: number }>;
  personalBest?: number;
}

export interface DailyResultsResponse {
  date: string;
  distribution?: DailyDistribution;
  user?: DailyUser;
}

export interface DailySubmitRound {
  score: number;
  timeMs: number | null;
  guessLat: number | null;
  guessLng: number | null;
  country: string | null;
}

export interface DailySubmitBody {
  date: string;
  score: number;
  totalTime: number;
  rounds: DailySubmitRound[];
  sessionToken?: string;
  disqualified?: boolean;
  secret?: string;
  guestId?: string;
}

export interface DailySubmitResponse {
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
}

export interface DailyClaimResponse {
  ok?: boolean;
  mergedDays?: number;
  streak?: number;
  code?: string;
}
