

async function hasStreetViewImage(lat, long, radius) {
  if(!lat || !long) {
    console.log("Invalid lat/long", lat, long);
    return false;
  }
  const url = `https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb=!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d${lat}!4d${long}!2d${radius}!3m18!2m2!1sen!2sUS!9m1!1e2!11m12!1m3!1e2!2b1!3e2!1m3!1e3!2b1!3e2!1m3!1e10!2b1!3e2!4m6!1e1!1e2!1e3!1e4!1e8!1e6&callback=_xdc_._2kz7bz`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/59.0.3071.109 Chrome/59.0.3071.109 Safari/537.36'
    }
  });

  let text = await response.text();

  // trim everything before [[0],[[1],[2,
  text = text.substring(text.indexOf("( [["));
  // trim first 2 characters and last 2 characters
  text = text.substring(2, text.length-2);
  if(text.includes("Search returned no images")) return false;
  try {
    const parsed = JSON.parse(text);
    const description = parsed[1][3][2][1][0];
    if(!description) {
      return false;
    }
  } catch(e) {
    return false;
  }
  // extract everything comma separated and keep only numbers (decimal points  and negative signs allowed)
  let parts = text.split(",").map((x) => x.match(/-?\d+(\.\d+)?/g)).filter((x) => x).flat().map((x) => parseFloat(x));
  // only keep those within 1 difference to either lat or long
  parts = parts.filter((x) => Math.abs(x - lat) < 1 || Math.abs(x - long) < 1);
  let answer = [];
  for(let i = 0; i < parts.length-1; i++) {
    // find the first pair where first number within 0.1 of lat and second within 0.1 of long
    if(Math.abs(parts[i] - lat) < 0.1 && Math.abs(parts[i+1] - long) < 0.1) {
      answer = [parts[i], parts[i+1]];
      break;
    }
  }
  if(answer.length === 0) {
    return false;
  }

  return { lat: answer[0], long: answer[1] };
}

 async function generateLatLong(location, getRandomPointInCountry, findCountry) {
  const point = getRandomPointInCountry(location&&location!=="all"?location:true);
  // console.log('point in ', location,' is ', point);
  const lat = point[0];
  const long = point[1];
  let outLat = null;
  let outLong = null;
  let country = null;

  const hasImage = await hasStreetViewImage(lat, long, 1000);
  if (!hasImage) {
    return null;
  } else {
    outLat = hasImage.lat;
    outLong = hasImage.long;
    country = await findCountry(outLat, outLong, true);
    if(!country || !country[0]) {
      return null;
    } else {
      // todo: prevent border issues when specifying a country
      country = country[0];
    }
  }

  return { lat: outLat, long: outLong, country: country };
}

export default async function findLatLongRandom(gameOptions, getRandomPointInCountry, findCountry) {
  let found = false;
  let output = null;

  while (!found) {
    const data = await generateLatLong(gameOptions.location, getRandomPointInCountry, findCountry);
    if(data) {
      output = data;
      found = true;
  return output;
    }
  }
}

