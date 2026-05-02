const CONTINENT_KEYS = {
  "Africa": "continentAfrica",
  "Asia": "continentAsia",
  "Europe": "continentEurope",
  "North America": "continentNorthAmerica",
  "South America": "continentSouthAmerica",
  "Oceania": "continentOceania",
};

export function continentKey(continent) {
  return CONTINENT_KEYS[continent] || continent;
}
