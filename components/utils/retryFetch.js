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