/** Equipped cosmetic skus. `null` = nothing equipped in that slot. */
export interface UserCosmeticsEquipped {
  /** Backgrounds are web-only in v1 — mobile never reads this, keep for parity. */
  background?: string | null;
  nameGlow?: string | null;
  markerSkin?: string | null;
}

export interface UserCosmetics {
  /** Every sku the account owns (models/User.js `cosmetics.owned`). */
  owned?: string[];
  equipped?: UserCosmeticsEquipped;
  /** User-chosen emote picker order (sku ids). */
  emoteOrder?: string[];
}

export interface User {
  secret?: string;
  accountId?: string;
  username: string;
  email?: string;
  elo: number;
  /**
   * Server-computed league for `elo`. PREFERRED over the local table wherever
   * a tier is rendered, so a seasonal re-anchor of the cutoffs needs no store
   * release. Arrives as the whole league object from api/eloRank.js and the ws
   * `elo` message; may be a bare name string from older payloads.
   */
  league?: string | { name?: string; min?: number; max?: number; emoji?: string; color?: string; light?: string } | null;
  /** Count of RATED games — drives the v2 K-factor schedule. */
  ratedGames?: number;
  totalXp: number;
  totalGamesPlayed: number;
  countryCode?: string;
  banned?: boolean;
  banType?: string;
  banExpiresAt?: string;
  banPublicNote?: string;
  staff?: boolean;
  created_at?: Date;
  pendingNameChange?: boolean;
  pendingNameChangePublicNote?: string;
  canChangeUsername?: boolean;
  daysUntilNameChange?: number;
  recentChange?: boolean;
  /** Set when the account has a pending self-service deletion (30-day grace). */
  pendingDeletion?: boolean;
  scheduledDeletionAt?: string;

  // ── Stamps / shop ──────────────────────────────────────────────────────────
  /** Soft-currency balance. */
  stamps?: number;
  cosmetics?: UserCosmetics;
  /**
   * ISO date string while an Ad-Free Pass is live, else null/absent.
   * REFRESH TRAP: this only re-reads on an auth refetch, so a pass bought
   * mid-session must be written straight back here by the purchase path or the
   * next interstitial still fires. See services/ads.ts isAdFree().
   */
  adFreeUntil?: string | null;
  /**
   * Server kill-switch for the whole stamps/shop feature. Absent on servers
   * predating it — treat undefined as OFF (fail closed: never show a shop the
   * server will reject every call from).
   */
  stampsEnabled?: boolean;
  /**
   * Season 1 migration notice, shown once per pre-migration account. The server
   * omits the key entirely once acked, so presence IS the "show it" signal.
   * Grants are eager (already applied by the migration); this only displays them.
   */
  eloNotice?: {
    oldElo: number;
    peakElo: number;
    newElo: number;
    league: string;
    stampsGranted: number;
    ogBadge: boolean;
  } | null;
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
}

export interface FriendRequest {
  id: string;
  name: string;
}

export interface AuthSession {
  token: {
    secret: string;
    username: string;
    email?: string;
    staff?: boolean;
    elo?: number;
    totalXp?: number;
  } | null;
}
