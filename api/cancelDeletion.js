import User from '../models/User.js';
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import cachegoose from 'recachegoose';

/**
 * Cancel a pending self-service account deletion (restore the account) within the
 * 30-day grace period. Fast: clears the two deletion fields and busts the auth
 * caches. Paired with api/deleteAccount.js; the secret is never rotated, so the
 * returning user authenticates normally and reaches this endpoint.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { secret } = req.body;
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ error: 'Invalid' });
  }

  try {
    const user = await User.findOne({ secret });
    if (!user) {
      // Row already purged (grace window elapsed) — nothing to restore.
      return res.status(410).json({ error: 'This account has already been deleted.' });
    }

    // Not pending — idempotent success (e.g. double-tap, or already restored).
    if (!user.scheduledDeletionAt) {
      return res.status(200).json({ success: true, alreadyActive: true });
    }

    // Past the window: the cron purge is imminent / in-flight. Don't resurrect a
    // half-purged account.
    if (new Date(user.scheduledDeletionAt) <= new Date()) {
      return res.status(409).json({ error: 'This account has already been deleted.' });
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { scheduledDeletionAt: null, deletionRequestedAt: null } },
    );

    syncedClearCache(`userAuth_${secret}`);
    if (user.crazyGamesId) {
      cachegoose.clearCache(`crazyAuth_${user.crazyGamesId}`, () => {});
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[cancelDeletion] error:', error?.message || error);
    return res.status(500).json({ error: 'An error occurred while cancelling account deletion' });
  }
}
