import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import User from './models/User.js';
var app = express();
import cors from 'cors';
app.use(cors());
import lookup from "coordinate_to_country"

import express from 'express';
import countries from './public/countries.json' with { type: "json" };
import findLatLongRandom from './components/findLatLongServer.js';
import cityGen from './serverUtils/cityGen.js';

configDotenv();

// let dbEnabled = false;
// if (!process.env.MONGODB) {
//   console.log("[MISSING-ENV WARN] MONGODB env variable not set".yellow);
//   dbEnabled = false;
// } else {
//   // Connect to MongoDB
//   if (mongoose.connection.readyState !== 1) {
//     try {
//       await mongoose.connect(process.env.MONGODB);
//       console.log('[INFO] Database Connected');
//       dbEnabled = true;
//     } catch (error) {
//       console.error('[ERROR] Database connection failed!'.red, error.message);
//       console.log(error);
//       dbEnabled = false;
//     }
//   }
// }


let countryLocations = {};
const locationCnt = 2000;
const batchSize = 10;


for (const country of countries) {
  countryLocations[country] = [];
}

const generateBalancedLocations = async () => {
  while (true) {
    const batchPromises = [];

    // Loop through each country and start generating one batch for each
    for (const country of countries) {
      for (let i = 0; i < batchSize; i++) {
      const startTime = Date.now(); // Start time for each country
      const locationPromise = new Promise((resolve, reject) => {
        findLatLongRandom({ location: country }, cityGen, lookup)
          .then((latLong) => {
            const endTime = Date.now(); // End time after fetching location
            const duration = endTime - startTime; // Duration calculation

            resolve({ country: latLong.country, latLong });

          })
          .catch(reject);
      });

      batchPromises.push(locationPromise);
    }
    }

    try {
      // Await the results of generating locations for all countries in parallel
      const batchResults = await Promise.all(batchPromises);

      for (const { country, latLong } of batchResults) {
        // Update country-specific locations, ensuring a max of locationCnt
        try {
          if(countryLocations[country]) {
        countryLocations[country].unshift(latLong);
        if (countryLocations[country].length > locationCnt) {
          countryLocations[country].pop();
        }
      }
      } catch (error) {
        console.error('Error updating country locations', error, country, latLong);
      }
      }



    } catch (error) {
      console.error('Error generating locations', error);
    }

    // Delay before starting the next round of generation
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

// Start generating balanced locations for all countries
generateBalancedLocations();


let allCountriesCache = [];
let lastAllCountriesCacheUpdate = 0;

app.get('/allCountries.json', (req, res) => {
  if(Date.now() - lastAllCountriesCacheUpdate > 60 * 1000) {
    let locations = [];
    const totalCountries = countries.length;
    const locsPerCountry = locationCnt / totalCountries;
    for (const country of countries) {
      const locs = countryLocations[country];
      const randomLocations = locs.sort(() => Math.random() - 0.5).slice(0, locsPerCountry);
      locations.push(...randomLocations);
    }
    locations = locations.sort(() => Math.random() - 0.5);
    allCountriesCache = locations;
    return res.json({ ready: locations.length>0, locations });
  } else {
    return res.json({ ready: allCountriesCache.length>0, locations: allCountriesCache });
  }
});

app.get('/countryLocations/:country', (req, res) => {
  const country = req.params.country;
  if (!countryLocations[country]) {
    return res.status(404).json({ message: 'Country not found' });
  }
  return res.json({ ready:
    countryLocations[country].length > 0,
     locations: countryLocations[country] });
});

// Endpoint for /clueCountries.json
app.get('/clueCountries.json', (req, res) => {
  if (clueLocations.length === 0) {
    // send json {ready: false}
    return res.json({ ready: false });
  } else {
    return res.json({ ready: true, locations: clueLocations.sort(() => Math.random() - 0.5) });
  }
});


// listen 3003
app.get('/', (req, res) => {
  res.status(200).send('WorldGuessr Utils');
});

app.listen(3003, () => {
  console.log('WorldGuessr Utils listening on port 3003');
});