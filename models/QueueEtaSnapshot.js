import mongoose from 'mongoose';

// Singleton doc holding the ws server's ranked-queue wait samples, so a restart
// does not blank the queue ETA (see ws/queueEta.js).
//
// The estimator is in-memory; this preserves its rolling hour across deploys.
//
// SHAPE IS OPAQUE ON PURPOSE. `data` is whatever queueEta.snapshotStore()
// produced, versioned inside itself (`v`), and restoreStore() is required to
// tolerate null/garbage/partial input by returning an empty store. So a schema
// change never needs a migration here and a corrupt doc degrades to "no
// estimate yet" rather than taking the ws boot down.
//
// Written every 5 minutes. The rolling model intentionally tolerates losing the
// last few minutes during a deploy instead of changing the server shutdown path.
const queueEtaSnapshotSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

queueEtaSnapshotSchema.index({ key: 1 }, { unique: true });

const QueueEtaSnapshot = mongoose.models.QueueEtaSnapshot
  || mongoose.model('QueueEtaSnapshot', queueEtaSnapshotSchema);

export default QueueEtaSnapshot;
