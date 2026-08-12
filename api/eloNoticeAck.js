import User from '../models/User.js';
import { syncedClearCache } from '../serverUtils/cacheBus.js';

/**
 * Acknowledge the Season 1 first-login notice.
 *
 * DISPLAY-ONLY ACK. The XP and Stamps grants are applied EAGERLY by the
 * migration script (ELO_MIGRATION_PLAN section 9, revised 2026-08-05), so this
 * endpoint grants NOTHING and needs no transaction. It stamps one date and
 * flushes one cache key. Do not be tempted to move a grant in here later: the
 * whole point of eager grants is that xpRank re-sorts once, cleanly, instead of
 * churning for weeks as dormant accounts trickle back.
 *
 * IDEMPOTENT. Acking an account that has already acked is a success, not an
 * error: the web modal retries on the next login when a request fails, and both
 * clients fire this on dismiss with no coordination between them. The first
 * stamp wins (the conditional filter below preserves it) so the date stays a
 * true "first seen", and every call still flushes the auth cache.
 *
 * THE CACHE FLUSH IS NOT OPTIONAL. api/googleAuth.js caches the secret lookup
 * for 120 seconds under `userAuth_<secret>`. Without this flush, a user who
 * dismisses the modal and reloads within that window re-reads a document whose
 * eloNoticeSeenAt is still null and gets the modal a second time.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token } = req.body || {};

  // Prevent NoSQL injection - the secret must be a string, never an object.
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ message: 'Invalid token' });
  }

  try {
    const user = await User.findOne({ secret: token }).select('_id eloNoticeSeenAt').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.eloNoticeSeenAt) {
      // Conditional filter, not a blind $set: two dismisses racing (web tab and
      // phone) must not overwrite the first timestamp with the second. `null`
      // in a Mongo filter also matches a MISSING field, which is what every
      // document predating the schema addition looks like.
      await User.updateOne(
        { _id: user._id, eloNoticeSeenAt: null },
        { $set: { eloNoticeSeenAt: new Date() } }
      );
    }

    // Always, including the already-acked path: cheap, and it closes the window
    // where a cache entry populated just before the stamp keeps serving the
    // notice for up to two minutes.
    syncedClearCache(`userAuth_${token}`);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error acknowledging elo notice:', error);
    return res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
}
