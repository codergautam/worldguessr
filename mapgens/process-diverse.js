import fs from 'fs';
import path from 'path';

const inputPath = path.join(process.cwd(), 'mapgens', 'diverse-locations.json');
const outputPath = path.join(process.cwd(), 'data', 'diverse-locations.json');

console.log('Reading diverse-locations.json...');
const raw = fs.readFileSync(inputPath, 'utf8');
const locations = JSON.parse(raw);

console.log(`Processing ${locations.length} locations...`);

const processed = locations.map(loc => ({
  lat: loc.lat,
  lng: loc.lng,
  heading: loc.heading,
  panoId: loc.panoId,
  country: loc.extra?.tags?.[0] || null
}));

// Filter out any without country
const valid = processed.filter(loc => loc.country);
console.log(`Valid locations with country: ${valid.length}`);

// Count by country
const counts = {};
for (const loc of valid) {
  counts[loc.country] = (counts[loc.country] || 0) + 1;
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('\nLocations per country:');
sorted.forEach(([country, count]) => {
  console.log(`  ${country}: ${count}`);
});

console.log(`\nWriting to ${outputPath}...`);
fs.writeFileSync(outputPath, JSON.stringify(valid, null, 0));
console.log('Done!');
