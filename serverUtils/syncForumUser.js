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
  return { external_id: String(user._id), email, username };
}

// Instantly push the user's current identity to the forum (DiscourseConnect
// sync_sso) so renames apply without waiting for their next forum login.
// Fire-and-forget: the forum being down must never affect the game — errors
// are logged and swallowed. Requires DISCOURSE_CONNECT_SECRET and
// DISCOURSE_API_KEY in the api server env; silently no-ops if either is
// missing (e.g. local dev).
export function syncForumUser(user) {
  const secret = process.env.DISCOURSE_CONNECT_SECRET;
  const apiKey = process.env.DISCOURSE_API_KEY;
  if (!secret || !apiKey || !user?._id) return;

  const payload = new URLSearchParams(forumIdentityFor(user));
  if (user.staff) payload.set('moderator', 'true');
  const b64 = Buffer.from(payload.toString()).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(b64).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  fetch(`${FORUM_URL}/admin/users/sync_sso`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Api-Key': apiKey,
      'Api-Username': 'system',
    },
    body: new URLSearchParams({ sso: b64, sig }).toString(),
    signal: controller.signal,
  })
    .then((r) => {
      if (!r.ok) console.error('syncForumUser: forum responded', r.status);
    })
    .catch((e) => console.error('syncForumUser:', e.message))
    .finally(() => clearTimeout(timer));
}
