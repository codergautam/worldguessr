import cachegoose from 'recachegoose';

// Comma-separated list of peer ports (on localhost) to notify on cache clear.
// Defaults to "3001,3004" so a shared .env between the API and auth processes
// works out of the box — each process posts to both, one of which is itself
// (a harmless no-op clear). Override with CACHE_PEER_PORTS to customize.
const PEER_PORTS = (process.env.CACHE_PEER_PORTS ?? '3001,3004')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Clear a cachegoose key locally AND fire-and-forget a webhook to each peer
 * process so their in-memory caches for the same key are invalidated too.
 *
 * Used for keys that the auth and API processes both cache (userAuth_*,
 * publicData_*). Without this, e.g. a ban cleared on the API process would
 * still read stale data from the auth process's 120s userAuth cache.
 *
 * The peer endpoint is gated by MAINTENANCE_SECRET (see registerCacheBusRoute).
 */
export function syncedClearCache(key) {
  cachegoose.clearCache(key, (err) => {
    if (err) console.error(`[cacheBus] local clear failed for ${key}:`, err.message);
  });

  const secret = process.env.MAINTENANCE_SECRET;
  if (!secret || PEER_PORTS.length === 0) return;

  for (const port of PEER_PORTS) {
    const url = `http://localhost:${port}/internal/clearCache/${secret}/${encodeURIComponent(key)}`;
    fetch(url, { method: 'POST' }).catch((err) => {
      console.warn(`[cacheBus] peer clear failed (${port}/${key}): ${err.message}`);
    });
  }
}

/**
 * Mount the receiving side of the cache bus on an Express app. Companion to
 * syncedClearCache — peers POST here to request a local cache invalidation.
 */
export function registerCacheBusRoute(app) {
  app.post('/internal/clearCache/:secret/:key', (req, res) => {
    if (!process.env.MAINTENANCE_SECRET || req.params.secret !== process.env.MAINTENANCE_SECRET) {
      return res.sendStatus(403);
    }
    const key = decodeURIComponent(req.params.key);
    cachegoose.clearCache(key, (err) => {
      if (err) console.error(`[cacheBus] remote clear failed for ${key}:`, err.message);
    });
    res.sendStatus(204);
  });
}
