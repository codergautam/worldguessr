

const locations = [
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
    tagline: 'An open sea of grass',
    images: ['/assets/backgrounds/mongolia.jpg', '/assets/backgrounds/mongolia2.jpg'],
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
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Tal_des_Herlen_unterhalb_des_Steppe_Nomads_Tourist_Camps.jpg' },
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
  {
    id: 'lencois',
    name: 'Lençóis Maranhenses',
    country: 'Brazil',
    countryCode: 'BR',
    tagline: 'Dunes full of blue lagoons',
    images: ['/assets/backgrounds/lencois.jpg', '/assets/backgrounds/lencois2.jpg'],
    description:
      "Lençóis Maranhenses covers about 1,550 km² of northeastern Maranhão, where white dunes run up to 50 km inland from the Atlantic. The name means 'bedsheets of Maranhão', after the way the sand ripples like draped linen. It looks like a desert but it isn't one: the area gets around 1,200 mm of rain a year, and a layer of impermeable rock under the sand traps the water in thousands of clear pools between the dunes. The lagoons fill from January to June and turn turquoise and green, then mostly dry out later in the year. The park was created in 1981 and added to the UNESCO World Heritage list in 2024.",
    facts: [
      { label: 'Region', value: 'NE Maranhão' },
      { label: 'Area', value: '~1,550 km²' },
      { label: 'Lagoons fill', value: 'January–June' },
      { label: 'Famous for', value: 'Dunes with rain lagoons' },
    ],
    sources: [
      { label: 'Wikipedia · Lençóis Maranhenses NP', url: 'https://en.wikipedia.org/wiki/Len%C3%A7%C3%B3is_Maranhenses_National_Park' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Parque_Nacional_dos_Len%C3%A7%C3%B3is_Maranhenses_Paulo_Cattelan_%2803%29.jpg' },
    ],
  },
  {
    id: 'uyuni',
    name: 'Salar de Uyuni',
    country: 'Bolivia',
    countryCode: 'BO',
    tagline: "The world's largest salt mirror",
    images: ['/assets/backgrounds/uyuni.jpg', '/assets/backgrounds/uyuni2.jpg'],
    description:
      "At 10,582 km², the Salar de Uyuni in southwest Bolivia is the largest salt flat on Earth. It formed when a chain of prehistoric lakes dried up and left a salt crust several metres thick, sitting at 3,663 m in the Andes. The surface is almost perfectly level, varying by less than a metre across its entire width. After rain a shallow film of water turns it into a vast mirror that reflects the sky, an effect that can stretch 100 km. The flat also holds a large share of the world's lithium, and a rocky outcrop near its centre, Isla Incahuasi, is covered in giant cactus.",
    facts: [
      { label: 'Region', value: 'Potosí, Bolivia' },
      { label: 'Area', value: '10,582 km²' },
      { label: 'Elevation', value: '3,663 m' },
      { label: 'Famous for', value: 'Mirror-like salt flat' },
    ],
    sources: [
      { label: 'Wikipedia · Salar de Uyuni', url: 'https://en.wikipedia.org/wiki/Salar_de_Uyuni' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Salar_de_Uyuni%2C_Bolivia%2C_2016-02-04%2C_DD_10-12_HDR.JPG' },
    ],
  },
  {
    id: 'torresdelpaine',
    name: 'Torres del Paine',
    country: 'Chile',
    countryCode: 'CL',
    tagline: 'Granite towers of Patagonia',
    images: ['/assets/backgrounds/torresdelpaine.jpg', '/assets/backgrounds/torresdelpaine2.jpg'],
    description:
      "Torres del Paine is a national park in Chilean Patagonia, named for the three granite towers that rise to around 2,500 m at its heart. The towers and the neighbouring Cuernos were shaped from a band of pale granite that pushed up into older dark rock, then was carved by glaciers into spires and horns. Below them sit turquoise lakes fed by the Grey, Dickson and Tyndall glaciers, part of the Southern Patagonian Ice Field. Guanacos graze the grasslands and pumas hunt them, while condors ride the wind overhead. The park opened in 1959 and became a UNESCO Biosphere Reserve in 1978.",
    facts: [
      { label: 'Region', value: 'Magallanes, Chile' },
      { label: 'Towers', value: '~2,500 m' },
      { label: 'Established', value: '1959' },
      { label: 'Famous for', value: 'Granite towers & glaciers' },
    ],
    sources: [
      { label: 'Wikipedia · Torres del Paine NP', url: 'https://en.wikipedia.org/wiki/Torres_del_Paine_National_Park' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:A_view_towards_Torres_Del_Paine.jpg' },
    ],
  },
  {
    id: 'huacachina',
    name: 'Huacachina',
    country: 'Peru',
    countryCode: 'PE',
    tagline: 'A village around a desert lagoon',
    images: ['/assets/backgrounds/huacachina.jpg'],
    description:
      "Huacachina is a tiny oasis village built around a natural lagoon in the desert near Ica, in southern Peru. Fewer than 200 people live there year-round, ringed by sand dunes that climb several hundred metres. Local legend says the lake formed from the mirror of a fleeing princess, and its water and mud have long been thought to ease ailments like arthritis. The lagoon nearly vanished in the 2000s as nearby wells drew down the groundwater, and water is now pumped in to keep it full. Visitors come to ride dune buggies and sandboard down the surrounding slopes.",
    facts: [
      { label: 'Region', value: 'Ica, Peru' },
      { label: 'Population', value: '~100' },
      { label: 'Setting', value: 'Desert oasis' },
      { label: 'Famous for', value: 'Lagoon ringed by dunes' },
    ],
    sources: [
      { label: 'Wikipedia · Huacachina', url: 'https://en.wikipedia.org/wiki/Huacachina' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Oasis_de_Huacachina%2C_Ica%2C_Per%C3%BA%2C_2015-07-29%2C_DD_18.JPG' },
    ],
  },
  {
    id: 'lofoten',
    name: 'Lofoten',
    country: 'Norway',
    countryCode: 'NO',
    tagline: 'Arctic peaks above the sea',
    images: ['/assets/backgrounds/lofoten.jpg', '/assets/backgrounds/lofoten2.jpg'],
    description:
      "Lofoten is an archipelago in northern Norway that lies well above the Arctic Circle, yet stays unusually mild for its latitude because of the warm Atlantic current offshore. From a distance the islands look like a single wall of rock about 100 km long, with peaks rising straight out of the water to over 1,100 m. Small fishing villages of red and yellow rorbu cabins line the shores, and the islands have been a centre of winter cod fishing for more than a thousand years. The catch is still hung on wooden racks to dry into stockfish. In summer the sun stays up around the clock, and in winter the northern lights play over the dark.",
    facts: [
      { label: 'County', value: 'Nordland, Norway' },
      { label: 'Highest peak', value: '1,161 m' },
      { label: 'Location', value: 'Above the Arctic Circle' },
      { label: 'Famous for', value: 'Peaks & fishing villages' },
    ],
    sources: [
      { label: 'Wikipedia · Lofoten', url: 'https://en.wikipedia.org/wiki/Lofoten' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Sakris%C3%B8y_Lofoten_Islands_tunliweb_landscape.jpg' },
    ],
  },
  {
    id: 'quiraing',
    name: 'The Quiraing',
    country: 'United Kingdom',
    countryCode: 'GB',
    tagline: 'A living landslip on Skye',
    images: ['/assets/backgrounds/quiraing.jpg', '/assets/backgrounds/quiraing2.jpg'],
    description:
      "The Quiraing is the northernmost stretch of the Trotternish ridge on the Isle of Skye, in the Scottish Highlands. It formed when a thick cap of hard basalt lava settled over softer rock and slowly crushed it, setting off a chain of landslides that left hidden plateaus and jagged pinnacles. It is the only part of the ridge still moving, and the road across it has to be repaired most years. Its best-known features carry old names: the Needle, a 37 m spike of rock, the Table, a flat green shelf hidden in a hollow, and the Prison, a block shaped like a castle keep. The Norse-derived name means roughly 'round fold', from the days when livestock were hidden here from raiders.",
    facts: [
      { label: 'Location', value: 'Isle of Skye' },
      { label: 'The Needle', value: '37 m' },
      { label: 'Status', value: 'Active landslip' },
      { label: 'Famous for', value: 'Pinnacles & hidden plateaus' },
    ],
    sources: [
      { label: 'Wikipedia · Quiraing', url: 'https://en.wikipedia.org/wiki/Quiraing' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Quiraing_Isle_of_Skye.jpg' },
    ],
  },
  {
    id: 'meteora',
    name: 'Meteora',
    country: 'Greece',
    countryCode: 'GR',
    tagline: 'Monasteries on the rocks',
    images: ['/assets/backgrounds/meteora.jpg', '/assets/backgrounds/meteora2.jpg'],
    description:
      "Meteora is a cluster of sandstone and conglomerate pillars that rise out of the plain of Thessaly in central Greece, near the town of Kalambaka. The rock formed from sediment laid down in an ancient river delta, then was lifted, split along fault lines and weathered into towers. From the late 14th century Orthodox monks climbed these columns and built monasteries on top, reaching twenty-four at the peak. Six are still standing today, four of them active. For centuries the only way up was by removable ladders or by being hauled in a net, until steps were cut into the rock in the 1920s. The site has been on the UNESCO World Heritage list since 1988.",
    facts: [
      { label: 'Region', value: 'Thessaly, Greece' },
      { label: 'Monasteries', value: '6 standing' },
      { label: 'Built', value: '14th–16th c.' },
      { label: 'Famous for', value: 'Cliff-top monasteries' },
    ],
    sources: [
      { label: 'Wikipedia · Meteora', url: 'https://en.wikipedia.org/wiki/Meteora' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Meteora%2C_27.jpg' },
    ],
  },
  {
    id: 'plitvice',
    name: 'Plitvice Lakes',
    country: 'Croatia',
    countryCode: 'HR',
    tagline: 'Sixteen lakes in terraced steps',
    images: ['/assets/backgrounds/plitvice.jpg', '/assets/backgrounds/plitvice2.jpg'],
    description:
      "Plitvice Lakes is the oldest and largest national park in Croatia, set up in 1949 in the karst hills between Zagreb and the coast. Sixteen lakes are strung down a valley in terraces, each spilling into the next over barriers of travertine. The barriers are alive: mineral-rich water deposits calcium carbonate onto moss and plants, and the rock grows about a centimetre a year, slowly raising the dams and shifting the waterfalls. Depending on the light and the minerals, the water shows in shades of turquoise, green and grey. The park was named a UNESCO World Heritage Site in 1979 and drains into the Korana river.",
    facts: [
      { label: 'Country', value: 'Croatia' },
      { label: 'Lakes', value: '16' },
      { label: 'Established', value: '1949' },
      { label: 'Famous for', value: 'Travertine lakes & falls' },
    ],
    sources: [
      { label: 'Wikipedia · Plitvice Lakes NP', url: 'https://en.wikipedia.org/wiki/Plitvice_Lakes_National_Park' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Waterfalls_at_Plitvice_Lakes_%2846319402272%29.jpg' },
    ],
  },
  {
    id: 'verdon',
    name: 'Verdon Gorge',
    country: 'France',
    countryCode: 'FR',
    tagline: 'A turquoise canyon in Provence',
    images: ['/assets/backgrounds/verdon.jpg', '/assets/backgrounds/verdon2.jpg'],
    description:
      "The Verdon Gorge cuts through the limestone of Provence in southeastern France, running about 25 km and dropping as much as 700 m, which makes it one of the deepest canyons in Europe. It is named for the Verdon river, whose striking turquoise-green colour comes from glacial meltwater and the fine rock flour carried in the current. The river worked down through layers of Triassic, Jurassic and Cretaceous rock, with the gorge widening during the ice ages. At its western end the water flows into the Lac de Sainte-Croix, a reservoir held back by a dam. The walls hold more than 1,500 climbing routes and draw climbers from across the world.",
    facts: [
      { label: 'Region', value: 'Provence, France' },
      { label: 'Length', value: '~25 km' },
      { label: 'Depth', value: 'up to 700 m' },
      { label: 'Famous for', value: 'Turquoise river canyon' },
    ],
    sources: [
      { label: 'Wikipedia · Verdon Gorge', url: 'https://en.wikipedia.org/wiki/Verdon_Gorge' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Verdon_Gorge_8.jpg' },
    ],
  },
  {
    id: 'stokksnes',
    name: 'Vestrahorn',
    country: 'Iceland',
    countryCode: 'IS',
    tagline: 'A black-sand mountain mirror',
    images: ['/assets/backgrounds/stokksnes.jpg', '/assets/backgrounds/stokksnes2.jpg'],
    description:
      "Vestrahorn is a steep, sawtoothed mountain on the Stokksnes headland in southeast Iceland, near the town of Höfn. It rises about 454 m and is one of the few Icelandic mountains made of gabbro, a dark coarse rock that gives its face an almost black cast. The peak is around ten million years old. At its foot lies a beach of black volcanic sand, and when the tide goes out the wet sand turns into a mirror that doubles the ridgeline above it. The land is privately owned, and a small café by the road manages access to the beach.",
    facts: [
      { label: 'Region', value: 'SE Iceland' },
      { label: 'Height', value: '454 m' },
      { label: 'Rock', value: 'Gabbro' },
      { label: 'Famous for', value: 'Mountain on a black beach' },
    ],
    sources: [
      { label: 'Guide to Iceland · Vestrahorn', url: 'https://guidetoiceland.is/travel-iceland/drive/vestrahorn' },
      { label: 'Perlan · Vestrahorn & Stokksnes', url: 'https://perlan.is/articles/vestrahorn-stokksnes-iceland' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Vestrahorn_and_Stokksnes_beach_in_Iceland.jpg' },
    ],
  },
  {
    id: 'baobab',
    name: 'Avenue of the Baobabs',
    country: 'Madagascar',
    countryCode: 'MG',
    tagline: 'A road lined with giant trees',
    images: ['/assets/backgrounds/baobab.jpg', '/assets/backgrounds/baobab2.jpg'],
    description:
      "The Avenue of the Baobabs is a dirt road near Morondava, on the west coast of Madagascar, lined with a grove of around 25 Grandidier's baobabs. The trees stand up to 30 m tall, with thick smooth trunks and a small crown of branches that look almost upside down. They are the last of a dense tropical forest that once covered the area; as the land was cleared for rice paddies and fields, people left the baobabs standing. Some are several centuries old. The grove was given protected status in 2007, though the trees are still threatened by fire and runoff from the surrounding farms.",
    facts: [
      { label: 'Region', value: 'Menabe, Madagascar' },
      { label: 'Trees', value: '~25' },
      { label: 'Height', value: 'up to 30 m' },
      { label: 'Famous for', value: 'Avenue of baobabs' },
    ],
    sources: [
      { label: 'Wikipedia · Avenue of the Baobabs', url: 'https://en.wikipedia.org/wiki/Avenue_of_the_Baobabs' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:All%C3%A9e_des_baobabs_Morondava_Madagascar.jpg' },
    ],
  },
  {
    id: 'chefchaouen',
    name: 'Chefchaouen',
    country: 'Morocco',
    countryCode: 'MA',
    tagline: 'The blue town of the Rif',
    images: ['/assets/backgrounds/chefchaouen.jpg'],
    description:
      "Chefchaouen sits about 600 m up in the Rif Mountains of northern Morocco. It was founded in 1471 as a fortress against Portuguese raids and later took in Muslims and Jews fleeing Spain. The old town is famous for its walls and lanes washed in shades of blue, a custom whose origin is debated: explanations range from a Jewish tradition, to keeping mosquitoes away, to simply staying cool and drawing visitors. The name comes from a Berber phrase meaning 'look at the horns', a reference to the twin peaks above the town. It is widely known as Morocco's blue pearl.",
    facts: [
      { label: 'Region', value: 'Rif Mountains' },
      { label: 'Founded', value: '1471' },
      { label: 'Elevation', value: '~600 m' },
      { label: 'Famous for', value: 'Blue-painted medina' },
    ],
    sources: [
      { label: 'Wikipedia · Chefchaouen', url: 'https://en.wikipedia.org/wiki/Chefchaouen' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Morocco_-_View_of_Chefchaouen.jpg' },
    ],
  },
  {
    id: 'zhangyedanxia',
    name: 'Zhangye Danxia',
    country: 'China',
    countryCode: 'CN',
    tagline: 'Striped rainbow hills',
    images: ['/assets/backgrounds/zhangyedanxia.jpg', '/assets/backgrounds/zhangyedanxia2.jpg'],
    description:
      "The Zhangye Danxia landform lies in the foothills of the Qilian Mountains in Gansu province, in northwestern China. Its hills are banded in red, orange, yellow and green, the colours of sandstone and minerals laid down in flat layers over more than 20 million years. The same tectonic collision that raised the Himalayas tilted these beds on their side, and wind and water then carved them into ridges and pillars, exposing the stripes. The colours come out strongest in low light or just after rain. The site covers about 320 km² and became a UNESCO Global Geopark in 2019.",
    facts: [
      { label: 'Province', value: 'Gansu, China' },
      { label: 'Area', value: '~320 km²' },
      { label: 'Layers', value: '20M+ years old' },
      { label: 'Famous for', value: 'Rainbow-striped rock' },
    ],
    sources: [
      { label: 'Wikipedia · Zhangye National Geopark', url: 'https://en.wikipedia.org/wiki/Zhangye_National_Geopark' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Linze%2C_Zhangye%2C_Gansu%2C_China_-_panoramio_%284%29.jpg' },
    ],
  },
  {
    id: 'bagan',
    name: 'Bagan',
    country: 'Myanmar',
    countryCode: 'MM',
    tagline: 'A plain of ancient temples',
    images: ['/assets/backgrounds/bagan.jpg', '/assets/backgrounds/bagan2.jpg'],
    description:
      "Bagan, on the Irrawaddy river in central Myanmar, was the capital of the Pagan Kingdom, the first state to unite the lands that became modern Myanmar. Between the 11th and 13th centuries its rulers and people built more than 10,000 temples, pagodas and monasteries across the plain. Around 2,000 of them still stand, their brick spires spread over an archaeological zone of some 5,000 hectares. Earthquakes have damaged many over the centuries, including a strong one in 2016. The site was added to the UNESCO World Heritage list in 2019.",
    facts: [
      { label: 'Region', value: 'Mandalay, Myanmar' },
      { label: 'Temples', value: '~2,000 remain' },
      { label: 'Built', value: '11th–13th c.' },
      { label: 'Famous for', value: 'Temple-covered plain' },
    ],
    sources: [
      { label: 'Wikipedia · Bagan', url: 'https://en.wikipedia.org/wiki/Bagan' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Old_Bagan%2C_Myanmar%2C_Landscape_of_ancient_Bagan_city.jpg' },
    ],
  },
  {
    id: 'bromo',
    name: 'Mount Bromo',
    country: 'Indonesia',
    countryCode: 'ID',
    tagline: 'A volcano in a sea of sand',
    images: ['/assets/backgrounds/bromo.jpg', '/assets/backgrounds/bromo2.jpg'],
    description:
      "Mount Bromo is an active volcano in East Java, Indonesia, standing 2,329 m inside the much larger Tengger caldera. It is not the highest peak of the Tengger massif, but it is the most active and the best known. Its cone rises from a flat plain of volcanic ash called the Sea of Sand, with the taller Mount Semeru smoking on the horizon behind it. The Tenggerese people who live around it hold the yearly Yadnya Kasada festival, climbing to the crater to throw in offerings of crops and livestock. The rim is a popular place to watch the sun come up over the caldera.",
    facts: [
      { label: 'Region', value: 'East Java' },
      { label: 'Height', value: '2,329 m' },
      { label: 'Setting', value: 'Tengger caldera' },
      { label: 'Famous for', value: 'Cone in a sand sea' },
    ],
    sources: [
      { label: 'Wikipedia · Mount Bromo', url: 'https://en.wikipedia.org/wiki/Mount_Bromo' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Bromo%2C_Semeru%2C_Batok_-_view_of_Tengger_caldera%2C_East_Java%2C_Indonesia%2C_20220820_0709_9507.jpg' },
    ],
  },
  {
    id: 'cappadocia',
    name: 'Cappadocia',
    country: 'Turkey',
    countryCode: 'TR',
    tagline: 'Fairy chimneys and cave towns',
    images: ['/assets/backgrounds/cappadocia.jpg', '/assets/backgrounds/cappadocia2.jpg'],
    description:
      "Cappadocia is a region of central Turkey known for its fairy chimneys, tall cones of soft rock topped by harder caps. The landscape was built from thick layers of volcanic ash erupted between about nine and three million years ago, which hardened into tuff and was then sculpted by wind and water. For centuries people carved homes, churches and whole underground cities such as Derinkuyu into the rock, used as refuges in times of raids. The Göreme valley holds dozens of rock-cut churches with painted frescoes, and the Göreme rock sites were listed by UNESCO in 1985. At dawn the valleys fill with hot-air balloons.",
    facts: [
      { label: 'Region', value: 'Nevşehir, Turkey' },
      { label: 'Rock', value: 'Volcanic tuff' },
      { label: 'UNESCO', value: '1985' },
      { label: 'Famous for', value: 'Fairy chimneys' },
    ],
    sources: [
      { label: 'Wikipedia · Cappadocia', url: 'https://en.wikipedia.org/wiki/Cappadocia' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:G%C3%B6reme_Valley_in_Cappadocia_edit1.jpg' },
    ],
  },
  {
    id: 'tsingy',
    name: 'Tsingy de Bemaraha',
    country: 'Madagascar',
    countryCode: 'MG',
    tagline: 'A forest of stone needles',
    images: ['/assets/backgrounds/tsingy.jpg', '/assets/backgrounds/tsingy2.jpg'],
    description:
      "Tsingy de Bemaraha is a reserve on the west side of Madagascar, in the Melaky region, named for its forest of razor-sharp limestone spikes. The word tsingy means roughly 'where one cannot walk barefoot'. The pinnacles formed as rainwater slowly dissolved a thick bed of Jurassic limestone along its cracks, cutting it down into blades, ridges, caves and deep canyons. Lemurs and rare birds live in the gorges and patches of forest wedged between the rock. The strict reserve covers about 1,520 km² and was made a UNESCO World Heritage Site in 1990.",
    facts: [
      { label: 'Region', value: 'Melaky, Madagascar' },
      { label: 'Area', value: '~1,520 km²' },
      { label: 'UNESCO', value: '1990' },
      { label: 'Famous for', value: 'Limestone pinnacle forest' },
    ],
    sources: [
      { label: 'Wikipedia · Tsingy de Bemaraha', url: 'https://en.wikipedia.org/wiki/Tsingy_de_Bemaraha_Strict_Nature_Reserve' },
      { label: 'UNESCO · Tsingy de Bemaraha', url: 'https://whc.unesco.org/en/list/494/' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Relief_karstique%2C_Parc_Tsingy_de_Bemaraha%2C_Madagascar.jpg' },
    ],
  },
  {
    id: 'transfagarasan',
    name: 'Transfăgărășan',
    country: 'Romania',
    countryCode: 'RO',
    tagline: "Romania's road over the Făgăraș",
    images: ['/assets/backgrounds/transfagarasan.jpg'],
    description:
      "The Transfăgărășan, signed DN7C, climbs across the Făgăraș Mountains in central Romania and tops out at 2,042 m, the second-highest paved pass in the country. It was built between 1970 and 1974 on the orders of Nicolae Ceaușescu, partly as a military route after the 1968 Soviet invasion of Czechoslovakia, and crews used around six million kilograms of dynamite to cut it through the rock. Near the top it runs past Bâlea Lake and through the 884 m Bâlea Tunnel, the longest road tunnel in Romania. Snow keeps it shut from late October until June most years. In 2009 the Top Gear presenter Jeremy Clarkson called it the best driving road in the world.",
    facts: [
      { label: 'Country', value: 'Romania' },
      { label: 'Summit', value: '2,042 m' },
      { label: 'Built', value: '1970–1974' },
      { label: 'Famous for', value: 'Hairpin mountain road' },
    ],
    sources: [
      { label: 'Wikipedia · Transfăgărășan', url: 'https://en.wikipedia.org/wiki/Transf%C4%83g%C4%83r%C4%83%C8%99an' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Romania_Transfagarasan.jpg' },
    ],
  },
  {
    id: 'greatoceanroad',
    name: 'Great Ocean Road',
    country: 'Australia',
    countryCode: 'AU',
    tagline: 'A coast road built as a war memorial',
    images: ['/assets/backgrounds/greatoceanroad.jpg'],
    description:
      "The Great Ocean Road runs about 240 km along the southeast coast of Victoria, Australia, between Torquay and Allansford. It was built by roughly 3,000 soldiers returning from the First World War, working between 1919 and 1932, and is dedicated to the men who died in the war, which makes it the largest war memorial in the world. The route winds past surf beaches, rainforest and steep cliffs, including the Twelve Apostles, a row of limestone stacks left standing offshore as the sea cut back the coast. It was added to the Australian National Heritage List in 2011.",
    facts: [
      { label: 'State', value: 'Victoria, Australia' },
      { label: 'Length', value: '~240 km' },
      { label: 'Built', value: '1919–1932' },
      { label: 'Famous for', value: 'Coast road & Twelve Apostles' },
    ],
    sources: [
      { label: 'Wikipedia · Great Ocean Road', url: 'https://en.wikipedia.org/wiki/Great_Ocean_Road' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:GreatOceanRoad.jpg' },
    ],
  },
  {
    id: 'chapmanspeak',
    name: "Chapman's Peak Drive",
    country: 'South Africa',
    countryCode: 'ZA',
    tagline: 'A road carved into the cliff',
    images: ['/assets/backgrounds/chapmanspeak.jpg', '/assets/backgrounds/chapmanspeak2.jpg'],
    description:
      "Chapman's Peak Drive links Hout Bay and Noordhoek on the Atlantic side of the Cape Peninsula, near Cape Town. The roughly 9 km route has 114 bends and was cut straight into the cliff face between 1915 and 1922, running on a ledge between the mountain above and the ocean below. It follows the line where the pale Cape Granite at the base meets the sandstone that caps Table Mountain, a junction that interests geologists. Rockfalls forced a long closure in the 1990s, and the road reopened in 2005 as a toll route fitted with nets and sheds to catch loose stone.",
    facts: [
      { label: 'Location', value: 'Cape Peninsula, ZA' },
      { label: 'Length', value: '~9 km' },
      { label: 'Bends', value: '114' },
      { label: 'Famous for', value: 'Cliff-edge coastal road' },
    ],
    sources: [
      { label: "Wikipedia · Chapman's Peak", url: 'https://en.wikipedia.org/wiki/Chapman%27s_Peak' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Chapmans_Peak_Drive_2.jpg' },
    ],
  },
  {
    id: 'furkapass',
    name: 'Furka Pass',
    country: 'Switzerland',
    countryCode: 'CH',
    tagline: 'A high alpine pass road',
    images: ['/assets/backgrounds/furkapass.jpg'],
    description:
      "The Furka Pass crosses the Swiss Alps at 2,429 m, linking Gletsch in Valais with Realp in Uri, and is among the highest paved passes in the country. Snow closes it through the winter. The road climbs in tight hairpins past the Rhône Glacier, the source of the river Rhône, where a tunnel used to be cut into the ice each summer for visitors. A stretch of the pass appears in the 1964 James Bond film Goldfinger, and part of it is now signposted as the James Bond Strasse.",
    facts: [
      { label: 'Cantons', value: 'Valais & Uri' },
      { label: 'Summit', value: '2,429 m' },
      { label: 'Open', value: 'Summer only' },
      { label: 'Famous for', value: 'Hairpin alpine pass' },
    ],
    sources: [
      { label: 'Wikipedia · Furka Pass', url: 'https://en.wikipedia.org/wiki/Furka_Pass' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Furka_Pass-003.jpg' },
    ],
  },
  {
    id: 'dades',
    name: 'Dades Gorge',
    country: 'Morocco',
    countryCode: 'MA',
    tagline: 'Switchbacks through red rock',
    images: ['/assets/backgrounds/dades.jpg', '/assets/backgrounds/dades2.jpg'],
    description:
      "The Dades Gorge lies on the southern side of Morocco's High Atlas, where the Dades river has cut down through red sandstone and limestone on its way toward the Sahara. The walls stand between 200 and 500 m high, carved from rock that formed when the area lay under a sea full of coral reefs, then was lifted as the Atlas Mountains rose. The most photographed stretch is a road that doubles back on itself in tight switchbacks to climb the canyon wall. Earthen kasbahs and groves of almond and palm trees line the valley floor below.",
    facts: [
      { label: 'Region', value: 'High Atlas, Morocco' },
      { label: 'Walls', value: '200–500 m' },
      { label: 'River', value: 'Dades' },
      { label: 'Famous for', value: 'Switchback gorge road' },
    ],
    sources: [
      { label: 'Wikipedia · Dadès Gorges', url: 'https://en.wikipedia.org/wiki/Dades_Gorges' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:The_zigzagging_road_of_the_Dades_Gorge_in_southern_Morocco.jpg' },
    ],
  },
  {
    id: 'guanajuato',
    name: 'Guanajuato',
    country: 'Mexico',
    countryCode: 'MX',
    tagline: 'A silver city in a ravine',
    images: ['/assets/backgrounds/guanajuato.jpg', '/assets/backgrounds/guanajuato2.jpg'],
    description:
      "Guanajuato is the capital of the Mexican state of the same name, built in a narrow ravine at about 2,045 m in the central highlands. Founded in 1548, it grew rich on silver, and the nearby Valenciana mine alone produced a large share of the world's silver over more than two centuries. Because the valley is so tight, the streets are narrow and winding, many of them stairways or tunnels that run partly underground. Houses painted in strong colours climb the hillsides above the old centre. The historic town and its mines were named a UNESCO World Heritage Site in 1988.",
    facts: [
      { label: 'Region', value: 'Central Mexico' },
      { label: 'Founded', value: '1548' },
      { label: 'Elevation', value: '~2,045 m' },
      { label: 'Famous for', value: 'Colourful streets & silver' },
    ],
    sources: [
      { label: 'Wikipedia · Guanajuato City', url: 'https://en.wikipedia.org/wiki/Guanajuato_City' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:View_of_guanajuato_city.jpg' },
    ],
  },
  {
    id: 'cinqueterre',
    name: 'Cinque Terre',
    country: 'Italy',
    countryCode: 'IT',
    tagline: 'Five villages on the cliffs',
    images: ['/assets/backgrounds/cinqueterre.jpg', '/assets/backgrounds/cinqueterre2.jpg'],
    description:
      "Cinque Terre, meaning 'five lands', is a stretch of the Ligurian coast in northwestern Italy made up of five old villages: Monterosso al Mare, Vernazza, Corniglia, Manarola and Riomaggiore. Their tall houses are painted in warm colours and stacked on cliffs above the sea. Behind them the slopes are cut into terraces held up by dry-stone walls, worked for centuries to grow grapes and olives. For most of their history the villages had no road between them and were reached only by footpaths, boat or train. The area became a UNESCO World Heritage Site in 1997 and a national park in 1999.",
    facts: [
      { label: 'Region', value: 'Liguria, Italy' },
      { label: 'Villages', value: '5' },
      { label: 'UNESCO', value: '1997' },
      { label: 'Famous for', value: 'Cliffside coloured houses' },
    ],
    sources: [
      { label: 'Wikipedia · Cinque Terre', url: 'https://en.wikipedia.org/wiki/Cinque_Terre' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Manarola_NW_Cinque_Terre_Sep23_A7C_07233.jpg' },
    ],
  },
  {
    id: 'kotor',
    name: 'Kotor',
    country: 'Montenegro',
    countryCode: 'ME',
    tagline: 'A walled town on the bay',
    images: ['/assets/backgrounds/kotor.jpg'],
    description:
      "Kotor sits at the head of the Bay of Kotor, a deep, winding inlet of the Adriatic in Montenegro that is often described as a fjord, though it is really a ria, a drowned river canyon. The walled old town keeps the Venetian architecture of the four centuries when the city was ruled by Venice, between 1420 and 1797. Stone defensive walls run for about 4.5 km and climb the mountain behind the town to the fortress of San Giovanni, around 260 m above the rooftops. The bay and its surroundings were named a UNESCO World Heritage Site in 1979.",
    facts: [
      { label: 'Country', value: 'Montenegro' },
      { label: 'Walls', value: '~4.5 km' },
      { label: 'Venetian rule', value: '1420–1797' },
      { label: 'Famous for', value: 'Walled town & bay' },
    ],
    sources: [
      { label: 'Wikipedia · Kotor', url: 'https://en.wikipedia.org/wiki/Kotor' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Bay_of_Kotor_3.jpg' },
    ],
  },
  {
    id: 'glencoe',
    name: 'Glen Coe',
    country: 'United Kingdom',
    countryCode: 'GB',
    tagline: "Scotland's most famous glen",
    images: ['/assets/backgrounds/glencoe.jpg', '/assets/backgrounds/glencoe2.jpg'],
    description:
      "Glen Coe is a steep-sided valley in the Scottish Highlands, about 12 km long with a narrow floor. It was shaped twice over, first by a collapsed supervolcano some 420 million years ago, then by glaciers that ground it into a U-shaped valley before the ice melted around 10,000 years ago. Peaks such as Bidean nam Bian and the rock buttresses known as the Three Sisters rise on either side. The glen is also remembered for the massacre of 1692, when government soldiers killed members of the MacDonald clan who had given them shelter. Its scenery has appeared in films including Skyfall and the Harry Potter series.",
    facts: [
      { label: 'Region', value: 'Highlands, Scotland' },
      { label: 'Length', value: '~12 km' },
      { label: 'Massacre', value: '1692' },
      { label: 'Famous for', value: 'Glacial mountain valley' },
    ],
    sources: [
      { label: 'Wikipedia · Glen Coe', url: 'https://en.wikipedia.org/wiki/Glen_Coe' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Glen_Coe_Mountains_Lost_Valley_%2867155511%29.jpeg' },
    ],
  },
  {
    id: 'dolomites',
    name: 'The Dolomites',
    country: 'Italy',
    countryCode: 'IT',
    tagline: 'Pale peaks that glow at sunset',
    images: ['/assets/backgrounds/dolomites.jpg'],
    description:
      "The Dolomites are a range of pale, jagged peaks in northeastern Italy, part of the Southern Limestone Alps. They are made largely of dolomite, a rock named after the French mineralogist Déodat de Dolomieu, and the stone began as a coral reef and seabed before being lifted into mountains. The highest summit is the Marmolada at 3,343 m, and the three towers of the Tre Cime di Lavaredo are among the most recognisable. At sunrise and sunset the rock takes on a pink and violet glow that locals call the enrosadira. The range was named a UNESCO World Heritage Site in 2009.",
    facts: [
      { label: 'Region', value: 'NE Italy' },
      { label: 'Highest', value: 'Marmolada 3,343 m' },
      { label: 'UNESCO', value: '2009' },
      { label: 'Famous for', value: 'Pink alpenglow peaks' },
    ],
    sources: [
      { label: 'Wikipedia · Dolomites', url: 'https://en.wikipedia.org/wiki/Dolomites' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Valle_della_Rienza_and_Tre_Cime_di_Lavaredo_from_Alpe_Specie%2C_Val_Pusteria%2C_Trentino-Alto_Adige%2C_Italy%2C_2025_October.jpg' },
    ],
  },
  {
    id: 'connemara',
    name: 'Connemara',
    country: 'Ireland',
    countryCode: 'IE',
    tagline: 'Bogs, lakes and the Twelve Bens',
    images: ['/assets/backgrounds/connemara.jpg'],
    description:
      "Connemara is a region on the Atlantic coast of County Galway, in the west of Ireland. It is a rough, open landscape of blanket bog, small lakes, peninsulas and mountains, with the quartzite cones of the Twelve Bens at its heart. Much of the ground is too wet and stony to farm, which has helped keep the land wild. It is the largest Gaeltacht in the country, an area where Irish is still spoken every day, with something like twenty thousand native speakers. It also gives its name to the Connemara pony and to the green Connemara marble quarried nearby.",
    facts: [
      { label: 'Region', value: 'Co. Galway, Ireland' },
      { label: 'Mountains', value: 'Twelve Bens' },
      { label: 'Language', value: 'Irish (Gaeltacht)' },
      { label: 'Famous for', value: 'Wild bog & mountains' },
    ],
    sources: [
      { label: 'Wikipedia · Connemara', url: 'https://en.wikipedia.org/wiki/Connemara' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Connemara_National_Park%2C_Galway%2C_Ireland_-_2025_2.jpg' },
    ],
  },
  {
    id: 'setecidades',
    name: 'Sete Cidades',
    country: 'Portugal',
    countryCode: 'PT',
    tagline: 'Twin crater lakes in the Azores',
    images: ['/assets/backgrounds/setecidades.jpg', '/assets/backgrounds/setecidades2.jpg'],
    description:
      "Sete Cidades is a large volcanic crater near the western end of São Miguel, the main island of the Azores. The caldera, about 5 km across, formed when the volcano collapsed after past eruptions, and it now holds two lakes joined by a narrow channel under a small bridge. One is called Lagoa Azul, the blue lake, and the other Lagoa Verde, the green lake, and they take on different colours in the light even though they are a single body of water. Together they are the largest freshwater lake in the Azores. A local legend explains the colours as the tears of a princess and a shepherd parted by her father, her blue eyes and his green.",
    facts: [
      { label: 'Island', value: 'São Miguel, Azores' },
      { label: 'Caldera', value: '~5 km wide' },
      { label: 'Lakes', value: 'Blue & green' },
      { label: 'Famous for', value: 'Twin crater lakes' },
    ],
    sources: [
      { label: 'Wikipedia · Lagoa das Sete Cidades', url: 'https://en.wikipedia.org/wiki/Lagoa_das_Sete_Cidades' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Lagoa_das_Sete_Cidades%2C_S%C3%A3o_Miguel.jpg' },
    ],
  },
  {
    id: 'balirice',
    name: 'Bali Rice Terraces',
    country: 'Indonesia',
    countryCode: 'ID',
    tagline: 'Terraced paddies fed by subak',
    images: ['/assets/backgrounds/balirice.jpg', '/assets/backgrounds/balirice2.jpg'],
    description:
      "The rice terraces of Bali, in Indonesia, are watered by a cooperative system called subak that dates back to about the 9th century. Under it, farmers share the flow from springs and rivers through a network of canals, tunnels and small temples, guided by the Balinese idea of Tri Hita Karana, the balance between people, nature and the divine. The terraces step down the hillsides in curved green tiers, with the best known at Tegallalang near Ubud and at Jatiluwih. The subak landscape was named a UNESCO World Heritage Site in 2012.",
    facts: [
      { label: 'Island', value: 'Bali, Indonesia' },
      { label: 'System', value: 'Subak (9th c.)' },
      { label: 'UNESCO', value: '2012' },
      { label: 'Famous for', value: 'Green rice terraces' },
    ],
    sources: [
      { label: 'Wikipedia · Subak', url: 'https://en.wikipedia.org/wiki/Subak_(irrigation)' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Tegallalang_Rice_Terraces_Bali_1.jpg' },
    ],
  },
  {
    id: 'lapland',
    name: 'Finnish Lapland',
    country: 'Finland',
    countryCode: 'FI',
    tagline: 'Northern lights over the Arctic',
    images: ['/assets/backgrounds/lapland2.jpg'],
    description:
      "Lapland is the northernmost and largest region of Finland, much of it lying above the Arctic Circle. It is a sparsely settled land of forest, low rounded fells, lakes and long winters, with snow on the ground from about October into spring and temperatures that can fall to −40 °C. On clear, dark nights the aurora borealis appears here often, drawn out by the high latitude. The region is the homeland of the Sámi people, whose herders still move reindeer across the open country. In midwinter the sun barely rises, a spell known as kaamos, while in summer it stays up around the clock.",
    facts: [
      { label: 'Region', value: 'Northern Finland' },
      { label: 'Climate', value: 'Arctic, to −40 °C' },
      { label: 'Sky', value: 'Aurora borealis' },
      { label: 'Famous for', value: 'Northern lights' },
    ],
    sources: [
      { label: 'Wikipedia · Lapland (Finland)', url: 'https://en.wikipedia.org/wiki/Lapland_(Finland)' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Gentle_but_wide_green_aurora_display_over_Levi%2C_Kittil%C3%A4%2C_Lapland%2C_Finland%2C_2023_September_-_2.jpg' },
    ],
  },
  {
    id: 'atacama',
    name: 'Atacama Desert',
    country: 'Chile',
    countryCode: 'CL',
    tagline: 'The driest desert on Earth',
    images: ['/assets/backgrounds/atacama.jpg'],
    description:
      "The Atacama runs for about 1,600 km down northern Chile, hemmed in between the Pacific and the Andes. It is the driest non-polar desert in the world: parts average only a millimetre or two of rain a year, and some weather stations have never recorded any at all. Two mountain ranges block the moisture coming off both oceans, and the cold Humboldt current offshore keeps the air dry. The same clear, still skies and high altitude have made it one of the best places on Earth for astronomy, and large observatories like ALMA and the Very Large Telescope sit on its plateaus. Its salt-carved Valle de la Luna is so barren that Mars missions have tested their instruments there.",
    facts: [
      { label: 'Country', value: 'Northern Chile' },
      { label: 'Length', value: '~1,600 km' },
      { label: 'Rainfall', value: '1–3 mm / year' },
      { label: 'Famous for', value: 'Driest desert & dark skies' },
    ],
    sources: [
      { label: 'Wikipedia · Atacama Desert', url: 'https://en.wikipedia.org/wiki/Atacama_Desert' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Mirador_de_Cari_y_Licancabur.jpg' },
    ],
  },
  {
    id: 'spitzkoppe',
    name: 'Spitzkoppe',
    country: 'Namibia',
    countryCode: 'NA',
    tagline: 'Granite peaks in the Namib',
    images: ['/assets/backgrounds/spitzkoppe2.jpg'],
    description:
      "Spitzkoppe is a cluster of bald granite peaks rising out of the flat Namib Desert in western Namibia, between Usakos and Swakopmund. The highest stands about 1,728 m above sea level and around 670 m above the plain, which has earned it the nickname the Matterhorn of Namibia. The granite is more than 120 million years old and was uncovered as the softer rock around it wore away. San rock paintings survive in shelters among the boulders. With almost no towns or light for miles, the peaks are a favourite place to watch the night sky.",
    facts: [
      { label: 'Region', value: 'Namib Desert' },
      { label: 'Height', value: '1,728 m' },
      { label: 'Granite', value: '120M+ years old' },
      { label: 'Famous for', value: 'Granite peaks & stars' },
    ],
    sources: [
      { label: 'Wikipedia · Spitzkoppe', url: 'https://en.wikipedia.org/wiki/Spitzkoppe' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Spitzkoppe-Cr%C3%A9puscule_%281%29.jpg' },
    ],
  },
  {
    id: 'fitzroy',
    name: 'Monte Fitz Roy',
    country: 'Argentina',
    countryCode: 'AR',
    tagline: 'Patagonian spires at sunrise',
    images: ['/assets/backgrounds/fitzroy.jpg', '/assets/backgrounds/fitzroy2.jpg'],
    description:
      "Monte Fitz Roy rises 3,405 m on the border of Argentina and Chile, above the village of El Chaltén in Los Glaciares National Park. Its sheer granite walls catch the first sun each morning and glow deep red, one of the most striking sights in Patagonia. The peak was named in 1877 after Robert FitzRoy, the captain of the Beagle, but its older Tehuelche name, Chaltén, means 'smoking mountain', after the cloud that almost always streams off the summit. It is regarded as one of the hardest climbs in the world. Its jagged outline is the shape used in the Patagonia clothing logo.",
    facts: [
      { label: 'Border', value: 'Argentina & Chile' },
      { label: 'Height', value: '3,405 m' },
      { label: 'Park', value: 'Los Glaciares' },
      { label: 'Famous for', value: 'Red sunrise on granite' },
    ],
    sources: [
      { label: 'Wikipedia · Monte Fitz Roy', url: 'https://en.wikipedia.org/wiki/Monte_Fitz_Roy' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Fitz_Roy_El_Chalten_sunrise-5.jpg' },
    ],
  },
  {
    id: 'tekapo',
    name: 'Lake Tekapo',
    country: 'New Zealand',
    countryCode: 'NZ',
    tagline: 'Turquoise water under dark skies',
    images: ['/assets/backgrounds/tekapo.jpg'],
    description:
      "Lake Tekapo lies in the Mackenzie Basin of New Zealand's South Island, at about 710 m. Its bright turquoise colour comes from fine glacial rock flour carried down from the Southern Alps and held in the water. The basin sits inside the Aoraki Mackenzie International Dark Sky Reserve, one of the largest in the world, which makes it one of the clearest places anywhere to see the stars. Each summer the shoreline fills with introduced Russell lupins in pink, purple and blue. The small stone Church of the Good Shepherd has stood by the water since 1935.",
    facts: [
      { label: 'Region', value: 'Mackenzie Basin' },
      { label: 'Elevation', value: '710 m' },
      { label: 'Status', value: 'Dark Sky Reserve' },
      { label: 'Famous for', value: 'Turquoise lake & stars' },
    ],
    sources: [
      { label: 'Wikipedia · Lake Tekapo', url: 'https://en.wikipedia.org/wiki/Lake_Tekapo' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Lupins%2C_Lake_Tekapo%2C_NZ.jpg' },
    ],
  },
  {
    id: 'banff',
    name: 'Vermilion Lakes',
    country: 'Canada',
    countryCode: 'CA',
    tagline: 'Mount Rundle mirrored at dawn',
    images: ['/assets/backgrounds/banff.jpg'],
    description:
      "The Vermilion Lakes are three shallow lakes and wetlands just west of the town of Banff, in the Canadian Rockies. Fed by the Bow River and warm springs, their still water throws back a near-perfect reflection of Mount Rundle, best seen when the sky turns orange at sunrise and sunset. People have camped along these shores for more than ten thousand years. The marshes are rich in birds and other wildlife, and a quiet road runs along the edge for those who come to watch the light. The lakes lie within Banff National Park, the oldest national park in Canada.",
    facts: [
      { label: 'Park', value: 'Banff, Alberta' },
      { label: 'Range', value: 'Canadian Rockies' },
      { label: 'Peak', value: 'Mount Rundle' },
      { label: 'Famous for', value: 'Sunrise reflections' },
    ],
    sources: [
      { label: 'Wikipedia · Vermilion Lakes', url: 'https://en.wikipedia.org/wiki/Vermilion_Lakes' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Vermillion_Lake_Sunrise.jpg' },
    ],
  },
  {
    id: 'annapurna',
    name: 'Phewa Lake',
    country: 'Nepal',
    countryCode: 'NP',
    tagline: 'The Annapurnas on still water',
    images: ['/assets/backgrounds/annapurna.jpg'],
    description:
      "Phewa Lake lies beside the city of Pokhara in central Nepal, at about 740 m. On calm mornings it mirrors the snow peaks of the Annapurna range and the sharp pyramid of Machapuchare, the 'fishtail' mountain, which rises to nearly 6,993 m and has never been climbed because it is held sacred. It is among the largest lakes in the country and the most visited, with the small Tal Barahi temple on an island near its eastern shore. The high peaks stand only about 28 km away, close enough to fill the skyline above the water.",
    facts: [
      { label: 'Place', value: 'Pokhara, Nepal' },
      { label: 'Elevation', value: '~742 m' },
      { label: 'Peak', value: 'Machapuchare 6,993 m' },
      { label: 'Famous for', value: 'Himalayan reflections' },
    ],
    sources: [
      { label: 'Wikipedia · Phewa Lake', url: 'https://en.wikipedia.org/wiki/Phewa_Lake' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Pokhara_and_Phewa_Lake.jpg' },
    ],
  },
  {
    id: 'ilulissat',
    name: 'Ilulissat Icefjord',
    country: 'Greenland',
    countryCode: 'GL',
    tagline: 'Where the icebergs are born',
    images: ['/assets/backgrounds/ilulissat.jpg', '/assets/backgrounds/ilulissat2.jpg'],
    description:
      "The Ilulissat Icefjord runs about 40 km from the Greenland ice sheet down to Disko Bay, on the west coast, north of the Arctic Circle. It is fed by Sermeq Kujalleq, one of the fastest and most productive glaciers on Earth, which flows seaward by tens of metres a day and sheds roughly 20 billion tonnes of ice a year. The icebergs it calves can stand a kilometre tall and choke the fjord before they drift out to sea. People have hunted and fished along the fjord for nearly 4,000 years. It was made a UNESCO World Heritage Site in 2004.",
    facts: [
      { label: 'Region', value: 'West Greenland' },
      { label: 'Length', value: '~40 km' },
      { label: 'Glacier', value: 'Sermeq Kujalleq' },
      { label: 'Famous for', value: 'Giant icebergs' },
    ],
    sources: [
      { label: 'Wikipedia · Ilulissat Icefjord', url: 'https://en.wikipedia.org/wiki/Ilulissat_Icefjord' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Icebergs_in_the_Ilulissat_Icefjord%2C_Greenland_%2854067503523%29.jpg' },
    ],
  },
  {
    id: 'songkol',
    name: 'Song-Köl',
    country: 'Kyrgyzstan',
    countryCode: 'KG',
    tagline: 'A lake on the summer pastures',
    images: ['/assets/backgrounds/songkol.jpg'],
    description:
      "Song-Köl is a high lake in the Tian Shan mountains of Kyrgyzstan, lying at just over 3,000 m, the largest freshwater lake in the country. It is ringed by wide open grassland, the summer pastures known as jailoo, where herders bring their horses and sheep up from the valleys and live in felt yurts through the warm months. Ice covers the lake and snow lies on the basin for around half the year, and the shores empty out once the cold returns. Cranes, geese and gulls nest around the water, which is now a protected wetland.",
    facts: [
      { label: 'Range', value: 'Tian Shan, Kyrgyzstan' },
      { label: 'Elevation', value: '~3,016 m' },
      { label: 'Frozen', value: 'About half the year' },
      { label: 'Famous for', value: 'Highland summer pastures' },
    ],
    sources: [
      { label: 'Wikipedia · Son-Kul', url: 'https://en.wikipedia.org/wiki/Son-Kul' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Hills_around_Song_K%C3%B6l_lake%2C_Kyrgyzstan%3B_Thomas_Depenbusch%3B_June_2012.jpg' },
    ],
  },
  {
    id: 'sorvagsvatn',
    name: 'Sørvágsvatn',
    country: 'Faroe Islands',
    countryCode: 'FO',
    tagline: 'The lake above the ocean',
    images: ['/assets/backgrounds/sorvagsvatn.jpg', '/assets/backgrounds/sorvagsvatn2.jpg'],
    description:
      "Sørvágsvatn, also called Leitisvatn, is the largest lake in the Faroe Islands, set on the island of Vágar. Its surface lies only about 32 m above the sea, but seen from the Trælanípa cliffs at its end the tall headlands trick the eye, and the water seems to hang far above the ocean. At that edge the lake spills over the Bøsdalafossur waterfall straight into the Atlantic. Faroese from different villages still disagree over its name, so many just call it Vatnið, 'the lake'. Steep green slopes and sea cliffs surround it on every side.",
    facts: [
      { label: 'Island', value: 'Vágar, Faroe Islands' },
      { label: 'Area', value: '~3.4 km²' },
      { label: 'Height', value: '32 m above sea' },
      { label: 'Famous for', value: 'Clifftop optical illusion' },
    ],
    sources: [
      { label: 'Wikipedia · Sørvágsvatn', url: 'https://en.wikipedia.org/wiki/S%C3%B8rv%C3%A1gsvatn' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:S%C3%B8rv%C3%A1gsvatn_from_Tr%C3%A6lan%C3%ADpa.jpg' },
    ],
  },
  {
    id: 'trangan',
    name: 'Tràng An',
    country: 'Vietnam',
    countryCode: 'VN',
    tagline: 'Halong Bay on dry land',
    images: ['/assets/backgrounds/trangan.jpg'],
    description:
      "Tràng An is a landscape of limestone tower hills in Ninh Bình Province, in northern Vietnam, often described as a Halong Bay on land. Rivers wind between the steep green peaks and pass through long flooded caves, which visitors travel by small rowing boat. The same waters once surrounded Hoa Lư, the capital of Vietnam in the 10th and 11th centuries, and old temples still stand among the hills. The complex protects more than 600 plant species and 200 animal species. It became a mixed UNESCO World Heritage Site, listed for both its scenery and its history, in 2014.",
    facts: [
      { label: 'Region', value: 'Ninh Bình, Vietnam' },
      { label: 'Terrain', value: 'Limestone karst' },
      { label: 'UNESCO', value: '2014' },
      { label: 'Famous for', value: 'Karst peaks & river caves' },
    ],
    sources: [
      { label: 'Wikipedia · Tràng An', url: 'https://en.wikipedia.org/wiki/Tr%C3%A0ng_An_Scenic_Landscape_Complex' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Trang_An_Landscape_Complex%2C_Ninh_Binh_Province%2C_Vietnam%2C_20240202_1456_5313.jpg' },
    ],
  },
  {
    id: 'roraima',
    name: 'Mount Roraima',
    country: 'Venezuela',
    countryCode: 'VE',
    tagline: 'A table mountain in the clouds',
    images: ['/assets/backgrounds/roraima.jpg'],
    description:
      "Mount Roraima is the highest of the flat-topped tepuis that rise out of the Gran Sabana, at the point where Venezuela, Brazil and Guyana meet, with most of it in Venezuela. Its summit is a stark plateau ringed by cliffs that fall as much as 400 m, reaching about 2,810 m at the highest edge. The rock is among the oldest on the planet, a sandstone laid down roughly two billion years ago. Cloud and heavy rain wrap the plateau for much of the year, and its long isolation has left it full of plants and animals found nowhere else. It is often said to have inspired Arthur Conan Doyle's novel The Lost World.",
    facts: [
      { label: 'Borders', value: 'Venezuela, Brazil, Guyana' },
      { label: 'Height', value: '~2,810 m' },
      { label: 'Rock', value: '~2 billion years old' },
      { label: 'Famous for', value: 'Cliff-ringed tepui' },
    ],
    sources: [
      { label: 'Wikipedia · Mount Roraima', url: 'https://en.wikipedia.org/wiki/Mount_Roraima' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Monte_Roraima_e_Kukenan_Tepui_no_retorno_a_casa.jpg' },
    ],
  },
  {
    id: 'charyn',
    name: 'Charyn Canyon',
    country: 'Kazakhstan',
    countryCode: 'KZ',
    tagline: 'The Valley of Castles',
    images: ['/assets/backgrounds/charyn.jpg', '/assets/backgrounds/charyn2.jpg'],
    description:
      "Charyn Canyon follows the Charyn river through the dry country of southeastern Kazakhstan, about 200 km east of Almaty and not far from the Chinese border. It runs for roughly 150 km, with walls up to 300 m deep cut into red sedimentary rock. Its best-known stretch is the Valley of Castles, where wind and water have shaped the sandstone into towers and battlements that look almost built by hand. The layered rock holds millions of years of climate history. The canyon has been protected as a national park since 2004.",
    facts: [
      { label: 'Region', value: 'SE Kazakhstan' },
      { label: 'Length', value: '~150 km' },
      { label: 'Depth', value: 'up to 300 m' },
      { label: 'Famous for', value: "Eroded rock 'castles'" },
    ],
    sources: [
      { label: 'Wikipedia · Charyn Canyon', url: 'https://en.wikipedia.org/wiki/Charyn_Canyon' },
      { label: 'Photo · Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Charyn_Canyon%2C_Kazakhstan_03.jpg' },
    ],
  },
];

let bag = [];
let lastLocId = null;
const imgCursor = {};

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function refillBag() {
  bag = shuffleInPlace(locations.map((_, i) => i));
  if (bag.length > 1 && locations[bag[0]].id === lastLocId) {
    [bag[0], bag[1]] = [bag[1], bag[0]];
  }
}

function takeImageIndex(loc) {
  if (!loc.images || loc.images.length === 0) return 0;
  const cur = imgCursor[loc.id] ?? Math.floor(Math.random() * loc.images.length);
  imgCursor[loc.id] = (cur + 1) % loc.images.length;
  return cur;
}

function present(loc, imageIndex) {
  lastLocId = loc.id;
  return { ...loc, _imageIndex: imageIndex, currentImage: loc.images[imageIndex] };
}

const startPicks = [
  { id: 'vikbeach', image: 0 },
  { id: 'vikbeach', image: 1 },
  { id: 'torresdelpaine', image: 0 },
  { id: 'seatoskyhighway', image: 2 },
  { id: 'fjordroadside', image: 0 },
];

export function pickDefaultLocation() {
  if (locations.length === 0) return null;
  const pick = startPicks[Math.floor(Math.random() * startPicks.length)];
  const loc = locations.find((l) => l.id === pick.id) || locations[0];
  const imageIndex = Math.min(pick.image, loc.images.length - 1);
  imgCursor[loc.id] = (imageIndex + 1) % loc.images.length;
  return present(loc, imageIndex);
}

export function pickRandomLocation() {
  if (locations.length === 0) return null;
  if (locations.length === 1) return present(locations[0], takeImageIndex(locations[0]));
  if (bag.length === 0) refillBag();
  const loc = locations[bag.shift()];
  return present(loc, takeImageIndex(loc));
}

export function pickNextVariant() {
  return pickRandomLocation();
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
  for (const idx of bag.slice(0, count)) {
    const l = locations[idx];
    if (l?.images?.[0]) out.push(l.images[0]);
  }
  return out;
}

export default locations;
