export interface Location {
  lat: number;
  long: number;
  country?: string;
  panoId?: string;
  placeName?: string;
  maxDist?: number;
}

export interface Guess {
  guessLat: number;
  guessLong: number;
  points: number;
  time: number;
  usedHint?: boolean;
}

export interface RoundData {
  location: Location;
  guesses: Record<string, Guess>;
  roundNumber: number;
}

export interface GameSettings {
  location: string;
  maxDist: number;
  official: boolean;
  rounds: number;
  timePerRound: number;
  showRoadName?: boolean;
  noMove?: boolean;
  noPan?: boolean;
  noZoom?: boolean;
  mapType?: 'm' | 's' | 'p' | 'y';
}

export type GameType = 'singleplayer' | 'ranked_duel' | 'unranked_multiplayer' | 'private_multiplayer';

export type GameState = 'waiting' | 'getready' | 'guess' | 'end';

export interface Player {
  odmongoDBId?: string;
  odusername: string;
  odaccountId?: string;
  odcountryCode?: string;
  totalScore: number;
  finalRank?: number;
  elo?: {
    before: number;
    after: number;
    change: number;
  };
}

export interface GameResult {
  winner?: string;
  maxPossiblePoints: number;
  rankings?: Player[];
}
