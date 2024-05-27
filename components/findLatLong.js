
import { Loader } from '@googlemaps/js-api-loader';
import findCountry from './findCountry';
const loader = new Loader({
  apiKey: "",
  version: "weekly",
  libraries: ["places"]
});
 function generateLatLong() {
  return new Promise((resolve, reject) => {
  loader.importLibrary("streetView").then(() => {
  fetch("/api/randomLoc").then((res) => res.json()).then((data) => {
    const panorama = new google.maps.StreetViewService();
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
          if(country === "Unknown") {
            console.log("unknown country, rechecking")
            resolve(null);
          } else {

        resolve({ lat: latO, long: longO, country });
          }
        });
      } else {
        console.log('invalid loc, rechecking')
        resolve(null);
      }
    });
  });
});
});
}

export default async function findLatLongRandom() {
  let found = false;
  let output = null;

  while (!found) {
    const data = await generateLatLong();
    if(data) {
      output = data;
      found = true;
    } else {
    }
  }
  return output;
}

