// Forwards runtime errors to Google Analytics as `exception` events.
// Captures three sources in a single install:
//   1. window.error        — uncaught thrown errors
//   2. unhandledrejection  — rejected promises with no .catch
//   3. console.error       — library/app code that logs errors instead of throwing
//
// Call `installErrorTracking()` once at app boot (from pages/_app.js).
// The returned function tears everything down.

const IGNORED = [
  'ResizeObserver loop',
  'net::ERR_',
  'CORS',
  'Script error',
  'Load failed',
];

const DEDUP_WINDOW_MS = 5000;

function shouldIgnore(msg) {
  return !msg || IGNORED.some((e) => msg.includes(e));
}

function formatStack(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const msg = err.message || String(err);
  const stack = err.stack ? ` | ${err.stack.split('\n').slice(0, 4).join(' | ')}` : '';
  return `${msg}${stack}`;
}

export default function installErrorTracking() {
  if (typeof window === 'undefined') return () => {};
  if (window.__errorTrackingInstalled) return () => {};
  window.__errorTrackingInstalled = true;

  const recentlySent = new Map(); // description -> timestamp

  const reportToGA = (description, extra = {}) => {
    if (!description || shouldIgnore(description)) return;
    const truncated = String(description).slice(0, 500);
    const now = Date.now();
    const last = recentlySent.get(truncated);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    recentlySent.set(truncated, now);
    if (recentlySent.size > 100) {
      const cutoff = now - DEDUP_WINDOW_MS;
      for (const [k, t] of recentlySent) {
        if (t < cutoff) recentlySent.delete(k);
      }
    }
    try {
      window.gtag?.('event', 'exception', {
        description: truncated,
        fatal: false,
        page_path: window.location?.pathname,
        ...extra,
      });
    } catch (_) { /* never throw from error handler */ }
  };

  const handleError = (event) => {
    const desc = event.error ? formatStack(event.error) : event.message;
    reportToGA(desc, {
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error_type: 'window.error',
    });
  };

  const handleRejection = (event) => {
    const reason = event.reason;
    const desc = reason instanceof Error
      ? formatStack(reason)
      : (reason?.message || String(reason || 'Unhandled promise rejection'));
    reportToGA(desc, { error_type: 'unhandledrejection' });
  };

  const origConsoleError = console.error;
  const patchedConsoleError = function (...args) {
    try {
      const desc = args
        .map((a) => {
          if (a instanceof Error) return formatStack(a);
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch (_) { return String(a); }
        })
        .join(' ');
      reportToGA(desc, { error_type: 'console.error' });
    } catch (_) { /* never throw from error handler */ }
    return origConsoleError.apply(this, args);
  };
  console.error = patchedConsoleError;

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
    if (console.error === patchedConsoleError) {
      console.error = origConsoleError;
    }
    window.__errorTrackingInstalled = false;
  };
}
