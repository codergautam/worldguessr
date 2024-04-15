
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
        console.log(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latO},${longO}`);
        resolve({ lat: latO, long: longO });
      } else {
        console.log("Invalid lat and long");
        resolve(null);
      }
    });
  });
});
}
// send post to https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch
// with payload [["apiv3",null,null,null,"US",null,null,null,null,null,[[0]]],[[null,null,X,Y],50000],[[null,null,1],["en","US"],null,null,null,null,null,null,[1],null,[[[2,1,2],[3,1,2],[10,1,2]]]],[[1,2,3,4,8,6]]]
// x and y are the lat and long
// if output is [[5, "generic", "Search returned no images."]] then the lat and long are invalid


export default async function findLatLongRandom() {
  console.log('Finding random location...');
  let found = false;
  let output = null;

  while (!found) {
    const data = await generateLatLong();
    if(data) {
      output = data;
      found = true;
    }
  }
  return output;
}

