import cities from '../public/cities.json' with { type: "json" };

export default function cityGen(location) {
  let city = null;
  if(location && location !== true) {
    city=  cities.filter(c => c.country_code === location);
  } else {
    city = cities;
  }
  city = city[Math.floor(Math.random() * city.length)];
  const coord = city.coordinates;
  const lat = coord.lat;
  const long = coord.lon;

  const radius_km = 5;
  const latOffset = Math.random() * radius_km * 0.009;
  const longOffset = Math.random() * radius_km * 0.009;

  return [lat + latOffset, long + longOffset];

}