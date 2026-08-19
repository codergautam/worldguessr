// GameDistribution's root-scope service worker (sw_1.5.18.js on
// html5.gamedistribution.com) intercepts every fetch() the game frame makes and
// — verified in production Aug 2026, reproduced by every player incl. incognito —
// resolves them as constructed empty 200s (Response.type "default", zero-length
// body). Every JSON body reads as "" ("Unexpected end of JSON input"), which
// killed the API, genBorders.json, and with them singleplayer and the maps view.
// XMLHttpRequest traffic passes through the same worker intact, so on the GD
// build all fetch() traffic is routed over an XHR transport instead.
//
// Scope: installed from _app.js only when NEXT_PUBLIC_GAMEDISTRIBUTION is set.
// WebSockets are unaffected by service workers and stay untouched.

// Statuses the Response constructor refuses to pair with a body.
const NULL_BODY_STATUSES = [101, 204, 205, 304];

function parseXhrHeaders(raw) {
  const headers = new Headers();
  (raw || '').trim().split(/[\r\n]+/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx <= 0) return;
    try {
      headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    } catch (e) { /* ignore names XHR exposes but Headers rejects */ }
  });
  return headers;
}

function xhrFetch(input, init = {}) {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request;
  const url = isRequest ? input.url : String(input);

  const method = (init.method || (isRequest && input.method) || 'GET').toUpperCase();
  const signal = init.signal || (isRequest ? input.signal : undefined);

  const send = (body) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let onAbort = null;
    const settle = (fn, value) => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      fn(value);
    };

    xhr.open(method, url, true);
    xhr.responseType = 'arraybuffer';

    const headers = init.headers ? new Headers(init.headers) : (isRequest ? input.headers : null);
    if (headers) {
      headers.forEach((value, name) => {
        try { xhr.setRequestHeader(name, value); } catch (e) { /* forbidden header */ }
      });
    }
    if (init.credentials === 'include' || (isRequest && input.credentials === 'include')) {
      xhr.withCredentials = true;
    }

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }
      onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.onload = () => {
      const status = xhr.status;
      const respBody = (NULL_BODY_STATUSES.includes(status) || method === 'HEAD') ? null : xhr.response;
      let response;
      try {
        response = new Response(respBody, {
          status,
          statusText: xhr.statusText,
          headers: parseXhrHeaders(xhr.getAllResponseHeaders()),
        });
      } catch (e) {
        settle(reject, new TypeError('Failed to fetch'));
        return;
      }
      // Response.url is read-only and empty on constructed responses; callers
      // (and error logs) expect the real one.
      try {
        Object.defineProperty(response, 'url', { value: xhr.responseURL || url });
      } catch (e) { /* cosmetic only */ }
      settle(resolve, response);
    };
    xhr.onerror = () => settle(reject, new TypeError('Failed to fetch'));
    xhr.ontimeout = () => settle(reject, new TypeError('Failed to fetch'));
    xhr.onabort = () => settle(reject, new DOMException('The operation was aborted.', 'AbortError'));

    xhr.send(body === undefined || body === null ? null : body);
  });

  // Body: our call sites always pass init.body, but a Request input with a
  // body must be drained before XHR can send it.
  if (init.body === undefined && isRequest && method !== 'GET' && method !== 'HEAD') {
    return input.clone().arrayBuffer().then((buf) => send(buf.byteLength ? buf : null));
  }
  return send(init.body);
}

export default function installGdFetchShim() {
  if (typeof window === 'undefined' || typeof window.XMLHttpRequest === 'undefined') return;
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (input, init) => {
    const url = (typeof Request !== 'undefined' && input instanceof Request) ? input.url : String(input);
    // Non-network schemes never touch the service worker; keep them native.
    if (nativeFetch && /^(blob:|data:)/i.test(url)) return nativeFetch(input, init);
    return xhrFetch(input, init);
  };
}
