// inspiration from https://github.com/tzhf/map-generator

import borders from '../../public/genBorders.json' with { type: "json" };

export function getRandomPointInCountry(countryCode=true) {
  const features = borders.features.filter(feature => countryCode === true ? true : feature.properties.code == countryCode);
  if(features.length === 0) return null;
  const allPolygons = [];

  // Function to calculate the area of a polygon
  function getArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon[0].length - 1; i < polygon[0].length; j = i++) {
      const xi = polygon[0][i][0], yi = polygon[0][i][1];
      const xj = polygon[0][j][0], yj = polygon[0][j][1];
      area += (xi * yj) - (xj * yi);
    }
    return Math.abs(area / 2);
  }

  // Extract all polygons from the features and calculate their areas
  features.forEach(feature => {
    if (feature.geometry.type === 'Polygon') {
      allPolygons.push({ polygon: feature.geometry.coordinates, area: getArea(feature.geometry.coordinates), countryCode: feature.properties.code });
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach(polygon => {
        allPolygons.push({ polygon, area: getArea(polygon), countryCode: feature.properties.code });
      });
    }
  });

  // Function to calculate the bounding box for a polygon
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

  // Function to check if a point is in the polygon
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

  function getRandomUnWeightedPolygon(polygons) {
    return polygons[Math.floor(Math.random() * polygons.length)].polygon;
  }

  // Function to select a random polygon with larger polygons having a higher chance of being selected
  function getRandomWeightedPolygon(polygons) {

    const westernEuropeCountries = [
      "AT", // Austria
      "BE", // Belgium
      "FR", // France
      "DE", // Germany
      "IE", // Ireland
      "NL", // Netherlands
      "CH", // Switzerland
      "GB"  // United Kingdom
    ];

    // western europe countries get 2x weight since they are a bit underrepresented for their significance
    // like with this default area based system it picks US/Russia so many times which is boring

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

  // Try to find a random point within the country's polygons
  while (true) {
    // Select a random polygon and its bounding box
    // const randomPolygon = countryCode===true ? getRandomUnWeightedPolygon(allPolygons) : getRandomWeightedPolygon(allPolygons);
    const randomPolygon = getRandomWeightedPolygon(allPolygons);
    const bbox = getBoundingBox(randomPolygon);

    // Generate a random point within the bounding box
    const randomPoint = [
      Math.random() * (bbox.maxX - bbox.minX) + bbox.minX,
      Math.random() * (bbox.maxY - bbox.minY) + bbox.minY
    ];

    // Check if the point is within the polygon
    if (isPointInPolygon(randomPoint, randomPolygon)) {
      return randomPoint.reverse();
    }
  }
}

export default function handler(req, res) {
  return res.status(200).json(getRandomPointInCountry(req.query.country??true));
}