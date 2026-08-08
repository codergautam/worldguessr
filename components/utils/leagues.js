import { RATING_V2 } from './ratingFlags.js';

// KNOWN WART, DO NOT "FIX" HERE: the object keys and the display `.name` values
// are swapped for the first two tiers. Key `explorer` displays as "Trekker"
// (0-1999) and key `trekker` displays as "Explorer" (2000-4999). The keys are
// read directly by callers (e.g. `leagues.voyager.min` in ws/ws.js), and four of
// the six key readers disappear when v2 matchmaking lands, so renaming now would
// only guarantee a merge conflict. Scheduled for an isolated follow-up commit.
export const leagues = {
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
}

// v2 tier table. Cutoffs sit on the rating-v2 scale, which is a different scale
// entirely from v1: these numbers are NOT v1 numbers rescaled, so never compare
// a v1 elo against a v2 bound. Keys are suffixed `V2` so nothing can accidentally
// read a v2 tier through a v1 key lookup (and vice versa) while both tables ship.
//
// Legend starts EMPTY at migration: no account is seeded above 1800, so the tier
// is earned only through post-migration play. Expect zero Legends on day one and
// do not treat an empty Legend bucket as a bug.
export const leaguesV2 = {
  // `light` (not `lightColor`): duelHealthbar.js and partyLobby.js read `.light`
  // for the name glow, so a differently-named key silently drops Trekker's glow.
  trekkerV2:  { name: 'Trekker',  min: 0,    max: 814,  emoji: '🥾', color: '#808080', light: '#d3d3d3' },
  explorerV2: { name: 'Explorer', min: 815,  max: 944,  emoji: '🧭', color: '#cd7f32' },
  voyagerV2:  { name: 'Voyager',  min: 945,  max: 1269, emoji: '🚢', color: '#ffd700' },
  nomadV2:    { name: 'Nomad',    min: 1270, max: 1799, emoji: '🌍', color: '#b9f2ff' },
  legendV2:   { name: 'Legend',   min: 1800, max: Infinity, emoji: '👑', color: '#dc143c' },
};

// In-memory override installed from the `leagues` RatingConfig doc. Null means
// "nothing installed", which is the correct steady state for every process that
// never loads config (the browser bundle, scripts, tests).
let configuredLeagues = null;

const isNumericBound = (v) => typeof v === 'number' && !Number.isNaN(v);

const slugifyTierName = (name, index) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, '') || `tier${index}`;

/**
 * Install a league table from the `tiers` array of a RatingConfig doc.
 *
 * READERS MUST FALL BACK, NEVER THROW (see models/RatingConfig.js). A malformed
 * doc, a partial write caught mid-update, or a tier with a null bound must never
 * be able to take down the rank display or the matchmaker, so every failure path
 * here logs and KEEPS the previously active table.
 *
 * @returns {boolean} true if the table was installed, false if it was rejected.
 */
export const setLeagueConfig = (tiers) => {
  const reject = (why) => {
    console.warn('[leagues] rejected league config, keeping previous table:', why);
    return false;
  };

  if (!Array.isArray(tiers)) return reject(`tiers is not an array (got ${typeof tiers})`);
  if (tiers.length === 0) return reject('tiers is empty');

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (!tier || typeof tier !== 'object') return reject(`tier ${i} is not an object`);
    if (typeof tier.name !== 'string' || tier.name.trim() === '') return reject(`tier ${i} has no name`);
    if (!isNumericBound(tier.min)) return reject(`tier ${i} (${tier.name}) has a non-numeric min`);
    if (!isNumericBound(tier.max)) return reject(`tier ${i} (${tier.name}) has a non-numeric max`);
    if (tier.max < tier.min) return reject(`tier ${i} (${tier.name}) has max < min`);
    // Sorted ascending AND non-overlapping: the next floor must clear this ceiling.
    if (i > 0 && tier.min <= tiers[i - 1].max) {
      return reject(`tier ${i} (${tier.name}) overlaps or is out of order with ${tiers[i - 1].name}`);
    }
  }

  // Fill in cosmetics the config doc omits from whichever hardcoded table the
  // flag says is current, so a bounds-only config never renders an undefined
  // colour or a missing emoji.
  const cosmeticSource = RATING_V2 ? leaguesV2 : leagues;
  const next = {};
  tiers.forEach((tier, i) => {
    const fallback = Object.values(cosmeticSource).find(l => l.name === tier.name) || {};
    let key = slugifyTierName(tier.name, i);
    while (Object.prototype.hasOwnProperty.call(next, key)) key = `${key}${i}`;
    next[key] = {
      name: tier.name,
      min: tier.min,
      max: tier.max,
      emoji: tier.emoji ?? fallback.emoji,
      color: tier.color ?? fallback.color,
      ...(fallback.light ? { light: fallback.light } : {}),
      ...(fallback.lightColor ? { lightColor: fallback.lightColor } : {}),
    };
  });

  configuredLeagues = next;
  return true;
};

