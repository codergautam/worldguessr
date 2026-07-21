import crypto from 'crypto';
import User from '../models/User.js';
import ForumBridgeCode from '../models/ForumBridgeCode.js';

// Session bridge for forum logins from embedded contexts (CrazyGames).
// Browsers partition iframe localStorage, so the wg_secret inside the CG
// embed is invisible to top-level worldguessr.com — and forum SSO needs it
// there. The in-game Forum button mints a one-time code here, opens
// /forum-bridge?code=... in a real tab, and that page exchanges the code
// to plant wg_secret in top-level storage before heading to the forum.
const CODE_TTL_MS = 2 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { action, secret, code } = req.body;

  try {
    if (action === 'create') {
      if (!secret || typeof secret !== 'string') {
        return res.status(400).json({ message: 'Invalid secret' });
      }
      const user = await User.findOne({ secret });
      if (!user) {
        return res.status(401).json({ message: 'Not logged in' });
      }
      const newCode = crypto.randomBytes(24).toString('base64url');
      await ForumBridgeCode.create({ code: newCode, secret });
      return res.json({ success: true, code: newCode });
    }

    if (action === 'exchange') {
      if (!code || typeof code !== 'string' || code.length > 64) {
        return res.status(400).json({ message: 'Invalid code' });
      }
      // findOneAndDelete = single-use; TTL index cleans up unexchanged codes
      const doc = await ForumBridgeCode.findOneAndDelete({ code });
      if (!doc || Date.now() - doc.createdAt.getTime() > CODE_TTL_MS) {
        return res.status(410).json({ message: 'Code expired' });
      }
      return res.json({ success: true, secret: doc.secret });
    }

    return res.status(400).json({ message: 'Invalid action' });
  } catch (error) {
    console.error('forumBridge error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
