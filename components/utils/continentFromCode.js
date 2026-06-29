import continentMapping from '@/public/continentMapping.json';

export const ALL_CONTINENTS = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania"];

export default function continentFromCode(countryCode) {
  return continentMapping[countryCode] || "Unknown";
}
