
import { Loader } from '@googlemaps/js-api-loader';
import findCountry from './findCountry';
import continentFromCode from '@/components/utils/continentFromCode';
import { getRandomPointInCountry } from '@/components/randomLoc';
const loader = new Loader({
  apiKey: "",
  version: "weekly",
  libraries: ["places"]
});

function generateLatLong(location, { requireKnownCountry, requireKnownContinent } = {}) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    console.log("[PERF] Starting generateLatLong");
    loader.importLibrary("streetView").then(async () => {
      console.log(`[PERF] Street View library loaded in ${(performance.now() - startTime).toFixed(2)}ms`);
      let data;
      try {
        data = await getRandomPointInCountry((location && location !== "all") ? location.toUpperCase() : true);
      } catch (e) {
        // Tag the rejection so the outer retry loop can distinguish a borders
        // fetch failure (terminal — fail fast) from a transient pano miss
        // (retry indefinitely, which is the legacy contract).
        console.log("[PERF] getRandomPointInCountry failed", e);
        return resolve({ __fatal: e });
      }
      if (!data) return resolve(null);
      const panorama = new google.maps.StreetViewService();
      console.log("Trying to get panorama for ", data);
      const lat = data[0];
      const long = data[1];
      const panoramaStartTime = performance.now();

      panorama.getPanorama({
        location: { lat, lng: long },
        preference: google.maps.StreetViewPreference.BEST,
        radius: 1000,
        sources: [google.maps.StreetViewSource.OUTDOOR]
      }, (data, status) => {
        console.log(`[PERF] getPanorama completed in ${(performance.now() - panoramaStartTime).toFixed(2)}ms - Status: ${status}`);
        if (status === "OK" && data) {
          const latLng = data.location?.latLng;
          if (!latLng) {
            alert("Failed to get location, couldn't find latLng object")
          }
          const latO = latLng.lat();
          const longO = latLng.lng();
          const countryStartTime = performance.now();
          findCountry({ lat, lon: long }).then((country) => {
            console.log(`[PERF] findCountry completed in ${(performance.now() - countryStartTime).toFixed(2)}ms`);

            // prevent trekkers v1
            // usually trekkers dont have location.description
            // however mongolia or south korea official coverage also doesn't have description
            // check if mongolia (MN) or south korea (KR), if not we can reject based on no description
            if (!["MN", "KR"].includes(country) && !data.location.description) {
              console.log("No description, rejecting");
              return resolve(null);
            }

            // Country-guesser mode can't work without a real country. Reject so
            // the outer loop tries a different spot.
            if (requireKnownCountry && (country === 'Unknown' || !country)) {
              console.log("Unknown country on a country-guesser round, rejecting spot");
              return resolve(null);
            }

            // Continent mode: the country must additionally map to a known
            // continent, otherwise we'd have no right answer for the player.
            if (requireKnownContinent && continentFromCode(country) === 'Unknown') {
              console.log("Country has no continent mapping, rejecting spot");
              return resolve(null);
            }

            console.log(`[PERF] Total generateLatLong time (success): ${(performance.now() - startTime).toFixed(2)}ms`);
            resolve({ lat: latO, long: longO, country });
          }).catch((e) => {
            console.log("Failed to get country", e);
            // Both server and local lookups failed. In country-guesser mode this
            // spot is unusable; reject and retry. In classic we tolerate Unknown.
            if (requireKnownCountry) return resolve(null);
            resolve({ lat: latO, long: longO, country: "Unknown" });
          });
        } else {
          console.log("Failed to get panorama", status, data);
          resolve(null);
        }
      });
    });
  });
}

/**
 * Pick a random street-view location. Pass `gameOptions.requireKnownCountry`
 * for country/continent guesser — spots with no country come back null and we
 * retry. Pano-finding is inherently guess-and-check (random point → is there a
 * street view within 1km?), so no retry cap; it just takes as long as it takes.
 */
export default async function findLatLongRandom(gameOptions) {
  const totalStartTime = performance.now();
  const requireKnownCountry = !!gameOptions?.requireKnownCountry;
  const requireKnownContinent = !!gameOptions?.requireKnownContinent;
  console.log("[PERF] findLatLongRandom started (requireKnownCountry:", requireKnownCountry, "requireKnownContinent:", requireKnownContinent, ")");
  let attempts = 0;
  while (true) {
    attempts++;
    const data = await generateLatLong(gameOptions.location, { requireKnownCountry, requireKnownContinent });
    if (data && !data.__fatal) {
      console.log(`[PERF] findLatLongRandom completed in ${(performance.now() - totalStartTime).toFixed(2)}ms (${attempts} attempts)`);
      return data;
    }
    if (data && data.__fatal) {
      // Borders data couldn't load — no amount of retrying will fix that;
      // surface the error so callers can show a real failure state instead of
      // spinning the loading UI forever.
      throw data.__fatal;
    }
    console.log(`[PERF] Attempt ${attempts} failed, retrying...`);
  }
}
