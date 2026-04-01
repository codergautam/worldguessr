import * as countryCodes from "countries-code";

const betterNames = {
  "GB": "United Kingdom",
  "US": "United States",
  "RU": "Russia",
  "KR": "South Korea",
  "TW": "Taiwan",
  "BO": "Bolivia",
  "VN": "Vietnam",
  "IR": "Iran",
  "VE": "Venezuela",
  "SY": "Syria",
  "TZ": "Tanzania",
  "MK": "North Macedonia",
  "PS": "Palestine",
  "LA": "Laos",
  "MD": "Moldova",
  "CZ": "Czech Republic",
  "DO": "Dominican Republic",
  "SZ": "Eswatini",
  "CD": "DR Congo",
  "CG": "Congo",
  "BN": "Brunei",
  "XK": "Kosovo",
  "AN": "Netherlands Antilles",
  "SX": "Sint Maarten",
  "BQ": "Caribbean Netherlands",
  "SS": "South Sudan",
}
export default function nameFromCode(country) {
  if (!country) return "???";
  if (betterNames[country]) return betterNames[country];
  const name = countryCodes.getCountry(country);
  if (!name || name.includes("Wrong")) return country;
  return name;
}
