// The forum (Discourse) rewrites usernames it considers invalid: leading and
// trailing underscores are stripped and runs of underscores collapse to one
// (UserNameSuggester.fix_username). Since WG names are [A-Za-z0-9_], that is
// the ONLY way two different WG names can silently become the same forum name
// (e.g. "Revolt_" -> "Revolt", colliding with the real player "ReVolt").
//
// Prevention (2026-07-22): new names must be "forum-stable" — normalization
// changes nothing but case — and must not collide with the normalized form of
// a grandfathered old name (User.usernameNorm, set only on the ~31k accounts
// whose names Discourse rewrites; see scripts/backfillUsernameNorm.js).

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
