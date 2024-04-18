
import { Loader } from '@googlemaps/js-api-loader';
const loader = new Loader({
  apiKey: "",
  version: "weekly",
  libraries: ["places"]
});
 function generateLatLong() {
  return new Promise((resolve, reject) => {
  const lat = Math.random() * 180 - 90;
  const long = Math.random() * 360 - 180;
  loader.importLibrary("streetView").then(() => {
    const panorama = new google.maps.StreetViewService();
    panorama.getPanorama({ location: { lat, lng: long },
      preference: google.maps.StreetViewPreference.BEST,
      radius: 50000,
      sources: [google.maps.StreetViewSource.OUTDOOR]
    }, (data, status) => {
      if(status === "OK" && data) {
        const out = (Object.values(data.sG)[0]);
        const latO = out.lat;
        const longO = out.lng;
        resolve({ lat: latO, long: longO });
      } else {
        console.log('invalid loc, rechecking. current check was: ', { lat, long })
        resolve(null);
      }
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
      console.log('found lat long1')
    } else {
    }
  }
  console.log('success! found lat long2')
  return output;
}

