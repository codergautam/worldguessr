// Lazy loader for the country borders GeoJSON. Used by findCountryLocal (post-guess
// country lookup fallback) and randomLoc (random-spot picker on the client).
// Fetched on first call from /genBorders.json (served from public/) so the
// ~450 KB JSON stays out of the initial page bundle. Browser-only — server
// callers (cron, ws/Game) use randomLoc.server.js, which static-imports the
// same JSON via Node's native JSON loader.
import { asset } from '@/lib/basePath';

let borders = null;
let loadPromise = null;

export function loadBorders() {
  if (borders) return Promise.resolve(borders);
  if (!loadPromise) {
    loadPromise = fetch(asset('/genBorders.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`genBorders.json fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        borders = data;
        return data;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

// Synchronous access for callers that want to opportunistically read without
// waiting (returns null if not yet loaded).
export function getBordersIfLoaded() {
  return borders;
}
