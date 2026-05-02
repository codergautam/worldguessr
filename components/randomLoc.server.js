// Server-side version of getRandomPointInCountry. Loads the borders JSON via
// a static import so node code (cron, ws) doesn't depend on the lazy
// fetch-based browser loader. The polygon-walking logic mirrors the browser
// randomLoc.js — keep the two in sync if you change the algorithm.

import borders from '../public/genBorders.json' with { type: "json" };

export function getRandomPointInCountry(countryCode = true) {
  const features = borders.features.filter(feature => countryCode === true ? true : feature.properties.code == countryCode);
  if (features.length === 0) return null;
  const allPolygons = [];

  function getArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon[0].length - 1; i < polygon[0].length; j = i++) {
      const xi = polygon[0][i][0], yi = polygon[0][i][1];
      const xj = polygon[0][j][0], yj = polygon[0][j][1];
      area += (xi * yj) - (xj * yi);
    }
    return Math.abs(area / 2);
  }

  features.forEach(feature => {
    if (feature.geometry.type === 'Polygon') {
      allPolygons.push({ polygon: feature.geometry.coordinates, area: getArea(feature.geometry.coordinates), countryCode: feature.properties.code });
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach(polygon => {
        allPolygons.push({ polygon, area: getArea(polygon), countryCode: feature.properties.code });
      });
    }
  });

  function getBoundingBox(polygon) {
    let minX, maxX, minY, maxY;
    polygon[0].forEach(([x, y]) => {
      minX = (minX === undefined) ? x : Math.min(minX, x);
      maxX = (maxX === undefined) ? x : Math.max(maxX, x);
      minY = (minY === undefined) ? y : Math.min(minY, y);
      maxY = (maxY === undefined) ? y : Math.max(maxY, y);
    });
    return { minX, maxX, minY, maxY };
  }

  function isPointInPolygon(point, vs) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = vs[0].length - 1; i < vs[0].length; j = i++) {
      const xi = vs[0][i][0], yi = vs[0][i][1];
      const xj = vs[0][j][0], yj = vs[0][j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function getRandomWeightedPolygon(polygons) {
    const westernEuropeCountries = ["AT", "BE", "FR", "DE", "IE", "NL", "CH", "GB"];
    const totalArea = polygons.reduce((total, { area, countryCode }) => {
      const weight = westernEuropeCountries.includes(countryCode) ? 2 : 1;
      return total + (area * weight);
    }, 0);
    let random = Math.random() * totalArea;
    for (const { polygon, area, countryCode } of polygons) {
      const weight = westernEuropeCountries.includes(countryCode) ? 2 : 1;
      if (random < area * weight) return polygon;
      random -= area * weight;
    }
    return polygons[polygons.length - 1].polygon;
  }

  while (true) {
    const randomPolygon = getRandomWeightedPolygon(allPolygons);
    const bbox = getBoundingBox(randomPolygon);
    const randomPoint = [
      Math.random() * (bbox.maxX - bbox.minX) + bbox.minX,
      Math.random() * (bbox.maxY - bbox.minY) + bbox.minY
    ];
    if (isPointInPolygon(randomPoint, randomPolygon)) {
      return randomPoint.reverse();
    }
  }
}
