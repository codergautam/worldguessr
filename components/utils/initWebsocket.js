import { toast } from "react-toastify";

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
  
  console.log(`[WS ${attemptId}] Initializing WebSocket connection to ${url} (timeout: ${timeoutMs}ms, retries: ${numberOfRetries})`);
  
  var promise = new Promise((resolve, reject) => {
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
          var websocket = new WebSocket(url);
          
          websocket.onopen = function (event) {
              console.log(`[WS ${attemptId}] WebSocket opened successfully`);
              if(hasReturned) {
                  console.warn(`[WS ${attemptId}] Connection opened but already returned, closing`);
                  websocket.close();
              } else {
                  hasReturned = true;
                  clearTimeout(timeoutId);
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
          if(hasReturned) {
              console.log(`[WS ${attemptId}] Reject called but already returned (reason: ${reason})`);
              return;
          }
          hasReturned = true;
          clearTimeout(timeoutId);
          
          console.log(`[WS ${attemptId}] Connection failed (reason: ${reason}), retries remaining: ${numberOfRetries}`);
          
          if(numberOfRetries <= 0) {
              console.error(`[WS ${attemptId}] No more retries, rejecting promise`);
              reject(new Error(`WebSocket connection failed: ${reason}`));
          } else if(!window.dontReconnect) {
              console.info(`[WS ${attemptId}] Retrying connection in 5 seconds (${numberOfRetries - 1} retries remaining)`);
              setTimeout(() => {
                  initWebsocket(url, null, timeoutMs, numberOfRetries-1).then(resolve, reject);
              }, 5000);
          } else {
              console.log(`[WS ${attemptId}] Reconnection disabled by window.dontReconnect flag`);
              reject(new Error(`WebSocket connection failed and reconnection disabled: ${reason}`));
          }
      }
  });
  return promise;
};