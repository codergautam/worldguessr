import EmailLoginLock from '../models/EmailLoginLock.js';

/**
 * Atomic per-key mutex on top of models/EmailLoginLock.js (unique `key`).
 *
 * acquire(key, ms): true if THIS caller now holds the key until now+ms.
 *   1. renew a lapsed row: findOneAndUpdate({ key, until <= now }) is one
 *      atomic document update, so of N racers only one matches;
 *   2. else create the row: the unique index lets exactly one insert win,
 *      the others get E11000 and return false.
 * release(key): drop the row early (a finished signup). Optional: every lock
 * lapses on its own at `until`.
 *
 * Never throws on contention; real DB errors propagate (the route guard in
 * authServer.js / server.js answers 500).
 */
export async function acquireLoginLock(key, ms) {
  const now = new Date();
  const until = new Date(now.getTime() + ms);
  const renewed = await EmailLoginLock.findOneAndUpdate(
    { key, until: { $lte: now } },
    { $set: { until } },
  ).select('_id').lean();
  if (renewed) return true;
  try {
    await EmailLoginLock.create({ key, until });
    return true;
  } catch (e) {
    if (e?.code === 11000) return false; // somebody holds it
    throw e;
  }
}

export async function releaseLoginLock(key) {
  await EmailLoginLock.deleteOne({ key }).catch(() => {});
}
