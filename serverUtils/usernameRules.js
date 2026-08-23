import User, { USERNAME_COLLATION } from '../models/User.js';
import { isForumStable, isForumReserved, FORUM_STABLE_MESSAGE, FORUM_RESERVED_MESSAGE } from './forumUsername.js';
import { Filter } from 'bad-words';

const filter = new Filter();

// ONE bound for every surface that CHOOSES a name — signup and rename alike
// (owner ruling 2026-08-23: "3-20 constant everywhere"). Existing accounts are
// unaffected: nothing re-validates a stored name, so the handful of 21-30
// character names from the old bound keep working; their owners simply cannot
// pick a new name longer than 20. Mirrors: components/auth/loginApi.js
// USERNAME_MAX, mobile/src/shared/utils/username.ts USERNAME_MAX_LENGTH.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

/**
 * ONE validator chain for every surface that claims a username: api/setName.js,
 * api/submitNameChange.js, api/checkUsername.js and api/emailVerify.js. The two
 * older endpoints used to carry this chain as two hand-kept copies.
 *
 * Returns null when the name is acceptable, otherwise { key, message }:
 *  - `message` is the EXACT sentence the older endpoints returned before the
 *    extraction. Their clients render it verbatim, so it must not drift.
 *  - `key` is the locale key the email-login flow translates client-side.
 *
 * Deliberately does NOT trim: submitNameChange trims before validating and
 * setName does not, and both behaviours are preserved at the call sites.
 */
export function validateUsernameFormat(username) {
  if (typeof username !== 'string' || username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { key: 'usernameLengthError', message: `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters` };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { key: 'usernameCharsError', message: 'Username must contain only letters, numbers, and underscores' };
  }
  // Forum-stable only: Discourse rewrites underscore prefixes/suffixes/runs,
  // which lets two different WG names collide on the forum
  if (!isForumStable(username)) {
    return { key: 'usernameForumUnstable', message: FORUM_STABLE_MESSAGE };
  }
  if (isForumReserved(username)) {
    return { key: 'usernameReserved', message: FORUM_RESERVED_MESSAGE };
  }
  if (filter.isProfane(username)) {
    return { key: 'usernameProfane', message: 'Inappropriate content' };
  }
  return null;
}

/**
 * Case-insensitive uniqueness through the collation index (O(log n), never a
 * regex scan). `excludeUserId` lets a rename ignore the caller's own row.
 */
export async function isUsernameTaken(username, { excludeUserId = null } = {}) {
  const query = { username };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query).select('_id').collation(USERNAME_COLLATION).lean();
  return !!existing;
}
