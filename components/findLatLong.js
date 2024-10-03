
import { Loader } from '@googlemaps/js-api-loader';
import findCountry from './findCountry';
import { getRandomPointInCountry } from '@/pages/api/randomLoc';
const loader = new Loader({
  apiKey: "",
  version: "weekly",
  libraries: ["places"]
});
 function generateLatLong(location) {
  return new Promise((resolve, reject) => {
  loader.importLibrary("streetView").then(() => {
  // fetch(`/api/randomLoc${(location&&location!=="all")?`?country=${location}`:''}`).then((res) => res.json()).then((data) => {
    const data = getRandomPointInCountry((location&&location!=="all")?location.toUpperCase():true);
    const panorama = new google.maps.StreetViewService();
    console.log("Trying to get panorama for ", data);
    const lat = data[0];
    const long = data[1];

    panorama.getPanorama({ location: { lat, lng: long },
      preference: google.maps.StreetViewPreference.BEST,
      radius: 1000,
      sources: [google.maps.StreetViewSource.OUTDOOR]
    }, (data, status) => {
      if(status === "OK" && data) {
        const latLng = data.location?.latLng;
        if(!latLng) {
          alert("Failed to get location, couldn't find latLng object")
        }
        const latO = latLng.lat();
        const longO = latLng.lng();
        findCountry({ lat, lon: long }).then((country) => {

            // prevent trekkers v1
            // usually trekkers dont have location.description
            // however mongolia or south korea official coverage also doesn't have description
            // check if mongolia (MN) or south korea (KR), if not we can reject based on no description

            if(!["MN", "KR"].includes(country) && !data.location.description) {
              console.log("No description, rejecting");
              resolve(null);
            }

        resolve({ lat: latO, long: longO, country });
        }).catch((e) => {
          console.log("Failed to get country", e);
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
  let found = false;
  let output = null;

  while (!found) {
    const data = await generateLatLong(gameOptions.location);
    if(data) {
      output = data;
      found = true;
    } else {
    }
  }
  return output;
}

