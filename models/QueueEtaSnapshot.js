import mongoose from 'mongoose';

// Singleton doc holding the ws server's ranked-queue wait samples, so a restart
// does not blank the queue ETA (see ws/queueEta.js).
//
// WHY THIS EXISTS AT ALL. The estimator is in-memory and the dense low bands
// refill within a minute of a restart, so persistence looks optional. It is
// not: the sparse high-rating bands are the only ones where an estimate is
// interesting, and at production volume they take DAYS to refill. Without this
// doc, every deploy would silently return the top of the ladder to "no idea".
//
// SHAPE IS OPAQUE ON PURPOSE. `data` is whatever queueEta.snapshotStore()
// produced, versioned inside itself (`v`), and restoreStore() is required to
// tolerate null/garbage/partial input by returning an empty store. So a schema
// change never needs a migration here and a corrupt doc degrades to "no
// estimate yet" rather than taking the ws boot down.
//
// Written every 5 minutes, NOT on shutdown: ws.js's stop() is synchronous and
// SIGTERM calls process.exit(0) on the very next line, so an async write there
// could never land. Losing up to 5 minutes of samples on a crash is nothing.
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
