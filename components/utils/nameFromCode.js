import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import esLocale from "i18n-iso-countries/langs/es.json";
import frLocale from "i18n-iso-countries/langs/fr.json";
import deLocale from "i18n-iso-countries/langs/de.json";
import ruLocale from "i18n-iso-countries/langs/ru.json";

countries.registerLocale(enLocale);
countries.registerLocale(esLocale);
countries.registerLocale(frLocale);
countries.registerLocale(deLocale);
countries.registerLocale(ruLocale);

// Shorter/better display names per language for codes where the package uses overly formal names
const betterNames = {
  "US": { en: "United States", es: "Estados Unidos", fr: "États-Unis", de: "USA", ru: "США" },
  "RU": { en: "Russia", es: "Rusia", fr: "Russie", de: "Russland", ru: "Россия" },
  "KR": { en: "South Korea", es: "Corea del Sur", fr: "Corée du Sud", de: "Südkorea", ru: "Южная Корея" },
  "TW": { en: "Taiwan", es: "Taiwán", fr: "Taïwan", de: "Taiwan", ru: "Тайвань" },
  "IR": { en: "Iran", es: "Irán", fr: "Iran", de: "Iran", ru: "Иран" },
  "SY": { en: "Syria", es: "Siria", fr: "Syrie", de: "Syrien", ru: "Сирия" },
  "TZ": { en: "Tanzania", es: "Tanzania", fr: "Tanzanie", de: "Tansania", ru: "Танзания" },
  "MK": { en: "North Macedonia", es: "Macedonia del Norte", fr: "Macédoine du Nord", de: "Nordmazedonien", ru: "Северная Македония" },
  "PS": { en: "Palestine", es: "Palestina", fr: "Palestine", de: "Palästina", ru: "Палестина" },
  "LA": { en: "Laos", es: "Laos", fr: "Laos", de: "Laos", ru: "Лаос" },
  "MD": { en: "Moldova", es: "Moldavia", fr: "Moldavie", de: "Moldawien", ru: "Молдавия" },
  "CZ": { en: "Czech Republic", es: "Chequia", fr: "Tchéquie", de: "Tschechien", ru: "Чехия" },
  "DO": { en: "Dominican Republic", es: "República Dominicana", fr: "Rép. dominicaine", de: "Dominikanische Republik", ru: "Доминиканская Респ." },
  "SZ": { en: "Eswatini", es: "Esuatini", fr: "Eswatini", de: "Eswatini", ru: "Эсватини" },
  "CD": { en: "DR Congo", es: "RD del Congo", fr: "RD Congo", de: "DR Kongo", ru: "ДР Конго" },
  "CG": { en: "Congo", es: "Congo", fr: "Congo", de: "Kongo", ru: "Конго" },
  "BN": { en: "Brunei", es: "Brunéi", fr: "Brunei", de: "Brunei", ru: "Бруней" },
  "AN": { en: "Netherlands Antilles", es: "Antillas Neerlandesas", fr: "Antilles néerlandaises", de: "Niederländische Antillen", ru: "Нидерландские Антилы" },
  "SX": { en: "Sint Maarten", es: "San Martín", fr: "Saint-Martin", de: "Sint Maarten", ru: "Синт-Мартен" },
  "BQ": { en: "Caribbean Netherlands", es: "Caribe Neerlandés", fr: "Pays-Bas caribéens", de: "Karibische Niederlande", ru: "Карибские Нидерланды" },
  "CN": { en: "China", es: "China", fr: "Chine", de: "China", ru: "Китай" },
  "KP": { en: "North Korea", es: "Corea del Norte", fr: "Corée du Nord", de: "Nordkorea", ru: "Северная Корея" },
  "GM": { en: "Gambia", es: "Gambia", fr: "Gambie", de: "Gambia", ru: "Гамбия" },
  "FM": { en: "Micronesia", es: "Micronesia", fr: "Micronésie", de: "Mikronesien", ru: "Микронезия" },
  "VA": { en: "Vatican City", es: "Ciudad del Vaticano", fr: "Vatican", de: "Vatikanstadt", ru: "Ватикан" },
  "FK": { en: "Falkland Islands", es: "Islas Malvinas", fr: "Îles Malouines", de: "Falklandinseln", ru: "Фолклендские острова" },
  "MF": { en: "Saint Martin", es: "San Martín", fr: "Saint-Martin", de: "Saint-Martin", ru: "Сен-Мартен" },
};

export default function nameFromCode(country, lang = "en") {
  if (!country) return "???";
  if (betterNames[country]?.[lang]) return betterNames[country][lang];
  const name = countries.getName(country, lang) || countries.getName(country, "en");
  return name || country;
}
