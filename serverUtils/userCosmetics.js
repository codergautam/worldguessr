import mongoose from 'mongoose';
import User from '../models/User.js';

/* ===========================================================================
 *  Current equipped cosmetics for a set of account ids, joined LIVE.
 *
 *  TWO SEMANTICS USE THIS ONE JOIN. Identity surfaces such as history lists
 *  and map cards show what a player wears now. Game-detail surfaces prefer the
 *  match-time snapshot stored on each player summary, then use this join only
 *  for legacy documents that predate those fields.
 *
 *  WHY IT IS ONE MODULE AND NOT THREE COPIES. It was two, and the third was
 *  missing, and that is exactly what the bug looked like from the outside: the
 *  history LIST (api/gameHistory.js) did the join and glowed correctly, while
 *  OPENING one of those rows (api/gameDetails.js, api/mod/gameDetails.js) did
 *  not and rendered every name plain — including your own. A fact with two
 *  implementations has a third call site waiting to forget it.
 *
 *  IT USED TO BE CALLED gameCosmetics.js AND THAT NAME WAS THE NEXT COPY
 *  WAITING TO HAPPEN. The community-maps grid renders a username on every tile
 *  and it rendered every one of them plain, because nothing in `api/map/*`
 *  would ever reach for a module named after games. The join is not a game
 *  fact; it is "given account ids, what are these people wearing". Same
 *  question the maps endpoints ask.
 *
 *  ObjectId.isValid FILTER, not a raw $in. These ids are plain STRINGS on the
 *  documents that reference them (`players.accountId` on a Game,
 *  `created_by` on a Map — that is how every caller compares them), bots and
 *  guests store null, and one malformed legacy value in a page of fifty rows
 *  would throw a CastError and take the whole request down with it.
 *
 *  FAILS TO AN EMPTY MAP. No cosmetics is what these pages rendered before any
 *  of this existed, and a decoration must never be able to 500 a history
 *  request, a moderation lookup or the maps grid.
 * ======================================================================== */

/** What a missing/unknown player resolves to. Frozen: it is handed out by
 *  reference to every caller that misses, and one of them mutating it would
 *  silently repaint somebody else's name. */
const NO_COSMETICS = Object.freeze({ nameGlow: null, markerSkin: null });

/**
 * THE join. One query, whatever the caller counted the ids from.
 *
 * @param {Iterable<string|null|undefined>} ids
 *   Account ids as they appear on the referencing document. Nulls, duplicates
 *   and malformed values are filtered here so no caller has to remember to.
 * @returns {Promise<Map<string, {nameGlow: string|null, markerSkin: string|null}>>}
 *   Keyed by id string. Absent = no account (bot/guest) or no cosmetics.
 */
export async function cosmeticsForUserIds(ids) {
  const wanted = new Set();
  for (const id of (ids || [])) {
    if (id && mongoose.Types.ObjectId.isValid(id)) wanted.add(String(id));
  }
  if (!wanted.size) return new Map();
  try {
    const users = await User.find({ _id: { $in: [...wanted] } })
      .select('_id cosmetics.equipped.nameGlow cosmetics.equipped.markerSkin')
      .lean()
      .maxTimeMS(2000);
    return new Map(users.map((u) => [u._id.toString(), {
      nameGlow: u.cosmetics?.equipped?.nameGlow || null,
      markerSkin: u.cosmetics?.equipped?.markerSkin || null,
    }]));
  } catch (e) {
    console.warn('[userCosmetics] lookup failed (non-critical):', e.message);
    return new Map();
  }
}

/**
 * @param {Array<{players?: Array<{accountId?: string|null}>}>} games
 *   One or more saved Game documents. Single-game callers pass `[game]`.
 * @returns {Promise<Map<string, {nameGlow: string|null, markerSkin: string|null}>>}
 *   Keyed by accountId string.
 */
export async function cosmeticsForGames(games) {
  const ids = [];
  for (const game of (games || [])) {
    for (const p of (game?.players || [])) ids.push(p.accountId);
  }
  return cosmeticsForUserIds(ids);
}

/**
 * A reader over the map above that never returns undefined.
 *
 * Callers spread the result straight into a roster entry (`...cosmeticsOf(id)`),
 * so a miss has to be a real object with both keys present — spreading
 * `undefined` is legal and silently emits NEITHER field, which is the exact
 * shape of "my glow works everywhere except here".
 */
export function cosmeticsReader(map) {
  return (accountId) => (accountId ? map.get(String(accountId)) : null) || NO_COSMETICS;
}

/**
 * Cosmetics shown on a saved game.
 *
 * New game documents freeze both equipped slots at match time. Older documents
 * have neither field, so they retain the previous behaviour and fall back to
 * the player's current equipment. `undefined` means "legacy field absent";
 * `null` is a real snapshot meaning the player had that slot unequipped.
 */
export function cosmeticsForSavedPlayer(player, currentCosmetics = NO_COSMETICS) {
  const current = currentCosmetics || NO_COSMETICS;
  return {
    nameGlow: player?.nameGlow !== undefined
      ? (player.nameGlow ?? null)
      : (current.nameGlow ?? null),
    markerSkin: player?.markerSkin !== undefined
      ? (player.markerSkin ?? null)
      : (current.markerSkin ?? null),
  };
}
