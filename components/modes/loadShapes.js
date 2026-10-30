// public/modes/shapes.json (built by scripts/modes/buildShapes.mjs): one SVG
// path per country for the Shapes quiz. Fetched once per page, like
// utils/loadBorders.js does for the polygons.

import { asset } from '../../lib/basePath';

let shapesPromise = null;
let shapesCache = null;

export function loadShapes() {
  if (shapesCache) return Promise.resolve(shapesCache);
  if (!shapesPromise) {
    shapesPromise = fetch(asset('/modes/shapes.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`shapes.json ${res.status}`);
        return res.json();
      })
      .then((data) => {
        shapesCache = data;
        return data;
      })
      .catch((err) => {
        shapesPromise = null;
        throw err;
      });
  }
  return shapesPromise;
}

// Synchronous read for render: null until loadShapes() has resolved.
export function shapeFor(code) {
  return shapesCache?.shapes?.[code] ?? null;
}
