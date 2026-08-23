import mongoose from 'mongoose';

// Short-lived per-email mutexes for the email-code login
// (serverUtils/loginLocks.js). ONE row per key, held until `until`:
//   send:<email>    the resend cooldown, taken atomically BEFORE a code is
//                   created, so N parallel /api/emailLogin requests for one
//                   address mail exactly one code (the read-then-check limits
//                   in emailLogin are serialised behind it);
//   signup:<email>  single-flight account creation in emailVerify, so two
//                   live codes verified at the same instant cannot insert two
//                   accounts (an upsert alone is not race-safe without a
//                   unique index, and User.email cannot get one retroactively).
// The unique index on `key` is what makes acquisition atomic; correctness
// never depends on the TTL index, which only sweeps stale rows an hour after
// they lapse.
const emailLoginLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  until: { type: Date, required: true },
});

emailLoginLockSchema.index({ until: 1 }, { expireAfterSeconds: 60 * 60 });

export default mongoose.models.EmailLoginLock ||
  mongoose.model('EmailLoginLock', emailLoginLockSchema);
