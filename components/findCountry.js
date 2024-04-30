export default async function findCountry({lat, lon}) {
  let data = null;
  try {
  const resp = await fetch(`/api/country?lat=${lat}&lon=${lon}`); // fetch data from OSM
  data = await resp.json();
  } catch (e) {
    data = { address: { country: "Unknown" }}; // default to unknown
  }
  return data.address?.country ?? "Unknown";
}
  //https://nominatim.openstreetmap.org/reverse?lat=<value>&lon=<value>
// https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${process.env.NEXT_PUBLIC_MAPSCO}
