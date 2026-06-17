import mongoose from 'mongoose';

/**
 * BannedIdentity — blocklist of identifiers (email / Apple ID) belonging to
 * accounts that were PERMANENTLY banned, or deleted WHILE permanently banned.
 * Checked at account-creation time (api/googleAuth.js) so a blocked person can't
 * sign in again with the same Google/Apple identity to get a fresh account and
 * evade the ban.
 *
 * Scope is deliberate — ONLY permanent bans (and deletions of perm-banned users)
 * land here. Temporary bans and forced name changes never do (those are
 * recoverable / not identity-level). Entries are removed on unban so reversing a
 * permanent ban restores sign-up access.
 */
const bannedIdentitySchema = new mongoose.Schema({
  // The original account this entry came from. Upsert key → one doc per account,
  // so re-banning the same account never duplicates, and unban can delete by it.
  sourceAccountId: { type: String, required: true, unique: true },

  // Identifiers used for matching at signup. At least one is set; all are matched
  // with $or so any login provider the original account used is covered (Google
  // email, Apple ID, CrazyGames ID). Email is normalised (lowercased).
  email: { type: String, default: null },
  appleId: { type: String, default: null },
  crazyGamesId: { type: String, default: null },

  // Last known username, for moderator reference only.
  username: { type: String, default: null },

  // Why this identity is blocked.
  type: { type: String, enum: ['ban_permanent', 'user_deleted'], required: true },
  reason: { type: String, default: null },     // INTERNAL reason (never shown to user)
  publicNote: { type: String, default: null }, // Shown to the user when their signup is refused

  moderator: {
    accountId: { type: String, default: null },
    username: { type: String, default: null },
  },

  createdAt: { type: Date, default: Date.now },
});

// sourceAccountId is already unique-indexed by `unique: true` above.
bannedIdentitySchema.index({ email: 1 });
bannedIdentitySchema.index({ appleId: 1 });
bannedIdentitySchema.index({ crazyGamesId: 1 });

const BannedIdentity =
  mongoose.models.BannedIdentity || mongoose.model('BannedIdentity', bannedIdentitySchema);

export default BannedIdentity;
