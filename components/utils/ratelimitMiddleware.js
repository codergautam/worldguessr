import { registerStat } from '../../serverUtils/statRegistry.js';

// middleware to add a limit on endpoints. limit is the limit of requests within the windowMs
let instanceSeq = 0;
export default function ratelimitMiddleware(handler, limit, windowMs) {
  const ipLimitTracker = new Map();
  const instanceId = ++instanceSeq;
  registerStat(`components/utils/ratelimitMiddleware.ipLimitTracker#${instanceId}`, () => ipLimitTracker.size);

  // Prior version shared a single `defaultData` object across all IPs — every
  // new IP got the same reference, so when one IP's window advanced it
  // advanced for every IP. Fixed by per-IP record. Also sweep stale entries
  // every windowMs * 2 so the Map can't grow unbounded with unique IPs.
  const sweepEvery = Math.max(windowMs * 2, 60000);
  setInterval(() => {
    const cutoff = Date.now() - sweepEvery;
    for (const [ip, rec] of ipLimitTracker) {
      if (rec.windowStart < cutoff) ipLimitTracker.delete(ip);
    }
  }, sweepEvery).unref();

  return async (req, res) => {
    // note: this ip can be spoofed when the site is not behind cloudflare
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    let ipLimit = ipLimitTracker.get(ip);
    if (!ipLimit) {
      ipLimit = { requests: 0, windowStart: Date.now() };
      ipLimitTracker.set(ip, ipLimit);
    }

    const timeSinceWindow = Date.now() - ipLimit.windowStart;
    if (timeSinceWindow > windowMs) {
      ipLimit.requests = 0;
      ipLimit.windowStart = Date.now();
    }

    if (ipLimit.requests >= limit) {
      return res.status(429).send("Too Many Requests");
    }

    ipLimit.requests += 1;

    // await to support async handlers
    return await handler(req, res);
  };
}