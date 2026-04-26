
import { Loader } from '@googlemaps/js-api-loader';
import findCountry from './findCountry';
import { getRandomPointInCountry } from '@/components/randomLoc';
const loader = new Loader({
  apiKey: "",
  version: "weekly",
  libraries: ["places"]
});
 function generateLatLong(location) {
  return new Promise((resolve, reject) => {
  const startTime = performance.now();
  // console.log("[PERF] Starting generateLatLong"); // Removed for security
  loader.importLibrary("streetView").then(() => {
    console.log(`[PERF] Street View library loaded in ${(performance.now() - startTime).toFixed(2)}ms`);
    const data = getRandomPointInCountry((location&&location!=="all")?location.toUpperCase():true);
    const panorama = new google.maps.StreetViewService();
  // console.log("Trying to get panorama for ", data); // Removed for security
    const lat = data[0];
    const long = data[1];
    const panoramaStartTime = performance.now();

    panorama.getPanorama({ location: { lat, lng: long },
      preference: google.maps.StreetViewPreference.BEST,
      radius: 1000,
      sources: [google.maps.StreetViewSource.OUTDOOR]
    }, (data, status) => {
  // console.log(`[PERF] getPanorama completed in ${(performance.now() - panoramaStartTime).toFixed(2)}ms - Status: ${status}`); // Removed for security
      if(status === "OK" && data) {
        const latLng = data.location?.latLng;
        if(!latLng) {
          alert("Failed to get location, couldn't find latLng object")
        }
        const latO = latLng.lat();
        const longO = latLng.lng();
        const countryStartTime = performance.now();
        findCountry({ lat, lon: long }).then((country) => {
          // console.log(`[PERF] findCountry completed in ${(performance.now() - countryStartTime).toFixed(2)}ms`); // Removed for security

            // prevent trekkers v1
            // usually trekkers dont have location.description
            // however mongolia or south korea official coverage also doesn't have description
            // check if mongolia (MN) or south korea (KR), if not we can reject based on no description

            if(!["MN", "KR"].includes(country) && !data.location.description) {
              // console.log("No description, rejecting"); // Removed for security
              // console.log(`[PERF] Total generateLatLong time (rejected): ${(performance.now() - startTime).toFixed(2)}ms`); // Removed for security
              resolve(null);
            }

  // console.log(`[PERF] Total generateLatLong time (success): ${(performance.now() - startTime).toFixed(2)}ms`); // Removed for security
        resolve({ lat: latO, long: longO, country });
        }).catch((e) => {
          // console.log("Failed to get country", e); // Removed for security
          // console.log(`[PERF] Total generateLatLong time (error): ${(performance.now() - startTime).toFixed(2)}ms`); // Removed for security
          resolve({ lat: latO, long: longO, country: "Unknown" });
        });
      } else {
        console.log("Failed to get panorama", status, data);
        resolve(null);
      }
    });
  // });
});
});
}

export default async function findLatLongRandom(gameOptions) {
  const totalStartTime = performance.now();
  // console.log("[PERF] findLatLongRandom started"); // Removed for security
  let found = false;
  let output = null;
  let attempts = 0;

  while (!found) {
    attempts++;
    const data = await generateLatLong(gameOptions.location);
    if(data) {
      output = data;
      found = true;
    } else {
      console.log(`[PERF] Attempt ${attempts} failed, retrying...`);
    }
  }
  // console.log(`[PERF] findLatLongRandom completed in ${(performance.now() - totalStartTime).toFixed(2)}ms (${attempts} attempts)`); // Removed for security
  return output;
}

