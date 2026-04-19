// Locale-aware alias for /map. Renders the exact same page as /map so that
// users arriving from /en keep their locale in the URL. Navigation back to
// the home page resolves to /en (no redirect bounce through /).
export { default } from '../map.js';
