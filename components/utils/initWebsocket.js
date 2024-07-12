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
  var promise = new Promise((resolve, reject) => {
      setTimeout(function () {
          if(!hasReturned) {
              console.info('opening websocket timed out: ' + url);
              rejectInternal();
          }
      }, timeoutMs);
      if (!existingWebsocket || existingWebsocket.readyState != existingWebsocket.OPEN) {
          if (existingWebsocket) {
              existingWebsocket.close();
          }
          var websocket = new WebSocket(url);
          websocket.onopen = function () {
              if(hasReturned) {
                  websocket.close();
              } else {
                  console.info('websocket to opened! url: ' + url);
                  resolve(websocket);
              }
          };
          websocket.onclose = function () {
              console.info('websocket closed! url: ' + url);
              rejectInternal();
          };
          websocket.onerror = function () {
              console.info('websocket error! url: ' + url);
              rejectInternal();
          };
      } else {
          resolve(existingWebsocket);
      }

      function rejectInternal() {
          if(numberOfRetries <= 0) {
              reject();
          } else if(!hasReturned) {
              hasReturned = true;
              console.info('retrying connection to websocket! url: ' + url + ', remaining retries: ' + (numberOfRetries-1));
              setTimeout(() => {
              initWebsocket(url, null, timeoutMs, numberOfRetries-1).then(resolve, reject);
              }, 5000);
            }
      }
  });
  promise.then(function () {hasReturned = true;}, function () {hasReturned = true;});
  return promise;
};