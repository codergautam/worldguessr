// Hand-maintained mirror of components/utils/leagues.js. THESE HAVE DRIFTED
// BEFORE — when the web table changes, change this file in the same commit.
export interface League {
  min: number;
  max: number;
  name: string;
  emoji: string;
  color: string;
  light?: string;
}

// ── v1 (LEGACY SCALE) ────────────────────────────────────────────────────────
// KNOWN WART, mirrored deliberately: the object keys and the display `.name`
// values are swapped for the first two tiers (key `explorer` displays as
// "Trekker", key `trekker` displays as "Explorer"). The KEYS are what callers
// read — app/settings.tsx gates strict matchmaking on `leagues.voyager.min`,
// mirroring ws/ws.js:1672, which still reads the v1 table for that gate. So the
// v1 table stays here, unchanged, even though display now runs on v2.
export const leagues: Record<string, League> = {
  'explorer': {
    min: 0,
    max: 1999,
    name: 'Trekker',
    emoji: '🥾',
    color: '#808080', // grey
    light: '#d3d3d3' // light grey
  },
  'trekker': {
    min: 2000,
    max: 4999,
    name: 'Explorer',
    emoji: '🧭',
    color: '#cd7f32' // bronze
  },
  'voyager': {
    min: 5000,
    max: 7999,
    name: 'Voyager',
    emoji: '🚢',
    color: '#ffd700' // gold
  },
  'nomad': {
    min: 8000,
    max: 20000,
    name: 'Nomad',
    emoji: '🌍',
    color: '#b9f2ff' // diamond
  },
};

// ── v2 (CURRENT SCALE) ───────────────────────────────────────────────────────
// Cutoffs sit on the rating-v2 scale, which is a DIFFERENT SCALE entirely from
// v1: these numbers are NOT v1 numbers rescaled, so never compare a v1 elo
// against a v2 bound. Keys are suffixed `V2` so nothing can accidentally read a
// v2 tier through a v1 key lookup while both tables ship.
//
// `light` (not `lightColor`) — web's duelHealthbar.js/partyLobby.js read `.light`
// for the name glow, and mobile's DuelHUD/GetReadyOverlay do the same.
export const leaguesV2: Record<string, League> = {
  trekkerV2:  { name: 'Trekker',  min: 0,    max: 814,      emoji: '🥾', color: '#808080', light: '#d3d3d3' },
  explorerV2: { name: 'Explorer', min: 815,  max: 944,      emoji: '🧭', color: '#cd7f32' },
  voyagerV2:  { name: 'Voyager',  min: 945,  max: 1269,     emoji: '🚢', color: '#ffd700' },
  nomadV2:    { name: 'Nomad',    min: 1270, max: 1799,     emoji: '🌍', color: '#b9f2ff' },
  legendV2:   { name: 'Legend',   min: 1800, max: Infinity, emoji: '👑', color: '#dc143c' },
};

/**
 * The table every DISPLAY lookup reads. v2 — the app talks to a v2 server and a
 * top-of-ladder rating is now ~1600, which the v1 table would paint as the
 * bottom tier. The v1 table above is still exported for the handful of callers
 * that mirror a server-side v1 key read (see the note on `leagues`).
 */
export const getActiveLeagues = (): Record<string, League> => leaguesV2;

/**
 * Get league based on rating. Never throws — an out-of-band rating falls back
 * to the lowest tier rather than returning undefined into a style prop.
 */
export function getLeague(elo: number): League {
  const table = getActiveLeagues();
  for (const league in table) {
    if (elo >= table[league].min && elo <= table[league].max) {
      return table[league];
    }
  }
  // Return first league as default
  return table[Object.keys(table)[0]];
}

/**
 * Get rating range for a league by name. Called with names that arrive straight
 * off a websocket message, so an unknown or stale name must NOT throw: fall
 * back to the lowest tier (mirrors getLeagueRange in components/utils/leagues.js).
 */
export function getLeagueRange(name: string): [number, number] {
  const table = getActiveLeagues();
  const league = Object.values(table).find(league => league.name === name);
  if (!league) {
    const lowest = table[Object.keys(table)[0]];
    return lowest ? [lowest.min, lowest.max] : [0, 814];
  }
  return [league.min, league.max];
}

/**
 * The rating floor the "avoid lower skill duels" (strict matchmaking) setting
 * enforces. Mirrors getStrictFloor in components/utils/leagues.js.
 *
 * READ FROM THE ACTIVE TABLE, NEVER TYPED. Both clients used to compare against
 * `leagues.voyager.min`, which is 5,000 on the RETIRED Season 0 scale. A v2
 * rating tops out around 1,600, so after the migration that comparison was
 * false for every account alive and the toggle was hidden from literally
 * everybody, on web and here, while the setting kept shipping.
 */
export const STRICT_TIER_NAME = 'Voyager';

export function getStrictFloor(): number {
  const table = getActiveLeagues();
  const tier = Object.values(table).find((l) => l.name === STRICT_TIER_NAME);
  // Fails CLOSED (nobody eligible) rather than to 0, which would read as
  // "everyone is eligible" and is the worse of the two wrong answers.
  return typeof tier?.min === 'number' && Number.isFinite(tier.min) ? tier.min : Infinity;
}

/**
 * A league as it arrives from the server. `api/eloRank.js` returns the WHOLE
 * league object (`getLeague(user.elo)`); the ws `elo` message does too; the ws
 * roster carries only the NAME. All three shapes land here.
 */
export type ServerLeague = string | Partial<League> | null | undefined;

/**
 * Resolve the league to DISPLAY, preferring whatever the server said.
 *
 * WHY THIS EXISTS: a seasonal re-anchor of the tier cutoffs must not require a
 * store release. The server already computes the tier for every rating it hands
 * out, so when it tells us one, we render it — the local table is only the
 * offline/legacy-server fallback. Fields the server omits (emoji, colour on a
 * name-only payload) are filled from the local entry with the SAME NAME, so a
 * renamed-but-unknown tier still gets sane cosmetics from the rating bucket.
 *
 * Never throws and never returns undefined: every failure path lands on
 * getLeague(elo).
 */
export function resolveLeague(elo: number, server?: ServerLeague): League {
  const local = getLeague(elo);
  if (!server) return local;

  const name = typeof server === 'string' ? server : server.name;
  if (typeof name !== 'string' || name.trim() === '') return local;

  // Cosmetic donor: the local tier that shares this name, else the rating bucket.
  const donor = Object.values(getActiveLeagues()).find((l) => l.name === name) ?? local;
  if (typeof server === 'string') return donor.name === name ? donor : { ...donor, name };

  return {
    name,
    min: typeof server.min === 'number' && Number.isFinite(server.min) ? server.min : donor.min,
    // Infinity does not survive JSON (it serialises to null), so a top tier
    // arriving from the wire with max == null must NOT become NaN or 0.
    max: typeof server.max === 'number' && Number.isFinite(server.max) ? server.max : donor.max,
    emoji: typeof server.emoji === 'string' && server.emoji ? server.emoji : donor.emoji,
    color: typeof server.color === 'string' && server.color ? server.color : donor.color,
    ...(typeof server.light === 'string' && server.light
      ? { light: server.light }
      : donor.light
        ? { light: donor.light }
        : {}),
  };
}
