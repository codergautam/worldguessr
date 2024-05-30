// import { promises as fs } from 'fs';
// import path from 'path';
// import geolib, { getDistance } from 'geolib';

import countries from '../../public/countries.json'; // array of available countries
import countryMaxDists from '../../public/countryMaxDists.json'; // object with country codes as keys and max distances as values

async function getCountries(req, res) {
    // Load GeoJSON file
  //   const dataPath = path.join(__dirname, '../../../../public/genBorders.json');
  //   const rawData = await fs.readFile(dataPath);
  //   const borders = JSON.parse(rawData);

  //   const countryDistances = borders.features.reduce((acc, feature) => {
  //     const countryCode = feature.properties.code;
  //     const allCoordinates = [];

  //     if (feature.geometry.type === 'Polygon') {
  //         allCoordinates.push(...feature.geometry.coordinates[0]); // Assuming the first array is the outer boundary
  //     } else if (feature.geometry.type === 'MultiPolygon') {
  //         feature.geometry.coordinates.forEach(polygon => {
  //             allCoordinates.push(...polygon[0]); // Assuming the first array in each is the outer boundary
  //         });
  //     }

  //     if (!acc[countryCode]) {
  //         acc[countryCode] = { coordinates: allCoordinates };
  //     } else {
  //         acc[countryCode].coordinates.push(...allCoordinates);
  //     }

  //     return acc;
  // }, {});

  // // Calculate the maximum distance for each country
  // for (const [code, data] of Object.entries(countryDistances)) {
  //     const points = data.coordinates;
  //     let maxDistance = 0;
  //     points.forEach((startPoint, index) => {
  //         points.slice(index + 1).forEach(endPoint => {
  //             const distance = getDistance(
  //                 { latitude: startPoint[1], longitude: startPoint[0] },
  //                 { latitude: endPoint[1], longitude: endPoint[0] }
  //             );
  //             if (distance > maxDistance) {
  //                 maxDistance = distance;
  //             }
  //         });
  //     });

  //     countryDistances[code] = maxDistance/1000;
  // }
  // res.json(countryDistances);
  const out = {};
  for (const country of countries) {
    out[country] = countryMaxDists[country];
  }
  res.json(out);
}

export default getCountries;
