import mongoose from 'mongoose';

// Per-UTC-day count of wins by the same player over the same opponent. Feeds the
// anti-farm decay: repeated wins against one victim inside a day yield sharply
// diminishing ELO and stamps.
//
// This is DELIBERATELY NOT an in-memory Map. ws restarts often enough that the
// entire gamestate-restore machinery exists to cover it — an in-memory anti-farm
// control would hand a farming pair a full counter reset on every deploy, which
// is the exact thing the control is supposed to prevent. Persisted, a restart
// costs nothing.
//
// The pair is directional: (winner, loser) and (loser, winner) are separate rows,
// because farming is asymmetric — A beating B ten times is the abuse, and B's
// occasional win back should not erase A's counter.
const pairWinsSchema = new mongoose.Schema({
  // UTC day key, e.g. '2026-08-06'. String, not Date, so the unique key is an
  // exact-match on a stable value and cannot drift with timezone handling.
  utcDay: {
    type: String,
    required: true,
  },
  winner: {
    type: String,
    required: true,
  },
  loser: {
    type: String,
    required: true,
  },
  wins: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
  },
});

// The upsert target: one row per (day, winner, loser).
pairWinsSchema.index({ utcDay: 1, winner: 1, loser: 1 }, { unique: true });
// TTL — rows are only meaningful for their own UTC day, so they self-clean.
pairWinsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PairWins = mongoose.models.PairWins || mongoose.model('PairWins', pairWinsSchema);

export default PairWins;
