import mongoose from 'mongoose';

// One emailed 6-digit login code (api/emailLogin.js issues, api/emailVerify.js
// redeems). The code itself is never stored: codeHash is sha256(loginId:code)
// from serverUtils/loginCodeHash.js, so a leaked collection logs nobody in.
// Rows are single-use: `consumed` (+ consumedAt) flips on the first successful
// verify. A newer send does NOT touch older rows: several codes for one
// address can be live at once (each with its own attempt cap; the hourly
// per-email cap bounds the count), so a resend never kills the code already
// in the inbox and a third party cannot invalidate the owner's. clientId (the
// client session's nonce, serverUtils/loginSession.js) + consumedAt let
// emailLogin / emailVerify recognise a replay from the SAME session of a send
// or verify that already went through. Rows vanish at expiresAt through the
// TTL index; emailLogin counts the last hour's rows for its per-email limit.
const emailLoginCodeSchema = new mongoose.Schema({
  loginId: { type: String, required: true, unique: true },
  // Normalized (trimmed, lowercased): the key for rate limits and supersession.
  email: { type: String, required: true },
  // The exact spelling the matched account is stored under (legacy rows can be
  // mixed case), or the normalized address for a brand-new account. emailVerify
  // looks the user up by THIS, so a send that found an account can never verify
  // into a duplicate.
  matchEmail: { type: String, required: true },
  codeHash: { type: String, required: true },
  ip: { type: String, default: null },
  // The client session nonce the code was requested with (null = none sent).
  clientId: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  consumed: { type: Boolean, default: false },
  consumedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

emailLoginCodeSchema.index({ email: 1, createdAt: -1 });
emailLoginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.EmailLoginCode ||
  mongoose.model('EmailLoginCode', emailLoginCodeSchema);
