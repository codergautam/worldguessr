// Flags that are easy to mix up. A miss on one of these pairs gets a kinder
// note ("Easy mix-up: Romania's flag is a near twin"), because the player saw
// the flag right and only confused it with its twin.

const PAIRS = [
  ['TD', 'RO'], ['ID', 'MC'], ['ID', 'PL'], ['MC', 'PL'], ['IE', 'CI'],
  ['NL', 'LU'], ['AU', 'NZ'], ['SN', 'ML'], ['GN', 'ML'], ['CO', 'EC'],
  ['CO', 'VE'], ['EC', 'VE'], ['NO', 'IS'], ['HT', 'LI'], ['QA', 'BH'],
  ['SI', 'SK'], ['SK', 'RU'], ['SI', 'RU'], ['JO', 'PS'], ['NE', 'IN'],
  ['EG', 'SY'], ['EG', 'IQ'], ['EG', 'YE'], ['SY', 'IQ'], ['SY', 'YE'],
  ['IQ', 'YE'], ['AT', 'LV'], ['CR', 'TH'], ['NI', 'HN'], ['NI', 'SV'],
  ['HN', 'SV'], ['KW', 'AE'], ['CM', 'SN'], ['BE', 'DE'], ['CZ', 'PH'],
];

const TWINS = new Set(PAIRS.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]));

export function areFlagTwins(a, b) {
  return !!a && !!b && TWINS.has(`${a}:${b}`);
}
