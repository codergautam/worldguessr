import { toast } from "react-toastify";

// Global connection manager to prevent multiple concurrent attempts
const connectionManager = {
  activeAttempts: new Map(),
  
  cancel(url) {
    if (this.activeAttempts.has(url)) {
      const { websocket, cleanup } = this.activeAttempts.get(url);
      console.log(`[WS Manager] Cancelling previous connection attempt to ${url}`);
      cleanup();
      if (websocket && websocket.readyState === WebSocket.CONNECTING) {
        websocket.close();
      }
      this.activeAttempts.delete(url);
    }
  },
  
  register(url, websocket, cleanup) {
    this.activeAttempts.set(url, { websocket, cleanup });
  },
  
  complete(url) {
    this.activeAttempts.delete(url);
  }
};

/**
 * inits a websocket by a given url, returned promise resolves with initialized websocket, rejects after failure/timeout.
 *
 * @param url the websocket url to init
 * @param existingWebsocket if passed and this passed websocket is already open, this existingWebsocket is resolved, no additional websocket is opened
 * @param timeoutMs the timeout in milliseconds for opening the websocket
 * @param numberOfRetries the number of times initializing the socket should be retried, if not specified or 0, no retries are made
 *        and a failure/timeout causes rejection of the returned promise
 * @return {Promise}
 */
export default function initWebsocket(url, existingWebsocket, timeoutMs, numberOfRetries) {
  timeoutMs = timeoutMs ? timeoutMs : 1500;
  numberOfRetries = numberOfRetries ? numberOfRetries : 0;
  var hasReturned = false;
  var timeoutId = null;
  var attemptId = Math.random().toString(36).substr(2, 9);
  
  // Cancel any previous connection attempts to the same URL
  connectionManager.cancel(url);
  
  console.log(`[WS ${attemptId}] Initializing WebSocket connection to ${url} (timeout: ${timeoutMs}ms, retries: ${numberOfRetries})`);
  
  var promise = new Promise((resolve, reject) => {
    try {
      var websocket = null;
      
      // Cleanup function to clear timeouts and close websocket
      const cleanup = () => {
          if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
          }
          if (websocket && websocket.readyState === WebSocket.CONNECTING) {
              websocket.close();
          }
      };
      
      timeoutId = setTimeout(function () {
          if(!hasReturned) {
              console.warn(`[WS ${attemptId}] Opening websocket timed out after ${timeoutMs}ms: ${url}`);
              rejectInternal('timeout');
          }
      }, timeoutMs);
      
      if (!existingWebsocket || existingWebsocket.readyState != existingWebsocket.OPEN) {
          if (existingWebsocket) {
              console.log(`[WS ${attemptId}] Closing existing websocket (state: ${existingWebsocket.readyState})`);
              existingWebsocket.close();
          }
          
          console.log(`[WS ${attemptId}] Creating new WebSocket connection`);
          try {
              websocket = new WebSocket(url);
          } catch (wsError) {
              console.error(`[WS ${attemptId}] Failed to create WebSocket:`, wsError);
              rejectInternal('creation_error');
              return;
          }
          
          // Register this attempt with the connection manager
          connectionManager.register(url, websocket, cleanup);
          
          websocket.onopen = function (event) {
              console.log(`[WS ${attemptId}] WebSocket opened successfully`);
              if(hasReturned) {
                  console.warn(`[WS ${attemptId}] Connection opened but already returned, closing`);
                  websocket.close();
              } else {
                  hasReturned = true;
                  clearTimeout(timeoutId);
                  connectionManager.complete(url);
                  console.info(`[WS ${attemptId}] WebSocket connection established: ${url}`);
                  resolve(websocket);
              }
          };
          
          websocket.onclose = function (event) {
              console.warn(`[WS ${attemptId}] WebSocket closed (code: ${event.code}, reason: ${event.reason}, wasClean: ${event.wasClean})`);
              if(!hasReturned) {
                  rejectInternal('close');
              }
          };
          
          websocket.onerror = function (event) {
              console.error(`[WS ${attemptId}] WebSocket error occurred:`, event);
              if(!hasReturned) {
                  rejectInternal('error');
              }
          };
      } else {
          console.log(`[WS ${attemptId}] Reusing existing open websocket`);
          hasReturned = true;
          clearTimeout(timeoutId);
          resolve(existingWebsocket);
      }

      function rejectInternal(reason) {
          try {
              if(hasReturned) {
                  console.log(`[WS ${attemptId}] Reject called but already returned (reason: ${reason})`);
                  return;
              }
              hasReturned = true;
              cleanup();
              connectionManager.complete(url);
              
              console.log(`[WS ${attemptId}] Connection failed (reason: ${reason}), retries remaining: ${numberOfRetries}`);
              
              if(numberOfRetries <= 0) {
                  console.error(`[WS ${attemptId}] No more retries, connection failed gracefully`);
                  reject(new Error(`WebSocket connection failed: ${reason}`));
              } else if(!window.dontReconnect) {
                  console.info(`[WS ${attemptId}] Retrying connection in 5 seconds (${numberOfRetries - 1} retries remaining)`);
                  setTimeout(() => {
                      initWebsocket(url, null, timeoutMs, numberOfRetries-1)
                          .then(resolve)
                          .catch(reject);
                  }, 5000);
              } else {
                  console.log(`[WS ${attemptId}] Reconnection disabled by window.dontReconnect flag`);
                  reject(new Error(`WebSocket connection failed and reconnection disabled: ${reason}`));
              }
          } catch (error) {
              console.error(`[WS ${attemptId}] Error in rejectInternal:`, error);
              reject(new Error(`WebSocket connection failed: ${reason}`));
          }
      }
    } catch (error) {
        console.error(`[WS ${attemptId}] Unexpected error in initWebsocket:`, error);
        connectionManager.complete(url);
        reject(new Error(`WebSocket initialization failed: ${error.message}`));
    }
  });
  
  // Add global error handler to the promise to prevent unhandled rejections
  // But only if retries are enabled (numberOfRetries > 0)
  if (numberOfRetries > 0) {
    promise.catch(error => {
        console.error(`[WS] Unhandled WebSocket error for ${url}:`, error);
        // Don't rethrow here - just log it
    });
  }
  
  return promise;
};