/** Drop any installed config table. Tests only. */
export const clearLeagueConfig = () => {
  configuredLeagues = null;
};

/**
 * The table every lookup reads: config doc if one was installed, else the v2
 * table when RATING_V2 is on, else v1.
 */
export const getActiveLeagues = () => {
  if (configuredLeagues) return configuredLeagues;
  return RATING_V2 ? leaguesV2 : leagues;
};

export const getLeague = (elo) => {
  const table = getActiveLeagues();
  for (const league in table) {
    if (elo >= table[league].min && elo <= table[league].max) {

      return table[league];
    }
  }
  // return first league
  return table[Object.keys(table)[0]];
}

/**
 * Resolve the league to DISPLAY, preferring whatever the SERVER said.
 *
 * WHY: the tier cutoffs are seasonal. `models/RatingConfig.js` already lets the
 * server re-anchor them at runtime (setLeagueConfig), and api/eloRank.js returns
 * the whole resolved `league` object alongside every rating it hands out. If a
 * component insisted on its own bundled table, a re-anchor would need a full web
 * deploy to stop mislabelling people — and the bundled table is the one thing in
 * the chain that is baked into a cached JS file. So: server wins, local table is
 * the fallback for old payloads and offline renders.
 *
 * Mirrors resolveLeague in mobile/src/shared/user/leagues.ts — and lives here,
 * beside the tables, for the same reason it does over there. It used to sit in
 * components/eloView.js, which drags XPGraph in behind it; the top-right player
 * card needs the same resolution and is in the main bundle, where that import
 * chain is not welcome.
 *
 * Never throws and never returns undefined — every failure path lands on
 * getLeague(elo). Accepts all three shapes the wire produces: the full object
 * (api/eloRank), a bare name (ws roster), or nothing at all.
 */
export const resolveLeague = (elo, server) => {
  const local = getLeague(elo);
  if (!server) return local;

  const name = typeof server === 'string' ? server : server.name;
  if (typeof name !== 'string' || name.trim() === '') return local;

  // Cosmetic donor: the local tier sharing this name, else the rating bucket.
  // A server tier we have never heard of still gets a sane emoji and colour.
  const donor = Object.values(getActiveLeagues()).find((l) => l.name === name) || local;
  if (typeof server === 'string') return donor.name === name ? donor : { ...donor, name };

  return {
    ...donor,
    name,
    min: typeof server.min === 'number' && Number.isFinite(server.min) ? server.min : donor.min,
    // Infinity does not survive JSON (it serialises to null), so the top tier
    // arriving off the wire with max == null must not become NaN or 0.
    max: typeof server.max === 'number' && Number.isFinite(server.max) ? server.max : donor.max,
    emoji: server.emoji || donor.emoji,
    color: server.color || donor.color,
  };
};

export const getLeagueRange = (name) => {
  const table = getActiveLeagues();
  const league = Object.values(table).find(league => league.name === name);
  if (!league) {
    // Called with player.league straight off a websocket message in ws/ws.js, so
    // an unknown or stale name must NOT throw: a throw there kills the handler.
    // Fall back to the lowest tier, matching mobile/src/shared/user/leagues.ts.
    const lowest = table[Object.keys(table)[0]];
    return lowest ? [lowest.min, lowest.max] : [0, 1999];
  }
  return [league.min, league.max];
}
