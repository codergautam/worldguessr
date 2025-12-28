// In-memory rate limit store
const rateLimitStore = new Map();

// Cleanup interval to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const maxAge = 300000; // 5 minutes

  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Run cleanup every minute

/**
 * Rate limiting middleware
 * @param {Object} options - Rate limit configuration
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param {number} options.max - Maximum requests per window (default: 10)
 * @param {string} options.message - Error message when rate limit exceeded
 * @returns {Function} Middleware function
 */
export function rateLimit(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    max = 10, // 10 requests per window
    message = 'Too many requests, please try again later'
  } = options;

  return (req, res) => {
    // Get client IP address (handle proxies and forwarded requests)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               'unknown';

    const now = Date.now();
    const key = `ratelimit_${ip}`;

    // Get or create rate limit record for this IP
    let record = rateLimitStore.get(key);

    if (!record || now - record.resetTime > windowMs) {
      // Create new record or reset if window expired
      record = { count: 1, resetTime: now };
      rateLimitStore.set(key, record);
      return true; // Allow request
    }

    // Increment count
    record.count++;
    rateLimitStore.set(key, record);

    // Check if limit exceeded
    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        message,
        retryAfter: retryAfter
      });
      return false; // Block request
    }

    return true; // Allow request
  };
}

/**
 * Get current rate limit status for debugging
 * @param {string} ip - IP address to check
 * @returns {Object} Rate limit status
 */
export function getRateLimitStatus(ip) {
  const key = `ratelimit_${ip}`;
  const record = rateLimitStore.get(key);

  if (!record) {
    return { requests: 0, resetTime: null };
  }

  return {
    requests: record.count,
    resetTime: new Date(record.resetTime),
    expiresAt: new Date(record.resetTime + 60000)
  };
}

/**
 * Clear rate limit for an IP (for testing or admin purposes)
 * @param {string} ip - IP address to clear
 */
export function clearRateLimit(ip) {
  const key = `ratelimit_${ip}`;
  rateLimitStore.delete(key);
}
