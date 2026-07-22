import crypto from 'crypto';
import { getLeague } from '../components/utils/leagues.js';

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
  // fallback for everyone else — most Gmail users have no Gravatar).
  // Google's picture claim is a 96px thumbnail (=s96-c) — request 512px so
  // Discourse has real resolution to work with at every avatar size.
  if (user.avatarUrl) {
    identity.avatar_url = user.avatarUrl.replace(/=s\d+(-c)?$/, '=s512-c');
  }
  // WG flag setting rides along as a forum custom field (rendered next to
  // usernames by the forum theme). Always sent — '' when unset/opted-out —
  // so removing the flag in-game also clears it on the forum.
  identity['custom.wg_flag'] = user.countryCode || '';
  // League color (from the WG league the user's current elo falls in) so the
  // forum theme can tint the username to match the game. Updates on login and
  // whenever the league changes (see setElo). Always sent.
  identity['custom.wg_league_color'] = getLeague(user.elo || 0).color;
  return identity;
}

// Anonymize the user's forum account when their WG account is permanently
// deleted (after the 30-day grace period — never during it). Uses Discourse's
// built-in anonymizer: username becomes anonNNN, email/name/avatar/profile
// scrubbed, posts preserved so threads don't break. Covers BOTH deletion
// paths automatically because purgeUserCascade is the shared choke point for
// mod hard-deletes and self-service purges. Idempotent: anonymization removes
// the SSO record, so a re-run finds nothing (404) and no-ops. Errors are
// logged loudly but never fail the purge — needs DISCOURSE_API_KEY in the
// env of whichever process runs the cascade (cron + api server).
export async function anonymizeForumUser(externalId) {
  const apiKey = process.env.DISCOURSE_API_KEY;
  if (!apiKey || !externalId) return;
  const headers = { 'Api-Key': apiKey, 'Api-Username': 'system' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const check = await fetch(
      `${FORUM_URL}/u/by-external/${encodeURIComponent(externalId)}.json`,
      { headers, signal: controller.signal },
    );
    if (check.status === 404) return; // never had a forum account (or already anonymized)
    if (!check.ok) {
      console.error('[forum] anonymize lookup failed:', check.status, 'for', externalId);
      return;
    }
    const forumId = (await check.json())?.user?.id;
    if (!forumId) return;

    const resp = await fetch(`${FORUM_URL}/admin/users/${forumId}/anonymize.json`, {
      method: 'PUT',
      headers,
      signal: controller.signal,
    });
    if (resp.ok) {
      console.log(`[forum] anonymized forum user ${forumId} (deleted WG account ${externalId})`);
    } else {
      console.error('[forum] anonymize failed:', resp.status, 'forum user', forumId);
    }
  } catch (e) {
    console.error('[forum] anonymizeForumUser:', e.message);
  } finally {
    clearTimeout(timer);
  }
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
