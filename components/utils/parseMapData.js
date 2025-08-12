
export function extractMapDetails(url) {
  // ex: https://www.google.com/maps/@48.8578055,2.2952078,3a,90y,-45h,128t/data=!3m7!1e1!3m5!1sAF1QipNIA4ndpD21zJIiwr-UPkpStYkHD1IkKysKrLc_!2e10!6shttps:%2F%2Flh5.googleusercontent.com%2Fp%2FAF1QipNIA4ndpD21zJIiwr-UPkpStYkHD1IkKysKrLc_%3Dw900-h600-k-no-pi-38-ya-11.956512451171875-ro0-fo90!7i5376!8i2688?coh=205410&entry=ttu

  const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)(?:,3a,(\d+)y,(-?\d+)h,(\d+)t)?/;
  const match = url.match(regex);

  if (match) {
      const lat = parseFloat(match[1]);
      const long = parseFloat(match[2]);
      const fov = match[3] ? parseInt(match[3], 10) : null;
      const heading = match[4] ? parseInt(match[4], 10) : null;
      const pitch = match[5] ? parseInt(match[5], 10) - 90 : null;

      // Calculate zoom if fov is available
      const zoom = fov !== null ? Math.log2(180 / fov) : null;

      // Extract panoId from URL (e.g., !1sAF1QipNIA4ndpD21zJIiwr-UPkpStYkHD1IkKysKrLc_)
      let panoId = null;
      const panoIdRegex = /!1s([A-Za-z0-9_-]+)/;
      const panoIdMatch = url.match(panoIdRegex);
      if (panoIdMatch) {
          panoId = panoIdMatch[1];
      }

      return {
          lat: lat,
          lng: long,
          heading: heading,
          pitch: pitch,
          zoom: zoom,
          panoId: panoId
      };
  } else {
      return null;
  }
}


export default function parseMapData(obj) {
  console.log('parse map data');
  if(typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
      console.log('converted to json');
    } catch(e) {
      return;
    }
  }

  let array = [];
  if(Array.isArray(obj)) {
    array = obj;
    console.log('already is array');
  }

  // if not find a key with an array and use that
  if(array.length === 0) {
    console.log('looking for array');
    for(const key in obj) {
      if(Array.isArray(obj[key])) {
        console.log('found array', obj[key]);
        array = obj[key];
        break;
      }
    }
  }

  if(array.length === 0) {
    console.log('no array found');
    return;
  }

  let output = [];
  output = array.map((loc) => {
    // check if data is final form
    if(!loc) {
      return;
    }
    if(typeof loc === 'string') {
      try {
        loc = JSON.parse(loc);
      } catch(e) {

        // try to extract a latitude and longitude from it
        const extracted = extractMapDetails(loc);
        loc = extracted;


      }
    }

    const params = ["lat","lng","heading","pitch","zoom","panoId"];
    const misspelled = [["latitude"], ["longitude","long","lon"]];
    let data = {};

    // fix misspelled keys
    try {
    for(const key of misspelled) {
      for(const k of key) {
        if(loc[k] !== undefined) {
          loc[key[0]] = loc[k];
          delete loc[k];
        }
      }
    }
  } catch(e) {
    // probably an invalid url
    // send back feedback
    return;
  }

    // only keep the keys we want
    for(const key of params) {
      if(loc[key] !== undefined) {
        data[key] = loc[key];
      }
    }

    // make sure at least lat and lng are present
    if(data.lat === undefined || data.lng === undefined) {
      return;
    }


    return data;
  })


  // remove any undefined values
  output = output.filter((x) => x);
  if(output.length === 0) {
    return null;
  }


  return output;


}