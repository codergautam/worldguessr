import mongoose from 'mongoose';

// Per-domain decisions for the email-code signup, on top of the static lists
// in serverUtils/emailDomains.js. Lets the allowlist grow without a deploy:
// the users aggregation script, the dataset seeder, the auto-allow heuristics
// (serverUtils/emailDomainPolicy.js) and hand edits all write here, and the
// auth servers read it through a short in-memory cache.
//
//   status  'allow' | 'block'
//   source  where the rule came from: 'users' | 'nces' | 'gias' | 'hipo' |
//           'manual' | 'auto-token'
//   count   how many accounts / hits backed the rule (informational)
const emailDomainRuleSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: { type: String, enum: ['allow', 'block'], required: true },
  source: { type: String, default: 'manual' },
  count: { type: Number, default: 0 },
  note: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.EmailDomainRule ||
  mongoose.model('EmailDomainRule', emailDomainRuleSchema);
