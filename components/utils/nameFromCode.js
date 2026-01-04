import * as countryCodes from "countries-code";

const betterNames = {
  "GB": "United Kingdom",
  "US": "United States",
  "RU": "Russia",
  "KR": "South Korea",
  "TW": "Taiwan",
}
export default function nameFromCode(country) {
  return betterNames[country] ?? countryCodes.getCountry(country);
}