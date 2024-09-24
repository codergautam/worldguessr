// middleware to add a limit on endpoints. limit is the limit of requests within the windowMs
export default function ratelimitMiddleware(handler, limit, windowMs) {
  const ipLimitTracker = new Map();

  const defaultData = {
    requests: 0,
    windowStart: Date.now(),
  };

  return async (req, res) => {
    // note: this ip can be spoofed when the site is not behind cloudflare
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    
    let ipLimit = undefined;
    if (!ipLimitTracker.has(ip)) {
      ipLimitTracker.set(ip, defaultData);
      ipLimit = defaultData;
    } else {
      ipLimit = ipLimitTracker.get(ip)
    }
    
    const timeSinceWindow = Date.now() - ipLimit.windowStart
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