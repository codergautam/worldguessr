// The forum (Discourse) rewrites usernames it considers invalid: leading and
// trailing underscores are stripped and runs of underscores collapse to one
// (UserNameSuggester.fix_username). Since WG names are [A-Za-z0-9_], that is
// the ONLY way two different WG names can silently become the same forum name
// (e.g. "Revolt_" -> "Revolt", colliding with the real player "ReVolt").
//
// Policy (2026-07-22): forum name collisions are acceptable — the second
// arrival just gets a digit suffix, and identity flows through the account id
// (custom.wg_id deep links), never the name. What we DO block on new claims:
// - forum-unstable names (rewritten SILENTLY to a different-looking name —
//   that's confusing in a way a visible suffix isn't)
// - the forum's reserved usernames (suffixed AND impersonation-bait in-game)
// Existing holders of either kind are grandfathered.

export function forumNormalize(username) {
  return String(username)
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');
}

export function isForumStable(username) {
  return forumNormalize(username) === String(username).toLowerCase();
}

export const FORUM_STABLE_MESSAGE =
  'Username cannot start or end with an underscore, or contain consecutive underscores';

// Mirrors the forum's reserved_usernames setting
const FORUM_RESERVED = new Set([
  'admin', 'moderator', 'administrator', 'mod', 'sys', 'system', 'you',
  'name', 'username', 'user', 'nickname', 'discourse', 'discourseorg',
  'discourseforum', 'all', 'here', 'community', 'info', 'support',
]);

export function isForumReserved(username) {
  return FORUM_RESERVED.has(String(username).toLowerCase());
}

export const FORUM_RESERVED_MESSAGE = 'This username is reserved';
