export interface User {
  secret?: string;
  username: string;
  email?: string;
  elo: number;
  totalXp: number;
  totalGamesPlayed: number;
  countryCode?: string;
  banned?: boolean;
  banType?: string;
  banExpiresAt?: Date;
  staff?: boolean;
  supporter?: boolean;
  created_at?: Date;
}

export interface UserStats {
  totalPoints: number;
  totalXp: number;
  totalDistance: number;
  avgDistance: number;
  roundsPlayed: number;
}

export interface Friend {
  id: string;
  name: string;
  online: boolean;
  socketId?: string;
  supporter?: boolean;
}

export interface FriendRequest {
  id: string;
  name: string;
  supporter?: boolean;
}

export interface AuthSession {
  token: {
    secret: string;
    username: string;
    email?: string;
    staff?: boolean;
    supporter?: boolean;
    elo?: number;
    totalXp?: number;
  } | null;
}
