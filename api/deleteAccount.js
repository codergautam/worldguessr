import User from '../models/User.js';
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import cachegoose from 'recachegoose';

// Grace window before the purge cron runs. If you change this, also update the
// `days:` value passed to deleteAccountConfirmBody in components/moderationView.js
// and mobile/src/components/account/ModerationTab.tsx — the UI number is not
// derived from this constant.
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Self-service account deletion request (web + mobile).
 *
 * FAST by design: only flips two fields on the User row and busts the auth
 * caches, then returns. The heavy multi-collection purge runs LATER — after the
 * 30-day grace period — in cron.js (serverUtils/purgeUserCascade.js). Doing the
 * cascade in-request is exactly why api/mod/deleteUser.js used to time out.
 *
 * The client logs the user out after this resolves. They can restore the account
 * by logging back in within 30 days (api/cancelDeletion.js).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { secret } = req.body;
  // Prevent NoSQL injection — secret must be a string.
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ error: 'Invalid' });
  }

  try {
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Idempotent: if a deletion is already scheduled, echo the existing date.
    if (user.scheduledDeletionAt) {
      return res.status(200).json({
        success: true,
        scheduledDeletionAt: user.scheduledDeletionAt,
        alreadyScheduled: true,
      });
    }

    const scheduledDeletionAt = new Date(Date.now() + GRACE_PERIOD_MS);
    await User.updateOne(
      { _id: user._id },
      { $set: { scheduledDeletionAt, deletionRequestedAt: new Date() } },
    );

    // Bust the 120s auth caches so the next login immediately sees pendingDeletion
    // (and so the account is treated as pending without a stale-cache window).
    syncedClearCache(`userAuth_${secret}`);
    if (user.crazyGamesId) {
      cachegoose.clearCache(`crazyAuth_${user.crazyGamesId}`, () => {});
    }

    return res.status(200).json({ success: true, scheduledDeletionAt });
  } catch (error) {
    console.error('[deleteAccount] error:', error?.message || error);
    return res.status(500).json({ error: 'An error occurred while scheduling account deletion' });
  }
}
