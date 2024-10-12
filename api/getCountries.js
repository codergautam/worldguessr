// import { promises as fs } from 'fs';
// import path from 'path';
// import geolib, { getDistance } from 'geolib';

import countries from '../public/countries.json' with { type: "json" };
import countryMaxDists from '../public/countryMaxDists.json' with { type: "json" };

async function getCountries(req, res) {
  const out = {};
  for (const country of countries) {
    out[country] = countryMaxDists[country];
  }
  res.json(out);
}

export default getCountries;
