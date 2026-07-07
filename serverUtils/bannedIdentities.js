import BannedIdentity from '../models/BannedIdentity.js';

/**
 * Helpers for the BannedIdentity blocklist (see models/BannedIdentity.js).
 *
 * Used by the moderation endpoints to ADD an identity (permanent ban, or deletion
 * of a perm-banned user) and REMOVE it (unban), and by api/googleAuth.js to CHECK
 * an identity at account-creation time. All writes are best-effort: a blocklist
 * failure must never abort the ban/delete that triggered it.
 */

/** Google emails are case-insensitive — store/compare lowercased so they match. */
export function normalizeEmail(email) {
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

/**
 * Record an account's identifiers on the blocklist. Upserts by sourceAccountId so
 * re-banning never duplicates. No-op (returns false) if the account has neither an
 * email nor an appleId — there'd be nothing to match a future signup against.
 * Never throws.
 */
export async function addBannedIdentity({ user, type, reason = null, publicNote = null, moderator = null }) {
  try {
    if (!user?._id) return false;
    const email = normalizeEmail(user.email);
    const appleId = user.appleId || null;
    const crazyGamesId = user.crazyGamesId || null;
    if (!email && !appleId && !crazyGamesId) return false; // nothing to block on

    await BannedIdentity.updateOne(
      { sourceAccountId: user._id.toString() },
      {
        $set: {
          email,
          appleId,
          crazyGamesId,
          username: user.username || null,
          type,
          reason,
          publicNote,
          moderator: moderator
            ? { accountId: moderator._id?.toString() || null, username: moderator.username || null }
            : { accountId: null, username: null },
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    return true;
  } catch (e) {
    console.error('[bannedIdentities] addBannedIdentity failed (non-critical):', e?.message || e);
    return false;
  }
}

/** Remove an account's blocklist entry (called on unban). Never throws. */
export async function removeBannedIdentity(accountId) {
  try {
    if (!accountId) return;
    await BannedIdentity.deleteOne({ sourceAccountId: accountId.toString() });
  } catch (e) {
    console.error('[bannedIdentities] removeBannedIdentity failed (non-critical):', e?.message || e);
  }
}

/**
 * The user-facing refusal message for a blocked re-signup — ONE source of truth
 * for every auth surface (googleAuth google/apple paths, crazyAuth). Always
 * leads with the fixed explanation: a bare mod-written note like "Cheating in
 * ranked duels" shown alone on a fresh signup gives the user zero context for
 * why account creation failed. The mod's public note is appended as the reason.
 */
export function bannedIdentityMessage(blocked) {
  const base = 'This account was permanently banned and a new account cannot be created with this identity.';
  return blocked?.publicNote ? `${base} Reason: ${blocked.publicNote}` : base;
}

/**
 * Return the matching blocklist doc if either identifier is blocked, else null.
 * Used at account-creation time to refuse a fresh account for a banned identity.
 * Fail-open: on a read error we return null (don't lock out legitimate signups
 * because of a transient DB hiccup) — the error is logged.
 */
export async function findBannedIdentity({ email, appleId, crazyGamesId }) {
  const or = [];
  const e = normalizeEmail(email);
  if (e) or.push({ email: e });
  if (appleId) or.push({ appleId });
  if (crazyGamesId) or.push({ crazyGamesId });
  if (!or.length) return null;
  try {
    return await BannedIdentity.findOne({ $or: or }).lean();
  } catch (err) {
    console.error('[bannedIdentities] findBannedIdentity failed (fail-open):', err?.message || err);
    return null;
  }
}
