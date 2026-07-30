// Daily-rotating menu/site background. One image per UTC day, the same for
// everyone (it flips at the same midnight the daily challenge resets on),
// fully deterministic — no network calls, no APIs, no flashes:
// pages/_document.js sets the CSS var + preload PRE-PAINT from this same
// list, and pages/_app.js re-derives the identical value after hydration.
//
// COMPATIBILITY SPEC for adding images (curated from Pexels — free license,
// no attribution required):
//  - landscape, >=1536px wide, exported webp <=250KB (this is the LCP asset
//    every visitor downloads before first paint);
//  - must survive center/cover crops from ultrawide desktop down to 9:19
//    portrait phones: subject + horizon centered, nothing important in the
//    outer quarter of any edge;
//  - mid-brightness dusk/evening tones. The site composites this at 0.5
//    opacity over black plus dark-green gradients on cards — blown-out skies
//    wash the menus out, near-black shots turn to mud;
//  - low high-frequency clutter in the middle band where UI text sits.
//
// PORTAL BUILDS (CoolMath / Poki / GameDistribution zips) stay pinned to the
// static street2.webp: scripts/packageEmbed.mjs rewrites BAKED asset refs
// only, so a runtime-computed path would escape the rewrite and 404 inside
// the offline zip. The mobile app bundles its own static copy and is
// unaffected by this module entirely.
//
// Each entry: path + the city metadata the home-screen chip/info card shows
// (components/bgCityChip.js). Blurbs are user-facing copy: one sentence,
// a real geography hook, and NO em dashes (site copy rule). Order is
// continent-interleaved so consecutive days hop around the globe.
export const DAILY_BACKGROUNDS = [
  { path: '/street2.webp', city: 'London', country: 'United Kingdom', cc: 'gb',
    blurb: 'Trafalgar Square at dusk, Big Ben glowing down Whitehall. The original WorldGuessr backdrop.' },
  { path: '/backgrounds/bg-tokyo.webp', city: 'Tokyo', country: 'Japan', cc: 'jp',
    blurb: "Shin-Okubo at dusk, in the world's largest metropolitan area: 37 million people and counting." },
  { path: '/backgrounds/bg-newyork.webp', city: 'New York', country: 'United States', cc: 'us',
    blurb: 'Around 700 languages are spoken here, more than in any other city on Earth.' },
  { path: '/backgrounds/bg-paris.webp', city: 'Paris', country: 'France', cc: 'fr',
    blurb: "Haussmann's boulevards were cut deliberately wide: grand to look at, and hard to barricade." },
  { path: '/backgrounds/bg-seoul.webp', city: 'Seoul', country: 'South Korea', cc: 'kr',
    blurb: 'This megacity tore out an elevated highway to daylight a 600-year-old stream through downtown.' },
  { path: '/backgrounds/bg-rio.webp', city: 'Rio de Janeiro', country: 'Brazil', cc: 'br',
    blurb: 'A city squeezed between granite peaks and the Atlantic, under the gaze of Christ the Redeemer.' },
  { path: '/backgrounds/bg-warsaw.webp', city: 'Warsaw', country: 'Poland', cc: 'pl',
    blurb: "Warsaw's Old Town was rebuilt brick by brick from old paintings after WWII. This lamplit lane is a UNESCO-listed reconstruction." },
  { path: '/backgrounds/bg-singapore.webp', city: 'Singapore', country: 'Singapore', cc: 'sg',
    blurb: 'A city, an island, and a country all at once, sitting one degree north of the equator.' },
  { path: '/backgrounds/bg-mexicocity.webp', city: 'Mexico City', country: 'Mexico', cc: 'mx',
    blurb: 'Built on a drained lake over the Aztec capital, and still slowly sinking into it.' },
  { path: '/backgrounds/bg-rome.webp', city: 'Rome', country: 'Italy', cc: 'it',
    blurb: 'Modern trams rattle past temples older than most countries: 2,500 years of city in one frame.' },
  { path: '/backgrounds/bg-hongkong.webp', city: 'Hong Kong', country: 'Hong Kong', cc: 'hk',
    blurb: 'More skyscrapers than any other city on Earth, squeezed between a harbour and a mountain range.' },
  { path: '/backgrounds/bg-toronto.webp', city: 'Toronto', country: 'Canada', cc: 'ca',
    blurb: 'Over half of its residents were born outside Canada, making it one of the most multicultural cities anywhere.' },
  { path: '/backgrounds/bg-amsterdam.webp', city: 'Amsterdam', country: 'Netherlands', cc: 'nl',
    blurb: 'More canals than Venice, and comfortably more bicycles than people.' },
  { path: '/backgrounds/bg-bangkok.webp', city: 'Bangkok', country: 'Thailand', cc: 'th',
    blurb: 'Its full ceremonial name runs 168 letters, the longest city name in the world.' },
  { path: '/backgrounds/bg-buenosaires.webp', city: 'Buenos Aires', country: 'Argentina', cc: 'ar',
    blurb: 'The Paris of South America, where tango was born in the dockside neighbourhoods.' },
  { path: '/backgrounds/bg-prague.webp', city: 'Prague', country: 'Czechia', cc: 'cz',
    blurb: "Prague's Old Town has traded continuously since the 10th century, and its astronomical clock still performs on the hour." },
  { path: '/backgrounds/bg-kyoto.webp', city: 'Kyoto', country: 'Japan', cc: 'jp',
    blurb: "Japan's imperial capital for a thousand years, with some 1,600 temples tucked between its streets." },
  { path: '/backgrounds/bg-chicago.webp', city: 'Chicago', country: 'United States', cc: 'us',
    blurb: 'Birthplace of the skyscraper, and its river was engineered to flow backwards.' },
  { path: '/backgrounds/bg-lisbon.webp', city: 'Lisbon', country: 'Portugal', cc: 'pt',
    blurb: "Seven hills, century-old trams, and mainland Europe's westernmost capital." },
  { path: '/backgrounds/bg-shanghai.webp', city: 'Shanghai', country: 'China', cc: 'cn',
    blurb: "The Bund's colonial facades stare across the river at a skyline that went up in barely 30 years." },
  { path: '/backgrounds/bg-havana.webp', city: 'Havana', country: 'Cuba', cc: 'cu',
    blurb: 'Classic 1950s cars still cruise these streets, a rolling museum born of embargo.' },
  { path: '/backgrounds/bg-istanbul.webp', city: 'Istanbul', country: 'Türkiye', cc: 'tr',
    blurb: 'The only major city on two continents. This dusk rush is minutes from where Europe meets Asia.' },
  { path: '/backgrounds/bg-taipei.webp', city: 'Taipei', country: 'Taiwan', cc: 'tw',
    blurb: 'Night-market capital ringed by hot springs and jungle-covered peaks.' },
  { path: '/backgrounds/bg-sanfrancisco.webp', city: 'San Francisco', country: 'United States', cc: 'us',
    blurb: 'Fog, hills, and cable cars hauled by steel ropes that really do run beneath the street.' },
  { path: '/backgrounds/bg-vienna.webp', city: 'Vienna', country: 'Austria', cc: 'at',
    blurb: 'Ringstrasse grandeur built for an empire of 50 million, now the capital of 9.' },
  { path: '/backgrounds/bg-hanoi.webp', city: 'Hanoi', country: 'Vietnam', cc: 'vn',
    blurb: 'A millennium old, with an Old Quarter where each street is named for the trade it once sold.' },
  { path: '/backgrounds/bg-montreal.webp', city: 'Montreal', country: 'Canada', cc: 'ca',
    blurb: 'The largest French-speaking city outside Paris, with a whole underground town for winter.' },
  { path: '/backgrounds/bg-barcelona.webp', city: 'Barcelona', country: 'Spain', cc: 'es',
    blurb: "The Eixample's octagonal street corners were drawn 160 years ago for light and air." },
  { path: '/backgrounds/bg-dubai.webp', city: 'Dubai', country: 'United Arab Emirates', cc: 'ae',
    blurb: 'From pearl-diving village to the tallest tower on Earth within a single lifetime.' },
  { path: '/backgrounds/bg-santiago.webp', city: 'Santiago', country: 'Chile', cc: 'cl',
    blurb: 'On a clear evening the Andes wall off the entire eastern skyline.' },
  { path: '/backgrounds/bg-edinburgh.webp', city: 'Edinburgh', country: 'United Kingdom', cc: 'gb',
    blurb: "The Old Town stacks medieval closes down the tail of an extinct volcano." },
  { path: '/backgrounds/bg-osaka.webp', city: 'Osaka', country: 'Japan', cc: 'jp',
    blurb: "Japan's kitchen, where the local motto kuidaore means roughly 'eat until you drop'." },
  { path: '/backgrounds/bg-cusco.webp', city: 'Cusco', country: 'Peru', cc: 'pe',
    blurb: 'The Inca capital at 3,400 metres: Spanish churches stand on Inca stonework nothing has ever moved.' },
  { path: '/backgrounds/bg-berlin.webp', city: 'Berlin', country: 'Germany', cc: 'de',
    blurb: 'Nine times the area of Paris, with a skyline still stitched from two Cold War halves.' },
  { path: '/backgrounds/bg-marrakesh.webp', city: 'Marrakesh', country: 'Morocco', cc: 'ma',
    blurb: "The medina's maze has run on foot and cart for 950 years and counting." },
  { path: '/backgrounds/bg-neworleans.webp', city: 'New Orleans', country: 'United States', cc: 'us',
    blurb: 'Below sea level and above the music: jazz was born on these streets.' },
  { path: '/backgrounds/bg-budapest.webp', city: 'Budapest', country: 'Hungary', cc: 'hu',
    blurb: 'Two cities, Buda and Pest, stitched together across the Danube in 1873.' },
  { path: '/backgrounds/bg-kualalumpur.webp', city: 'Kuala Lumpur', country: 'Malaysia', cc: 'my',
    blurb: 'Grew from a tin-mining camp into twin 452-metre towers in barely a century.' },
  { path: '/backgrounds/bg-quebec.webp', city: 'Quebec City', country: 'Canada', cc: 'ca',
    blurb: 'The only walled city in North America north of Mexico.' },
  { path: '/backgrounds/bg-copenhagen.webp', city: 'Copenhagen', country: 'Denmark', cc: 'dk',
    blurb: 'More than half of all commutes here happen by bicycle. Cars are the minority.' },
  { path: '/backgrounds/bg-jaipur.webp', city: 'Jaipur', country: 'India', cc: 'in',
    blurb: 'The Pink City: painted rose for a royal visit in 1876 and kept that way by law ever since.' },
  { path: '/backgrounds/bg-sydney.webp', city: 'Sydney', country: 'Australia', cc: 'au',
    blurb: "Wrapped around one of the world's great natural harbours; the Opera House wears a million self-cleaning tiles." },
  { path: '/backgrounds/bg-krakow.webp', city: 'Kraków', country: 'Poland', cc: 'pl',
    blurb: "Europe's largest medieval market square, with a live trumpet call from the tower every hour." },
  { path: '/backgrounds/bg-cairo.webp', city: 'Cairo', country: 'Egypt', cc: 'eg',
    blurb: "The Arab world's largest city, minutes from the last surviving Wonder of the ancient world." },
  { path: '/backgrounds/bg-tbilisi.webp', city: 'Tbilisi', country: 'Georgia', cc: 'ge',
    blurb: "Named for its hot springs: tbili means 'warm' in Georgian." },
  { path: '/backgrounds/bg-stockholm.webp', city: 'Stockholm', country: 'Sweden', cc: 'se',
    blurb: 'Spread across 14 islands where a freshwater lake meets the Baltic Sea.' },
  { path: '/backgrounds/bg-capetown.webp', city: 'Cape Town', country: 'South Africa', cc: 'za',
    blurb: "Two oceans' weather systems collide beneath a mountain with a perfectly flat table top." },
  { path: '/backgrounds/bg-melbourne.webp', city: 'Melbourne', country: 'Australia', cc: 'au',
    blurb: "Laneway espresso culture and the largest tram network on the planet." },
  { path: '/backgrounds/bg-venice.webp', city: 'Venice', country: 'Italy', cc: 'it',
    blurb: 'A city on 118 islands with zero cars: even the ambulances are boats.' },
  { path: '/backgrounds/bg-moscow.webp', city: 'Moscow', country: 'Russia', cc: 'ru',
    blurb: 'Its metro stations were built as underground palaces, chandeliers included.' },
  { path: '/backgrounds/bg-auckland.webp', city: 'Auckland', country: 'New Zealand', cc: 'nz',
    blurb: 'A city stretched across a field of 53 dormant volcanoes.' },
  { path: '/backgrounds/bg-dublin.webp', city: 'Dublin', country: 'Ireland', cc: 'ie',
    blurb: 'A city of writers: four Nobel laureates in literature walked these streets.' },
  { path: '/backgrounds/bg-bamberg.webp', city: 'Bamberg', country: 'Germany', cc: 'de',
    blurb: 'Bamberg came through WWII nearly untouched, so its entire old town of cobbles and breweries is a UNESCO site.' },
  { path: '/backgrounds/bg-brussels.webp', city: 'Brussels', country: 'Belgium', cc: 'be',
    blurb: "Brussels grew out of a marsh, and its name roughly means 'home in the swamp'. It runs the EU anyway." },
  { path: '/backgrounds/bg-florence.webp', city: 'Florence', country: 'Italy', cc: 'it',
    blurb: "The Renaissance ignited in these few square kilometres; the Duomo is still the largest brick dome ever built." },
  { path: '/backgrounds/bg-athens.webp', city: 'Athens', country: 'Greece', cc: 'gr',
    blurb: 'Democracy was argued into existence a short walk uphill from here, 2,500 years ago.' },
  { path: '/backgrounds/bg-madrid.webp', city: 'Madrid', country: 'Spain', cc: 'es',
    blurb: "Europe's highest capital at 650 metres, with the country's kilometre zero set in the Puerta del Sol." },
  { path: '/backgrounds/bg-munich.webp', city: 'Munich', country: 'Germany', cc: 'de',
    blurb: 'Surfers ride a standing river wave in the middle of this city all year round.' },
  { path: '/backgrounds/bg-dubrovnik.webp', city: 'Dubrovnik', country: 'Croatia', cc: 'hr',
    blurb: 'The Pearl of the Adriatic, ringed by two kilometres of intact medieval walls.' },
  { path: '/backgrounds/bg-oslo.webp', city: 'Oslo', country: 'Norway', cc: 'no',
    blurb: 'A capital where the fjord and the forest are both a short metro ride away.' },
  { path: '/backgrounds/bg-seville.webp', city: 'Seville', country: 'Spain', cc: 'es',
    blurb: 'Orange trees line the streets, and the Giralda was a minaret before it was a bell tower.' },
  { path: '/backgrounds/bg-milan.webp', city: 'Milan', country: 'Italy', cc: 'it',
    blurb: "Italy's fashion and finance engine, with a cathedral that took nearly 600 years to finish." },
  { path: '/backgrounds/bg-helsinki.webp', city: 'Helsinki', country: 'Finland', cc: 'fi',
    blurb: "The world's northernmost metro rumbles beneath these streets." },
  { path: '/backgrounds/bg-riga.webp', city: 'Riga', country: 'Latvia', cc: 'lv',
    blurb: "Riga's centre holds the densest collection of Art Nouveau facades in Europe." },
  { path: '/backgrounds/bg-zurich.webp', city: 'Zurich', country: 'Switzerland', cc: 'ch',
    blurb: 'Over 1,200 public fountains here pour Alpine drinking water for free.' },
  { path: '/backgrounds/bg-tallinn.webp', city: 'Tallinn', country: 'Estonia', cc: 'ee',
    blurb: "One of Europe's best-preserved Hanseatic old towns, wired into one of its most digital states." },
  { path: '/backgrounds/bg-porto.webp', city: 'Porto', country: 'Portugal', cc: 'pt',
    blurb: 'The city that gave port wine its name; the cellars still line the far bank of the Douro.' },
  { path: '/backgrounds/bg-reykjavik.webp', city: 'Reykjavik', country: 'Iceland', cc: 'is',
    blurb: "The world's northernmost capital, heated almost entirely by volcanic ground." },
  { path: '/backgrounds/bg-bruges.webp', city: 'Bruges', country: 'Belgium', cc: 'be',
    blurb: 'Canals so perfectly medieval that UNESCO listed the entire city centre.' },
  { path: '/backgrounds/bg-strasbourg.webp', city: 'Strasbourg', country: 'France', cc: 'fr',
    blurb: 'French today, German four times within a century, and now seat of the European Parliament.' },
  { path: '/backgrounds/bg-luxembourg.webp', city: 'Luxembourg City', country: 'Luxembourg', cc: 'lu',
    blurb: 'Built atop cliffside casemates so tough the city was nicknamed the Gibraltar of the North.' },
];

export const IS_PORTAL_BUILD =
  process.env.NEXT_PUBLIC_COOLMATH === 'true' ||
  process.env.NEXT_PUBLIC_POKI === 'true' ||
  process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === 'true';

export function dailyBackgroundIndex(now = Date.now()) {
  if (IS_PORTAL_BUILD) return 0;
  return Math.floor(now / 86400000) % DAILY_BACKGROUNDS.length;
}

export function dailyBackground(now = Date.now()) {
  return DAILY_BACKGROUNDS[dailyBackgroundIndex(now)];
}

export function dailyBackgroundPath(now = Date.now()) {
  return dailyBackground(now).path;
}
