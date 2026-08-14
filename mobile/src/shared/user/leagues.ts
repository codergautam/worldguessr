// Hand-maintained mirror of components/utils/leagues.js. THESE HAVE DRIFTED
// BEFORE — when the web table changes, change this file in the same commit.
import { EXPLORER_MIN, VOYAGER_MIN, NOMAD_MIN, LEGEND_MIN } from './eloSystem';
export interface League {
  min: number;
  max: number;
  name: string;
  emoji: string;
  color: string;
  light?: string;
}

// ── v2 (CURRENT SCALE) ───────────────────────────────────────────────────────
// Cutoffs sit on the rating-v2 scale. The retired Season 0 (v1) table is NOT
// mirrored here: no mobile surface renders Season 0 cutoffs (the peak badge
// arrives as a server-computed NAME), so the app carries only the live table.
// Keys keep the `V2` suffix so they line up with the web module's.
//
// `light` (not `lightColor`) — web's duelHealthbar.js/partyLobby.js read `.light`
// for the name glow, and mobile's DuelHUD/GetReadyOverlay do the same.
// Cutoffs are IMPORTED from ./eloSystem, never typed here: the same numbers
// drive the server's K_VET rating lock (kFactor in the web module), so a band
// moved in one place and not the other would silently split the K schedule
// from the tier display.
export const leaguesV2: Record<string, League> = {
  trekkerV2:  { name: 'Trekker',  min: 0,            max: EXPLORER_MIN - 1, emoji: '🥾', color: '#808080', light: '#d3d3d3' },
  explorerV2: { name: 'Explorer', min: EXPLORER_MIN, max: VOYAGER_MIN - 1,  emoji: '🧭', color: '#cd7f32' },
  voyagerV2:  { name: 'Voyager',  min: VOYAGER_MIN,  max: NOMAD_MIN - 1,    emoji: '🚢', color: '#ffd700' },
  nomadV2:    { name: 'Nomad',    min: NOMAD_MIN,    max: LEGEND_MIN - 1,   emoji: '🌍', color: '#b9f2ff' },
  legendV2:   { name: 'Legend',   min: LEGEND_MIN,   max: Infinity,         emoji: '👑', color: '#dc143c' },
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
