/**
 * Per-IP throttle for endpoints that have no account to key on (the email
 * login trio). Each caller gets its OWN Map, so buckets never share:
 * utils/rateLimit.js keys every endpoint on the same `ratelimit_<ip>`, which
 * is how a profile browser could exhaust somebody's login budget
 * (api/stampShop.js documents the trap). Shape copied from api/submitFeedback.js.
 *
 * Counts are per process: server.js (3001) and authServer.js (3004) each keep
 * their own. The limits that actually bound abuse (per email, per hour) live
 * in Mongo and are global.
 */
export function clientIp(req) {
  // Behind Cloudflare, cf-connecting-ip is set from the real connection and
  // overwrites anything the client sent. X-Forwarded-For is client-writable
  // (proxies APPEND to it), so it is only the fallback. Either way these
  // per-IP limits are a soft brake: the hard ones are per code row (attempt
  // cap, single use) and per email (hourly cap), which no header can move.
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

export function createIpLimiter({ max, windowMs }) {
  const hits = new Map(); // ip -> number[] (recent timestamps)
  return function limited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      }
    }
    return recent.length > max;
  };
}
