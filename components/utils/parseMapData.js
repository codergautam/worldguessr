
// Google Maps share short links: the mobile/share-sheet form
// (maps.app.goo.gl/<code>, often with ?g_st=ic) and the legacy
// goo.gl/maps/<code>. The code is an opaque key on Google's side: the
// coordinates are NOT encoded in it, they only exist behind the redirect,
// so no local parse can ever read them. parseMapData passes these through
// as strings and api/map/action.js resolves them server-side at publish.
// Anchored to exactly these two hosts on purpose: the server sends a
// request to whatever this matches, so a loose pattern here is an SSRF hole.
const SHORT_MAPS_LINK = /^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+(?:\?\S*)?$/;

export function matchShortMapsLink(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  return SHORT_MAPS_LINK.test(s) ? s : null;
}

// What a resolved short link must look like before its coordinates are
// trusted: a Google-owned /maps/ URL. The target already comes from Google's
// own Location header, so this is defense-in-depth, not the primary gate.
export function isResolvedMapsUrl(str) {
  return typeof str === 'string' &&
    /^https:\/\/(?:[a-z-]+\.)*google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps\//.test(str);
}

export function extractMapDetails(url) {
  // ex: https://www.google.com/maps/@48.8578055,2.2952078,3a,90y,-45h,128t/data=!3m7!1e1!3m5!1sAF1QipNIA4ndpD21zJIiwr-UPkpStYkHD1IkKysKrLc_!2e10!6shttps:%2F%2Flh5.googleusercontent.com%2Fp%2FAF1QipNIA4ndpD21zJIiwr-UPkpStYkHD1IkKysKrLc_%3Dw900-h600-k-no-pi-38-ya-11.956512451171875-ro0-fo90!7i5376!8i2688?coh=205410&entry=ttu

  const regex = /@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,3a,(\d+\.?\d*)y,(-?\d+\.?\d*)h,(\d+\.?\d*)t)?/;
  const match = url.match(regex);

  if (match) {
      const lat = parseFloat(match[1]);
      const long = parseFloat(match[2]);
      const fov = match[3] ? parseFloat(match[3]) : null;
      const heading = match[4] ? parseFloat(match[4]) : null;
      const pitch = match[5] ? parseFloat(match[5]) - 90 : null;

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
      // Short links carry no coordinates locally: preserve them as strings
      // for the server-side resolver instead of extracting (and dropping).
      const short = matchShortMapsLink(loc);
      if (short) return short;
      try {
        loc = JSON.parse(loc);
      } catch(e) {

        // try to extract a latitude and longitude from it
        const extracted = extractMapDetails(loc);
        loc = extracted;


      }
      // The file-upload path re-stringifies every entry, so a preserved
      // short link (or a full URL) can arrive JSON-quoted and parse back to
      // a plain string here. Treat it exactly like the raw form.
      if (typeof loc === 'string') {
        const quotedShort = matchShortMapsLink(loc);
        if (quotedShort) return quotedShort;
        loc = extractMapDetails(loc);
      }
    }

    const params = ["lat","lng","heading","pitch","zoom","panoId"];
    // canonical name first, then the aliases that fold into it
    const misspelled = [["lat","latitude"], ["lng","longitude","long","lon"]];
    let data = {};

    // fix misspelled keys
    try {
    for(const key of misspelled) {
      for(const k of key.slice(1)) {
        if(loc[k] !== undefined && loc[key[0]] === undefined) {
          loc[key[0]] = loc[k];
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