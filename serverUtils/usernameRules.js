import fs from 'fs';
import User, { USERNAME_COLLATION } from '../models/User.js';
import { isForumStable, isForumReserved, FORUM_STABLE_MESSAGE, FORUM_RESERVED_MESSAGE } from './forumUsername.js';
import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, pattern } from 'obscenity';

const dataset = new DataSet().addAll(englishDataset);
const TOKEN_WORDS = new Set();
const DIGIT_WORDS = new Set();
let section = 'substring';
fs.readFileSync('serverUtils/usernameDenylist.txt', 'utf8').split(/\r?\n/).forEach((line) => {
  if (line.startsWith('#')) {
    if (/token/i.test(line)) section = 'token';
    else if (/substring/i.test(line)) section = 'substring';
    return;
  }
  const w = line.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return;
  if (/\d/.test(w)) {
    DIGIT_WORDS.add(w);
  } else if (section === 'token') {
    TOKEN_WORDS.add(w);
  } else {
    dataset.addPhrase((p) => p.addPattern(pattern(Object.assign([w], { raw: [w] }))));
  }
});
const matcher = new RegExpMatcher({ ...dataset.build(), ...englishRecommendedTransformers });

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };
const deleet = (s) => s.replace(/[013456789]/g, (d) => LEET[d]);

function isNameProfane(username) {
  const lower = username.toLowerCase();
  for (const v of [lower, deleet(lower)]) {
    const flat = v.replace(/_/g, '');
    if (TOKEN_WORDS.has(flat)) return true;
    for (const token of v.split(/[^a-z]+/)) {
      if (TOKEN_WORDS.has(token)) return true;
    }
    for (const w of DIGIT_WORDS) {
      if (flat.includes(w)) return true;
    }
    if (matcher.hasMatch(flat)) return true;
  }
  return false;
}

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
  if (isNameProfane(username)) {
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
