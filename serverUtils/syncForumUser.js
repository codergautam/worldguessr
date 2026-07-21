import crypto from 'crypto';

const FORUM_URL = 'https://worldguessr.forum';

// Single source of truth for how a WG user appears on the forum — used by
// both the SSO login endpoint (api/discourseSSO) and the push sync below,
// so the two paths can never drift apart.
export function forumIdentityFor(user) {
  const email =
    user.email ||
    (user.crazyGamesId
      ? `cg-${user.crazyGamesId}@sso.worldguessr.com`
      : `u-${user._id}@sso.worldguessr.com`);
  // Neutral placeholder until they set a name — never let Discourse derive a
  // public username from the email prefix (real-name leak for Google users)
  const username = user.username || 'player_' + String(user._id).slice(-6);
  // name mirrors username — WG has no separate "full name" concept, and
  // without this Discourse freezes an auto-derived name at account creation
  const identity = { external_id: String(user._id), email, username, name: username };
  // Google profile picture becomes the forum avatar (Gravatar is the
  // fallback for everyone else — most Gmail users have no Gravatar)
  if (user.avatarUrl) identity.avatar_url = user.avatarUrl;
  return identity;
}

// Instantly push the user's current identity to the forum (DiscourseConnect
// sync_sso) so renames apply without waiting for their next forum login.
// UPDATE-ONLY: players who never visited the forum are skipped — sync_sso
// would otherwise CREATE accounts, ghosting the whole playerbase into the
// forum. Users without forum accounts need no sync anyway: SSO login always
// pulls live identity, so their name arrives correct whenever they first visit.
// Fire-and-forget: the forum being down must never affect the game — errors
// are logged and swallowed. Requires DISCOURSE_CONNECT_SECRET and
// DISCOURSE_API_KEY in the api server env; silently no-ops if either is
// missing (e.g. local dev).
export function syncForumUser(user) {
  const secret = process.env.DISCOURSE_CONNECT_SECRET;
  const apiKey = process.env.DISCOURSE_API_KEY;
  if (!secret || !apiKey || !user?._id) return;

  const headers = { 'Api-Key': apiKey, 'Api-Username': 'system' };
  const fields = forumIdentityFor(user);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  (async () => {
    // Only sync users who already exist on the forum (404 = never logged in)
    const check = await fetch(
      `${FORUM_URL}/u/by-external/${encodeURIComponent(fields.external_id)}.json`,
      { headers, signal: controller.signal },
    );
    if (check.status === 404) return;
    if (!check.ok) {
      console.error('syncForumUser: existence check responded', check.status);
      return;
    }

    const payload = new URLSearchParams(fields);
    if (user.staff) payload.set('moderator', 'true');
    const b64 = Buffer.from(payload.toString()).toString('base64');
    const sig = crypto.createHmac('sha256', secret).update(b64).digest('hex');

    const push = await fetch(`${FORUM_URL}/admin/users/sync_sso`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ sso: b64, sig }).toString(),
      signal: controller.signal,
    });
    if (!push.ok) console.error('syncForumUser: forum responded', push.status);
  })()
    .catch((e) => console.error('syncForumUser:', e.message))
    .finally(() => clearTimeout(timer));
}
