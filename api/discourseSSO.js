import crypto from 'crypto';
import User from '../models/User.js';
import { forumIdentityFor } from '../serverUtils/syncForumUser.js';

// DiscourseConnect (SSO) for worldguessr.forum.
// The forum redirects users to /discourse-sso (Next.js page), which reads
// wg_secret from localStorage and POSTs { secret, sso, sig } here. We verify
// Discourse's HMAC, identify the user by secret, and hand back a signed
// redirect URL that logs them into the forum — no separate forum accounts.
// Shared secret must match the forum's discourse_connect_secret setting.
const CONNECT_SECRET = process.env.DISCOURSE_CONNECT_SECRET;
const FORUM_URL = 'https://worldguessr.forum';

function hmac(payload) {
  return crypto.createHmac('sha256', CONNECT_SECRET).update(payload).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  if (!CONNECT_SECRET) {
    return res.status(500).json({ message: 'SSO not configured' });
  }

  const { secret, sso, sig } = req.body;
  if (!secret || typeof secret !== 'string' || !sso || typeof sso !== 'string' || !sig || typeof sig !== 'string') {
    return res.status(400).json({ message: 'Invalid request' });
  }

  // Verify the payload really came from the forum (timing-safe compare)
  const expected = hmac(sso);
  if (expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) {
    return res.status(403).json({ message: 'Invalid signature' });
  }

  const inbound = new URLSearchParams(Buffer.from(sso, 'base64').toString());
  const nonce = inbound.get('nonce');
  const returnUrl = inbound.get('return_sso_url');
  // Signature already guarantees authenticity; this guards against forum misconfig
  if (!nonce || !returnUrl || !returnUrl.startsWith(FORUM_URL + '/')) {
    return res.status(400).json({ message: 'Invalid SSO payload' });
  }

  try {
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    // Game bans extend to the forum (same check as setName.js)
    const isBanned = user.banned &&
      (user.banType === 'permanent' ||
        (user.banType === 'temporary' && user.banExpiresAt && new Date(user.banExpiresAt) > new Date()));
    if (isBanned) {
      return res.status(403).json({ message: 'Account is banned' });
    }

    // Identity mapping shared with the push sync (serverUtils/syncForumUser.js):
    // synthetic emails for CrazyGames accounts, neutral placeholder username
    // until a name is set (never leak the email prefix as a public username)
    const outbound = new URLSearchParams({
      nonce,
      ...forumIdentityFor(user),
      require_activation: 'false',
      suppress_welcome_message: 'true',
    });
    if (user.staff) outbound.set('moderator', 'true');

    const b64 = Buffer.from(outbound.toString()).toString('base64');
    return res.json({
      success: true,
      redirect: `${returnUrl}?sso=${encodeURIComponent(b64)}&sig=${hmac(b64)}`,
    });
  } catch (error) {
    console.error('discourseSSO error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
