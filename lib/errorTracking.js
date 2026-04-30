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
  // Leaflet fires this when a pane/marker is accessed during an in-flight
  // animation after its container has been removed — most commonly when the
  // daily-results modal remounts the map. The UI keeps working, but the
  // uncaught throw triggers Next.js's dev error overlay.
  '_leaflet_pos',
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
  if (window.__errorTrackingInstalled) {
    return typeof window.__errorTrackingCleanup === 'function'
      ? window.__errorTrackingCleanup
      : () => {};
  }
  window.__errorTrackingInstalled = true;

  const recentlySent = new Map(); // description -> timestamp

  // Ring buffer of preceding error descriptions. React's componentDidCatch logs
  // the real error+stack just before Next.js prints the "client-side exception"
  // notice — by retaining the recent ones we can attach the actual cause to the
  // fatal-crash webhook instead of a useless doc-link message.
  const errorBuffer = [];
  const ERROR_BUFFER_MAX = 5;

  const reportToGA = (description, extra = {}) => {
    if (!description || shouldIgnore(description)) return;
    const truncated = String(description).slice(0, 1000);
    const nextjsError = truncated.toLowerCase().includes("nextjs.org");
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

    // Buffer non-fatal entries so we can attach them to the next fatal report.
    if (!nextjsError) {
      errorBuffer.push({ description: truncated, extra, ts: now });
      if (errorBuffer.length > ERROR_BUFFER_MAX) errorBuffer.shift();
    }

    try {
      window.gtag?.('event', 'exception', {
        description: truncated,
        fatal: nextjsError,
        page_path: window.location?.pathname,
        ...extra,
      });

      if (nextjsError) {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || 'unknown';
        const url = window.location?.href || window.location?.pathname || '/';
        const preceding = errorBuffer.length
          ? errorBuffer
              .map((e, i) => `**[${i + 1}] (${e.extra?.error_type || 'unknown'})**\n\`\`\`\n${e.description.slice(0, 700)}\n\`\`\``)
              .join('\n')
          : '_(no preceding error captured — buffer was empty)_';

        const content = [
          `🚨 **Client-side fatal crash**`,
          `**Page:** ${url}`,
          `**UA:** \`${ua.slice(0, 180)}\``,
          `**Next.js notice:** ${truncated}`,
          ``,
          `**Preceding errors (most recent last):**`,
          preceding,
        ].join('\n').slice(0, 1950); // Discord content cap is 2000

        fetch("https://discord.com/api/webhooks/1499270118285246494/F_5u5IOnxGkvC02NcjcIq3Nmj0zJdxkArY-KA71cgtYL1ZFqICWmwAC9pakAgd6HEBkf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content })
        });

        errorBuffer.length = 0; // Reset so future crashes don't drag stale context
      }
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

  // Capture-phase suppressor: runs before Next.js's dev error overlay (which
  // subscribes in the bubble phase) so matching errors are silently swallowed
  // instead of taking over the screen. Production builds have no overlay, so
  // this is effectively a no-op there — the errors still don't reach GA
  // because `reportToGA` filters on the same IGNORED list.
  const suppressIfIgnored = (event) => {
    const msg = event?.error?.message || event?.reason?.message || event?.message
      || (typeof event?.reason === 'string' ? event.reason : '');
    if (shouldIgnore(msg)) {
      event.stopImmediatePropagation();
      event.preventDefault?.();
    }
  };
  window.addEventListener('error', suppressIfIgnored, true);
  window.addEventListener('unhandledrejection', suppressIfIgnored, true);

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  const cleanup = () => {
    window.removeEventListener('error', suppressIfIgnored, true);
    window.removeEventListener('unhandledrejection', suppressIfIgnored, true);
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
    if (console.error === patchedConsoleError) {
      console.error = origConsoleError;
    }
    // Only clear install flags if we still own them — guards against a stale
    // cleanup running after a fresh install has re-occupied the global slot.
    if (window.__errorTrackingCleanup === cleanup) {
      window.__errorTrackingInstalled = false;
      delete window.__errorTrackingCleanup;
    }
  };

  // Expose for React unmount / HMR teardown.
  window.__errorTrackingCleanup = cleanup;
  return cleanup;
}
