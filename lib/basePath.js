const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const LOCALES = ['en', 'es', 'fr', 'de', 'ru'];

// For static assets: asset('/icon.ico') → '/subpath/icon.ico'
export function asset(path) {
  return basePath + path;
}

// For window.location navigation: navigate('/banned') → '/subpath/banned'
export function navigate(path) {
  return basePath + path;
}

// Strip basePath from pathname for comparisons
// stripBase('/subpath/map/foo') → '/map/foo'
export function stripBase(pathname) {
  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}

// Returns the current locale prefix ('fr', 'en', …) derived from the URL,
// or '' if there is none. Client-side only — returns '' on the server.
export function getCurrentLocale() {
  if (typeof window === 'undefined') return '';
  const first = stripBase(window.location.pathname).split('/').filter(Boolean)[0];
  return LOCALES.includes(first) ? first : '';
}

// Build a locale-aware path. localePath('/map') on `/fr` → '/fr/map'; on `/`
// it stays '/map'. Always passes through `navigate()` so basePath is applied.
export function localePath(path) {
  const locale = getCurrentLocale();
  if (!locale) return navigate(path);
  // Avoid '/fr/' if caller passed '/'
  if (path === '/' || path === '') return navigate('/' + locale);
  return navigate('/' + locale + (path.startsWith('/') ? path : '/' + path));
}

export { basePath };
