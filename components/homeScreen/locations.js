

const LOCATIONS = [
  {
    id: 'vikbeach',
    name: 'Vík í Mýrdal',
    country: 'Iceland',
    countryCode: 'IS',
    tagline: "Vík's black sand coastline",
    images: ['/assets/backgrounds/vikbeach.png', '/assets/backgrounds/vikbeach2.png'],
    description:
      "Vík í Mýrdal is the southernmost village on the Icelandic mainland. It sits below the Reynisfjall headland, on the Atlantic shore. Its Reynisfjara beach is jet-black volcanic sand, with hexagonal basalt columns at the back and the Reynisdrangar sea stacks offshore. The sand came from cooled lava that the North Atlantic ground down over time. The beach is also notorious for sneaker waves that can rush far up the sand without warning.",
    facts: [
      { label: 'Region', value: 'South Iceland' },
      { label: 'Population', value: '~750' },
      { label: 'Climate', value: 'Subpolar oceanic' },
      { label: 'Famous for', value: 'Black sand & basalt columns' },
    ],
    sources: [
      { label: 'Wikipedia · Reynisfjara', url: 'https://en.wikipedia.org/wiki/Reynisfjara' },
      { label: 'Guide to Iceland', url: 'https://guidetoiceland.is/travel-iceland/drive/reynisfjara' },
    ],
  },
  {
    id: 'seatoskyhighway',
    name: 'Sea-to-Sky Highway',
    country: 'Canada',
    countryCode: 'CA',
    tagline: 'Howe Sound to the Coast Mountains',
    images: [
      '/assets/backgrounds/seatoskyhighway.png',
      '/assets/backgrounds/seatoskyhighway2.png',
      '/assets/backgrounds/seatoskyhighway3.png',
      '/assets/backgrounds/seatoskyhighway4.png',
    ],
    description:
      "BC Highway 99 runs 134 km from Horseshoe Bay up through Squamish and Whistler to Pemberton. The name comes from the climb: the road starts at sea level on Howe Sound and ends in the Coast Mountains. Along the way it passes old-growth rainforest, glacier-fed waterfalls and granite cliffs. The Guardian once ranked it the fifth-best road trip in the world, and the whole corridor sits inside a UNESCO Biosphere Region.",
    facts: [
      { label: 'Province', value: 'British Columbia' },
      { label: 'Length', value: '134 km (83 mi)' },
      { label: 'Highway', value: 'BC Highway 99' },
      { label: 'Famous for', value: 'Coastal mountain views' },
    ],
    sources: [
      { label: 'Super, Natural BC', url: 'https://www.supernaturalbc.com/road-trips/sea-to-sky-highway-route/' },
      { label: 'Wikipedia · BC Highway 99', url: 'https://en.wikipedia.org/wiki/British_Columbia_Highway_99' },
    ],
  },
  {
    id: 'sonorandesert',
    name: 'Sonoran Desert',
    country: 'United States',
    countryCode: 'US',
    tagline: 'Saguaro country',
    images: [
      '/assets/backgrounds/sonorandesert.png',
      '/assets/backgrounds/sonorandesert2.png',
      '/assets/backgrounds/sonorandesert3.png',
      '/assets/backgrounds/sonorandesert4.png',
    ],
    description:
      "The Sonoran covers about 260,000 km² across Arizona, California and northwestern Mexico. It's the only desert on Earth where the giant saguaro cactus grows in the wild. It's also the wettest desert in the world, with two rainy seasons a year, and it's the most biologically diverse desert in North America. Over 2,000 plant species and 550 animal species live in its bajadas, ironwood groves and cactus forests.",
    facts: [
      { label: 'Area', value: '260,000 km²' },
      { label: 'Spans', value: 'AZ, CA, Sonora, Baja CA' },
      { label: 'Saguaro height', value: 'Up to 12 m' },
      { label: 'Famous for', value: 'Saguaro cactus forests' },
    ],
    sources: [
      { label: 'Wikipedia · Sonoran Desert', url: 'https://en.wikipedia.org/wiki/Sonoran_Desert' },
      { label: 'Friends of Saguaro NP', url: 'https://friendsofsaguaro.org/sonorandesert' },
    ],
  },
  {
    id: 'marinheadlands',
    name: 'Marin Headlands',
    country: 'United States',
    countryCode: 'US',
    tagline: 'North of the Golden Gate',
    images: [
      '/assets/backgrounds/marinheadlands.png',
      '/assets/backgrounds/marinheadlands2.png',
    ],
    description:
      "A hilly peninsula at the southern tip of Marin County, right across the Golden Gate Bridge from San Francisco. The Headlands are part of the Golden Gate National Recreation Area. Cliffs of folded oceanic rock drop straight to the Pacific, fog rolls under the bridge most mornings, and old WWII bunkers are still tucked into the bluffs above the water.",
    facts: [
      { label: 'County', value: 'Marin, California' },
      { label: 'Park', value: 'Golden Gate NRA' },
      { label: 'Visitors', value: '~13M / year' },
      { label: 'Famous for', value: 'Golden Gate Bridge views' },
    ],
    sources: [
      { label: 'NPS · Marin Headlands', url: 'https://www.nps.gov/goga/marin-headlands.htm' },
      { label: 'Wikipedia · Marin Headlands', url: 'https://en.wikipedia.org/wiki/Marin_Headlands' },
    ],
  },
  {
    id: 'alsacewineroute',
    name: 'Alsace Wine Route',
    country: 'France',
    countryCode: 'FR',
    tagline: 'Vineyards along the Vosges',
    images: [
      '/assets/backgrounds/alsacewineroute.png',
      '/assets/backgrounds/alsacewineroute2.png',
      '/assets/backgrounds/alsacewineroute3.png',
    ],
    description:
      "France's oldest wine route, inaugurated in 1953. It runs about 170 km along the foothills of the Vosges Mountains, from Strasbourg in the north down to Colmar in the south, and connects more than seventy half-timbered villages along the way. Riquewihr, Eguisheim and Kaysersberg are all on it. Most of the towns are full of cobbled lanes, flowering balconies and family-run estates pouring Riesling and Gewürztraminer.",
    facts: [
      { label: 'Region', value: 'Grand Est, Alsace' },
      { label: 'Length', value: '~170 km' },
      { label: 'Villages', value: '70+' },
      { label: 'Famous for', value: 'Half-timbered wine villages' },
    ],
    sources: [
      { label: 'Visit Alsace', url: 'https://www.visit.alsace/en/the-alsace-wine-route/' },
      { label: 'Alsace Wine Route', url: 'https://www.wineroute.alsace/' },
    ],
  },
  {
    id: 'fjordroadside',
    name: 'Atlantic Road',
    country: 'Norway',
    countryCode: 'NO',
    tagline: 'The road through the sea',
    images: [
      '/assets/backgrounds/fjordroadside.png',
      '/assets/backgrounds/fjordroadside2.png',
      '/assets/backgrounds/fjordroadside3.png',
    ],
    description:
      "The Atlantic Road is one of Norway's eighteen designated Scenic Routes. It runs 36 km of coast between Kårvåg and Bud, hopping from islet to islet across eight bridges. The biggest, Storseisundet, curves so sharply that from a low angle it looks like the road just ends in the sky. The whole stretch was built through hurricanes and storm surges, and it cuts across open Atlantic, sheltered coves and weather-beaten fishing villages.",
    facts: [
      { label: 'Region', value: 'Møre og Romsdal' },
      { label: 'Length', value: '36 km' },
      { label: 'Bridges', value: '8' },
      { label: 'Famous for', value: 'Storseisundet Bridge' },
    ],
    sources: [
      { label: 'Fjord Norway', url: 'https://www.fjordnorway.com/en/attractions/the-atlantic-road' },
      { label: 'Norwegian Scenic Routes', url: 'https://www.nasjonaleturistveger.no/en/' },
    ],
  },
  {
    id: 'iberianhills',
    name: 'Iberian Hills',
    country: 'Spain & Portugal',
    countryCode: 'ES',
    tagline: 'Rolling hills of the peninsula',
    images: [
      '/assets/backgrounds/iberianhills.png',
      '/assets/backgrounds/iberianhills2.png',
      '/assets/backgrounds/iberianhills3.png',
    ],
    description:
      "South of the Tagus, the Iberian Peninsula opens up into rolling plains and gentle hills covered in cork oaks, olive groves and dry-stone walls. The interior is dominated by the Meseta Central, a vast plateau averaging 600 to 760 metres. It slopes gently west into Portugal, where the same warm, dry subtropical air shapes valleys famous for port wine and almond blossom.",
    facts: [
      { label: 'Region', value: 'Iberian Peninsula' },
      { label: 'Countries', value: 'Spain, Portugal' },
      { label: 'Plateau', value: 'Meseta Central' },
      { label: 'Famous for', value: 'Cork oaks & vineyards' },
    ],
    sources: [
      { label: 'Wikipedia · Iberian Peninsula', url: 'https://en.wikipedia.org/wiki/Iberian_Peninsula' },
    ],
  },

  {
    id: 'wadirum',
    name: 'Wadi Rum',
    country: 'Jordan',
    countryCode: 'JO',
    tagline: 'The Valley of the Moon',
    images: ['/assets/backgrounds/wadirum.jpg', '/assets/backgrounds/wadirum2.jpg'],
    description:
      "Wadi Rum is a 720 km² UNESCO-listed protected area in southern Jordan. It's a maze of red sand dunes, sandstone monoliths and natural rock arches, all cut from iron-rich Umm Ishrin sandstone. Bedouin still live here, and around 25,000 petroglyphs across the cliffs trace twelve thousand years of human use. Hollywood likes to film Mars here too: Lawrence of Arabia, The Martian, Dune and Star Wars all shot in this valley.",
    facts: [
      { label: 'Region', value: "Aqaba, S. Jordan" },
      { label: 'Area', value: '720 km²' },
      { label: 'Status', value: 'UNESCO World Heritage' },
      { label: 'Famous for', value: 'Red Mars-like canyons' },
    ],
    sources: [
      { label: 'Wikipedia · Wadi Rum', url: 'https://en.wikipedia.org/wiki/Wadi_Rum' },
      { label: 'National Geographic', url: 'https://www.nationalgeographic.com/travel/world-heritage/article/wadi-rum-jordan' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Wadi_Rum_in_Jordan.JPG' },
    ],
  },
  {
    id: 'pamukkale',
    name: 'Pamukkale',
    country: 'Turkey',
    countryCode: 'TR',
    tagline: 'The cotton castle',
    images: ['/assets/backgrounds/pamukkale.jpg', '/assets/backgrounds/pamukkale2.jpg'],
    description:
      "Pamukkale means 'cotton castle' in Turkish. Over thousands of years, 17 calcium-rich hot springs in Denizli province (35 to 100 °C) have cascaded down a hillside and laid down a 2,700-metre-long terrace of brilliant white travertine. Calcium carbonate releases out of the cooling water and crystallises into rim pools and petrified waterfalls. The Greco-Roman city of Hierapolis was built on top, and the joint site has been UNESCO-listed since 1988.",
    facts: [
      { label: 'Region', value: 'Denizli, Aegean' },
      { label: 'Length', value: '~2,700 m' },
      { label: 'Status', value: 'UNESCO World Heritage' },
      { label: 'Famous for', value: 'White travertine terraces' },
    ],
    sources: [
      { label: 'Wikipedia · Pamukkale', url: 'https://en.wikipedia.org/wiki/Pamukkale' },
      { label: 'UNESCO · Hierapolis-Pamukkale', url: 'https://whc.unesco.org/en/list/485/' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Pamukkale_30.jpg' },
    ],
  },
  {
    id: 'socotra',
    name: 'Socotra',
    country: 'Yemen',
    countryCode: 'YE',
    tagline: "The Galápagos of the Indian Ocean",
    images: ['/assets/backgrounds/socotra.jpg'],
    description:
      "Socotra has been cut off from the African mainland for about seven million years. It sits roughly 370 km south of Yemen, and around a third of the plants here grow nowhere else on Earth. The Dragon's Blood Tree (Dracaena cinnabari) is the island's symbol. Its umbrella-shaped canopy traps fog out of the air, and when cut the tree bleeds a deep red sap. Goats, cyclones and Yemen's long civil war are all chipping away at the species, which only grows about 2 to 3 cm a year.",
    facts: [
      { label: 'Country', value: 'Yemen' },
      { label: 'Distance from coast', value: '~370 km south' },
      { label: 'Status', value: 'UNESCO World Heritage' },
      { label: 'Famous for', value: 'Dragon Blood Trees' },
    ],
    sources: [
      { label: 'Wikipedia · Dracaena cinnabari', url: 'https://en.wikipedia.org/wiki/Dracaena_cinnabari' },
      { label: 'National Geographic', url: 'https://www.nationalgeographic.com/environment/article/socotra-yemen-biodiversity-photography' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Dragonblood_tree_in_Socotra_2.jpg' },
    ],
  },
  {
    id: 'bled',
    name: 'Lake Bled',
    country: 'Slovenia',
    countryCode: 'SI',
    tagline: 'A church on an alpine island',
    images: ['/assets/backgrounds/bled.jpg'],
    description:
      "Lake Bled is a 2-kilometre teardrop of glacial water in the Julian Alps. It has a small island in the middle, the only natural island in Slovenia, with a 17th-century pilgrimage church at the top of a Baroque stairway of 99 stone steps. Visitors are still rowed out by traditional flat-bottomed pletna boats, where they ring the church's 1534 'wishing bell' for luck.",
    facts: [
      { label: 'Region', value: 'Upper Carniola' },
      { label: 'Length', value: '2,120 m' },
      { label: 'Max depth', value: '29.5 m' },
      { label: 'Famous for', value: 'Island church + Bled Castle' },
    ],
    sources: [
      { label: 'Wikipedia · Lake Bled', url: 'https://en.wikipedia.org/wiki/Lake_Bled' },
      { label: 'I feel Slovenia', url: 'https://www.slovenia.info/en/press-centre/news-of-the-tourism-press-agency/6150-bled-island-church-is-among-the-most-beautiful-in-the-world' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Lake_Bled_from_the_Mountain.jpg' },
    ],
  },
  {
    id: 'mongoliansteppe',
    name: 'Mongolian Steppe',
    country: 'Mongolia',
    countryCode: 'MN',
    tagline: 'Endless grass and white gers',
    images: ['/assets/backgrounds/mongolia.jpg'],
    description:
      "Roughly half of Mongolia is open steppe: a flat-to-rolling sea of grass that runs from the Altai foothills out to the Gobi. Families herd sheep, goats, horses and camels between portable round felt tents called gers, which can be dismantled and rebuilt in under three hours when it's time to move. Temperatures swing from −40 °C in winter to +45 °C in summer, and you can travel for a day in any direction without crossing a fence.",
    facts: [
      { label: 'Country', value: 'Mongolia' },
      { label: 'Climate', value: 'Continental, extreme' },
      { label: 'Population density', value: '~2 people / km² (lowest)' },
      { label: 'Famous for', value: 'Nomadic ger camps' },
    ],
    sources: [
      { label: 'Wikipedia · Mongolian-Manchurian grassland', url: 'https://en.wikipedia.org/wiki/Mongolian%E2%80%93Manchurian_grassland' },
      { label: 'WWF · Mongolian nomads', url: 'https://www.worldwildlife.org/news/stories/the-home-and-life-of-mongolian-nomadic-herders' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Jurty_na_stepie_pomi%C4%99dzy_U%C5%82an_Bator_a_Karakorum_03.JPG' },
    ],
  },
  {
    id: 'tbilisi',
    name: 'Old Tbilisi',
    country: 'Georgia',
    countryCode: 'GE',
    tagline: 'East-meets-west on the Kura',
    images: ['/assets/backgrounds/tbilisi.jpg', '/assets/backgrounds/tbilisi2.jpg'],
    description:
      "The Georgian capital was founded in the 5th century. Its old town still stacks pastel brick houses with carved wooden balconies up the slope below the Narikala Fortress. Sulphur bathhouses, 19th-century eclectic facades and Soviet apartment blocks all share the same horizon, and on a clear day you can see the foothills of the Greater Caucasus past the cable cars. The name 'Tbilisi' means 'warm place' in Georgian, a reference to the city's hot springs.",
    facts: [
      { label: 'Country', value: 'Georgia' },
      { label: 'Founded', value: '5th century CE' },
      { label: 'River', value: 'Kura (Mtkvari)' },
      { label: 'Famous for', value: 'Carved wooden balconies' },
    ],
    sources: [
      { label: 'Wikipedia · Old Tbilisi', url: 'https://en.wikipedia.org/wiki/Old_Tbilisi' },
      { label: 'Wikipedia · Tbilisi', url: 'https://en.wikipedia.org/wiki/Tbilisi' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Old_Tbilisi_Panorama_09.23_(2).jpg' },
    ],
  },
  {
    id: 'zhangjiajie',
    name: 'Zhangjiajie',
    country: 'China',
    countryCode: 'CN',
    tagline: "The pillars that inspired Avatar",
    images: ['/assets/backgrounds/zhangjiajie.jpg', '/assets/backgrounds/zhangjiajie2.jpg'],
    description:
      "Zhangjiajie National Forest Park, inside Hunan's Wulingyuan Scenic Area, has more than 3,000 quartzite-sandstone pillars rising over 200 metres out of subtropical green and constant mist. The tallest, the 1,080-metre Southern Sky Column, was officially renamed 'Avatar Hallelujah Mountain' in 2010 after James Cameron credited the area as an inspiration for Pandora's floating peaks. The park has been a UNESCO World Heritage Site since 1992.",
    facts: [
      { label: 'Province', value: 'Hunan, China' },
      { label: 'Park', value: 'Zhangjiajie NFP' },
      { label: 'Tallest pillar', value: '1,080 m' },
      { label: 'Famous for', value: 'Avatar pillars in mist' },
    ],
    sources: [
      { label: 'Wikipedia · Zhangjiajie NFP', url: 'https://en.wikipedia.org/wiki/Zhangjiajie_National_Forest_Park' },
      { label: 'UNESCO · Wulingyuan', url: 'https://whc.unesco.org/en/list/640/' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:1_tianzishan_wulingyuan_zhangjiajie_2012.jpg' },
    ],
  },
  {
    id: 'chocolatehills',
    name: 'Chocolate Hills',
    country: 'Philippines',
    countryCode: 'PH',
    tagline: 'A thousand cocoa-coloured mounds',
    images: ['/assets/backgrounds/chocolatehills.jpg', '/assets/backgrounds/chocolatehills2.jpg'],
    description:
      "On the island of Bohol, more than 1,200 nearly-symmetrical conical hills cover 50 square kilometres of rolling country. They're a textbook case of tropical karst: ancient marine limestone, lifted by tectonics, then dissolved into dome-shaped 'mogotes' by millions of years of monsoon rain. Their grassy skin turns cocoa brown each dry season, which is where the name comes from.",
    facts: [
      { label: 'Island', value: 'Bohol, Philippines' },
      { label: 'Number', value: '1,200+ hills' },
      { label: 'Height', value: '30–120 m' },
      { label: 'Famous for', value: 'Brown dome hills' },
    ],
    sources: [
      { label: 'Wikipedia · Chocolate Hills', url: 'https://en.wikipedia.org/wiki/Chocolate_Hills' },
      { label: 'UNESCO Tentative List', url: 'https://whc.unesco.org/en/tentativelists/5024/' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Chocolate_Hills_overview.JPG' },
    ],
  },
  {
    id: 'mulafossur',
    name: 'Múlafossur',
    country: 'Faroe Islands',
    countryCode: 'FO',
    tagline: 'A waterfall straight into the Atlantic',
    images: ['/assets/backgrounds/gasadalur.jpg'],
    description:
      "On the western edge of Vágar island in the Faroes, the village of Gásadalur sits on a grassy shelf about a hundred metres above the sea. The Múlafossur stream runs off the edge of that shelf and drops roughly 30 metres straight into the North Atlantic. Until a road tunnel opened in 2004 the village's 25 houses were reachable only by boat or by hiking a steep mountain pass. The postman used to make the trip on foot.",
    facts: [
      { label: 'Island', value: 'Vágar, Faroe Islands' },
      { label: 'Drop', value: '~30 m' },
      { label: 'Village', value: 'Gásadalur (~25 houses)' },
      { label: 'Famous for', value: 'Waterfall into the sea' },
    ],
    sources: [
      { label: 'Visit Faroe Islands', url: 'https://visitfaroeislands.com/en/whatson/places/place/mulafossur-the-waterfall-in-gasadalur' },
      { label: 'Guide to Faroe Islands', url: 'https://guidetofaroeislands.fo/travel-faroe-islands/drive/mulafossur/' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:G%C3%A1sadalur_(51256491640).jpg' },
    ],
  },
];

const RECENT_LIMIT = Math.max(4, Math.floor(LOCATIONS.length / 2));
const recent = [];

function rememberPick(id, imageIndex) {
  recent.push(`${id}#${imageIndex}`);
  while (recent.length > RECENT_LIMIT) recent.shift();
}

function recentlyShownLocationIds() {

  const window = Math.max(2, Math.floor(LOCATIONS.length * 0.6));
  return new Set(
    recent.slice(-window).map((k) => k.split('#')[0])
  );
}

export function pickDefaultLocation() {
  const idx = LOCATIONS.findIndex((l) => l.id === 'vikbeach');
  const i = idx === -1 ? 0 : idx;
  const loc = LOCATIONS[i];
  rememberPick(loc.id, 0);
  return { ...loc, _imageIndex: 0, currentImage: loc.images[0] };
}

export function pickRandomLocation() {
  if (LOCATIONS.length === 0) return null;
  if (LOCATIONS.length === 1) return { ...LOCATIONS[0], _imageIndex: 0, currentImage: LOCATIONS[0].images[0] };

  const recentIds = recentlyShownLocationIds();
  const fresh = LOCATIONS.filter((l) => !recentIds.has(l.id));

  const pool = fresh.length > 0
    ? fresh
    : LOCATIONS.filter((l) => l.id !== recent[recent.length - 1]?.split('#')[0]);
  const loc = pool[Math.floor(Math.random() * pool.length)];

  const recentKeys = new Set(recent);
  const candidates = loc.images
    .map((_, i) => i)
    .filter((i) => !recentKeys.has(`${loc.id}#${i}`));
  const imageIndex = (candidates.length > 0 ? candidates : loc.images.map((_, i) => i))[
    Math.floor(Math.random() * Math.max(1, candidates.length || loc.images.length))
  ];

  rememberPick(loc.id, imageIndex);
  return { ...loc, _imageIndex: imageIndex, currentImage: loc.images[imageIndex] };
}

export function pickNextVariant(location) {
  if (!location || !location.images || location.images.length < 2) return location;
  const recentKeys = new Set(recent);
  const candidates = location.images
    .map((_, i) => i)
    .filter((i) => i !== location._imageIndex && !recentKeys.has(`${location.id}#${i}`));
  const idx = (candidates.length > 0 ? candidates : location.images.map((_, i) => i).filter((i) => i !== location._imageIndex))[
    Math.floor(Math.random() * Math.max(1, candidates.length || location.images.length - 1))
  ];
  rememberPick(location.id, idx);
  return { ...location, _imageIndex: idx, currentImage: location.images[idx] };
}

const preloaded = new Set();
export function preloadDynamicBackgrounds(paths, basePath = '') {
  if (typeof window === 'undefined') return;
  for (const p of paths) {
    if (!p || preloaded.has(p)) continue;
    preloaded.add(p);
    const img = new Image();
    img.src = (basePath || '') + p;
  }
}

export function preloadCandidates(currentLocation, count = 3) {
  const out = [];
  if (currentLocation?.images) {
    for (let i = 0; i < currentLocation.images.length; i++) {
      if (i !== currentLocation._imageIndex) out.push(currentLocation.images[i]);
    }
  }
  const recentIds = recentlyShownLocationIds();
  const others = LOCATIONS.filter((l) => l.id !== currentLocation?.id && !recentIds.has(l.id));

  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  for (const l of others.slice(0, count)) {
    if (l.images?.[0]) out.push(l.images[0]);
  }
  return out;
}

export default LOCATIONS;
