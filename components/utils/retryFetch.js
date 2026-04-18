/**
 * Robust fetch with exponential backoff retry mechanism
 * Similar to websocket reconnection logic
 */

class RetryManager {
  constructor() {
    this.retryAttempts = new Map(); // Track attempts per endpoint
    this.maxRetries = 5;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds
  }

  async fetchWithRetry(url, options = {}, retryKey = url, retryOptions = {}) {
    // Cap "Infinity" to a reasonable max to prevent truly infinite loops (Bug 2 fix)
    const MAX_SAFE_RETRIES = 1000;
    
    const {
      timeout = 10000,           // Default 10 second timeout
      maxRetries = this.maxRetries,  // Default 5 retries
      baseDelay = this.baseDelay,
      maxDelay = this.maxDelay
    } = retryOptions;

    // Ensure maxRetries is finite to prevent infinite loops
    const effectiveMaxRetries = maxRetries === Infinity ? MAX_SAFE_RETRIES : maxRetries;

    const attempts = this.retryAttempts.get(retryKey) || 0;
    const maxRetriesDisplay = maxRetries === Infinity ? '∞' : effectiveMaxRetries + 1;

    console.log(`[RetryFetch] Attempting ${retryKey} (attempt ${attempts + 1}/${maxRetriesDisplay})`);

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId); // Clear on success

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Success! Reset retry count
      this.retryAttempts.delete(retryKey);
      console.log(`[RetryFetch] Success for ${retryKey}`);

      return response;

    } catch (error) {
      clearTimeout(timeoutId); // Bug 1 fix: Clear timeout on error too
      
      console.warn(`[RetryFetch] Error for ${retryKey}:`, error.message);

      // Check if we should retry (using effectiveMaxRetries to ensure finite comparison)
      if (attempts < effectiveMaxRetries && this.shouldRetry(error)) {
        const delay = Math.min(
          baseDelay * Math.pow(2, attempts),
          maxDelay
        );

        console.log(`[RetryFetch] Retrying ${retryKey} in ${delay}ms...`);
        this.retryAttempts.set(retryKey, attempts + 1);

        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this.fetchWithRetry(url, options, retryKey, retryOptions)
              .then(resolve)
              .catch(reject);
          }, delay);
        });
      }

      // Max retries reached or non-retryable error
      console.error(`[RetryFetch] Failed ${retryKey} after ${attempts + 1} attempts:`, error.message);
      this.retryAttempts.delete(retryKey);
      throw error;
    }
  }
  
  shouldRetry(error) {
    // Retry on network errors, timeouts, and 5xx status codes
    return (
      error.name === 'AbortError' || // Timeout
      error.name === 'TypeError' || // Network error
      (error.message && error.message.includes('fetch')) || // Fetch errors
      (error.message && error.message.includes('HTTP 5')) // 5xx errors
    );
  }
  
  resetRetries(retryKey) {
    this.retryAttempts.delete(retryKey);
    console.log(`[RetryFetch] Reset retry count for ${retryKey}`);
  }
  
  getRetryCount(retryKey) {
    return this.retryAttempts.get(retryKey) || 0;
  }
}

// Global instance
const retryManager = new RetryManager();

export default retryManager;

// Convenience function for simple usage
export async function retryFetch(url, options = {}, retryKey = url, retryOptions = {}) {
  return retryManager.fetchWithRetry(url, options, retryKey, retryOptions);
}

/**
 * Try `primaryUrl` with a single quick attempt; on network error, timeout, or
 * 5xx, fall through to `fallbackUrl`. Used so that a down auth server doesn't
 * block users from logging in via the main API.
 *
 * 4xx responses are always returned as-is from both primary and fallback —
 * callers that read error JSON depend on this. Only 5xx and network errors
 * trigger fallback / retry.
 *
 * If `retryOptions` is provided, the fallback URL is retried with exponential
 * backoff on 5xx/network failures (timeout/maxRetries/baseDelay/maxDelay).
 * Otherwise the fallback is a single bare fetch. Pass `{}` to opt into the
 * default retry budget (5 retries, 10s timeout).
 */
export async function fetchWithFallback(primaryUrl, fallbackUrl, options = {}, retryKey = primaryUrl, retryOptions = null) {
  const runFallback = () => {
    if (!retryOptions) return fetch(fallbackUrl, options);
    return fetchRetryingOnServerError(fallbackUrl, options, retryKey + ':fallback', retryOptions);
  };

  if (!fallbackUrl || primaryUrl === fallbackUrl) {
    return runFallback();
  }

  const PRIMARY_TIMEOUT = 4000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PRIMARY_TIMEOUT);

  try {
    const response = await fetch(primaryUrl, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.status < 500) {
      return response;
    }
    console.warn(`[RetryFetch] Primary ${primaryUrl} returned ${response.status}, falling back to ${fallbackUrl}`);
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[RetryFetch] Primary ${primaryUrl} failed (${err.message}), falling back to ${fallbackUrl}`);
  }

  return runFallback();
}

// Like fetchWithRetry but returns 4xx responses as-is instead of throwing.
// Retries only on network errors, timeouts, and 5xx responses.
async function fetchRetryingOnServerError(url, options, retryKey, retryOptions) {
  const SAFE_MAX = 1000;
  const {
    timeout = 10000,
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 30000,
  } = retryOptions;
  const cap = maxRetries === Infinity ? SAFE_MAX : maxRetries;

  let attempt = 0;
  let lastErr;
  while (attempt <= cap) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.status < 500) return response;
      lastErr = new Error(`HTTP ${response.status}: ${response.statusText}`);
      if (attempt === cap) return response; // exhausted budget — surface the 5xx
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      if (attempt === cap) throw err;
    }
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    console.log(`[RetryFetch] ${retryKey} retrying in ${delay}ms (${lastErr.message})`);
    await new Promise(r => setTimeout(r, delay));
    attempt++;
  }
  throw lastErr;
}