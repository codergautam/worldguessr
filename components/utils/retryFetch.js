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

  async fetchWithRetry(url, options = {}, retryKey = url) {
    const attempts = this.retryAttempts.get(retryKey) || 0;
    
    console.log(`[RetryFetch] Attempting ${retryKey} (attempt ${attempts + 1}/${this.maxRetries + 1})`);
    
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Success! Reset retry count
      this.retryAttempts.delete(retryKey);
      console.log(`[RetryFetch] Success for ${retryKey}`);
      
      return response;
      
    } catch (error) {
      console.warn(`[RetryFetch] Error for ${retryKey}:`, error.message);
      
      // Check if we should retry
      if (attempts < this.maxRetries && this.shouldRetry(error)) {
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempts), 
          this.maxDelay
        );
        
        console.log(`[RetryFetch] Retrying ${retryKey} in ${delay}ms...`);
        this.retryAttempts.set(retryKey, attempts + 1);
        
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(this.fetchWithRetry(url, options, retryKey));
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
export async function retryFetch(url, options = {}, retryKey = url) {
  return retryManager.fetchWithRetry(url, options, retryKey);
}