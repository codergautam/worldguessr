import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TARGET_TOTAL = 150000; // Aim for 150k locations (middle of 100-200k range)

// Load data files
console.log('Loading location files...');
const representedLocations = JSON.parse(fs.readFileSync(path.join(__dirname, 'aeuw-represented-locations.json'), 'utf8'));
const underrepresentedLocations = JSON.parse(fs.readFileSync(path.join(__dirname, 'aeuw-underrepresented-locations.json'), 'utf8'));
const diverseLocations = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/diverse-locations.json'), 'utf8'));
const targetDistribution = JSON.parse(fs.readFileSync(path.join(__dirname, 'aeuw-target-distribution.json'), 'utf8'));

console.log(`Represented: ${representedLocations.length} locations`);
console.log(`Underrepresented: ${underrepresentedLocations.length} locations`);
console.log(`Diverse: ${diverseLocations.length} locations`);

// Helper to get country code from location
function getCountryCode(loc) {
  if (loc.extra?.tags?.[0]) return loc.extra.tags[0];
  if (loc.country) return loc.country;
  return null;
}

// Normalize location format to consistent structure (matches world-main.json format)
function normalizeLocation(loc) {
  const country = getCountryCode(loc);
  return {
    lat: loc.lat,
    lng: loc.lng,
    heading: loc.heading,
    panoId: loc.panoId,
    country
  };
}

// Group locations by country
function groupByCountry(locations) {
  const grouped = {};
  for (const loc of locations) {
    const country = getCountryCode(loc);
    if (!country) continue;
    if (!grouped[country]) grouped[country] = [];
    grouped[country].push(loc);
  }
  return grouped;
}

console.log('\nGrouping locations by country...');
const representedByCountry = groupByCountry(representedLocations);
const underrepresentedByCountry = groupByCountry(underrepresentedLocations);
const diverseByCountry = groupByCountry(diverseLocations);

// Calculate target counts per country
const countries = Object.keys(targetDistribution);
const totalPercentage = Object.values(targetDistribution).reduce((a, b) => a + b, 0);

console.log(`\nTarget distribution has ${countries.length} countries`);
console.log(`Total percentage: ${totalPercentage.toFixed(2)}%`);

// Normalize percentages to sum to 100
const normalizedDistribution = {};
for (const country of countries) {
  normalizedDistribution[country] = (targetDistribution[country] / totalPercentage) * 100;
}

// Calculate target count for each country
const targetCounts = {};
for (const country of countries) {
  targetCounts[country] = Math.round((normalizedDistribution[country] / 100) * TARGET_TOTAL);
}

// Shuffle array using Fisher-Yates
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Sample locations for each country
console.log('\nSampling locations...');
const finalLocations = [];
const stats = {
  fromRepresented: 0,
  fromUnderrepresented: 0,
  fromDiverse: 0,
  shortfall: {}
};

for (const country of countries) {
  const target = targetCounts[country];
  let sampled = [];

  // Priority order: represented -> underrepresented -> diverse
  const sources = [
    { name: 'represented', data: representedByCountry[country] || [] },
    { name: 'underrepresented', data: underrepresentedByCountry[country] || [] },
    { name: 'diverse', data: diverseByCountry[country] || [] }
  ];

  // Shuffle each source for randomness
  for (const source of sources) {
    source.data = shuffle(source.data);
  }

  let remaining = target;

  for (const source of sources) {
    if (remaining <= 0) break;

    const toTake = Math.min(remaining, source.data.length);
    const taken = source.data.slice(0, toTake);
    sampled.push(...taken);
    remaining -= toTake;

    // Update stats
    if (source.name === 'represented') stats.fromRepresented += toTake;
    else if (source.name === 'underrepresented') stats.fromUnderrepresented += toTake;
    else stats.fromDiverse += toTake;
  }

  if (remaining > 0) {
    stats.shortfall[country] = {
      target,
      got: target - remaining,
      missing: remaining
    };
  }

  // Normalize and add to final list
  for (const loc of sampled) {
    finalLocations.push(normalizeLocation(loc));
  }
}

// Find and add extra countries not in target distribution
const targetCountrySet = new Set(countries);
const extraCountries = new Set();

// Collect all extra countries from represented and underrepresented
for (const country of Object.keys(representedByCountry)) {
  if (!targetCountrySet.has(country)) extraCountries.add(country);
}
for (const country of Object.keys(underrepresentedByCountry)) {
  if (!targetCountrySet.has(country)) extraCountries.add(country);
}

// Configuration for extra countries
const EXTRA_COUNTRY_TARGET = 200; // Target locations per extra country

console.log(`\nAdding locations from ${extraCountries.size} extra countries...`);
stats.fromExtraCountries = 0;
const extraCountryStats = {};

for (const country of extraCountries) {
  const sources = [
    { name: 'represented', data: shuffle(representedByCountry[country] || []) },
    { name: 'underrepresented', data: shuffle(underrepresentedByCountry[country] || []) },
    { name: 'diverse', data: shuffle(diverseByCountry[country] || []) }
  ];

  let remaining = EXTRA_COUNTRY_TARGET;
  let sampled = [];

  for (const source of sources) {
    if (remaining <= 0) break;
    const toTake = Math.min(remaining, source.data.length);
    const taken = source.data.slice(0, toTake);
    sampled.push(...taken);
    remaining -= toTake;

    if (source.name === 'represented') stats.fromRepresented += toTake;
    else if (source.name === 'underrepresented') stats.fromUnderrepresented += toTake;
    else stats.fromDiverse += toTake;
  }

  if (sampled.length > 0) {
    extraCountryStats[country] = sampled.length;
    stats.fromExtraCountries += sampled.length;
    for (const loc of sampled) {
      finalLocations.push(normalizeLocation(loc));
    }
  }
}

console.log(`Added ${stats.fromExtraCountries} locations from extra countries:`);
for (const [country, count] of Object.entries(extraCountryStats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${country}: ${count}`);
}

// Shuffle final locations for good distribution
const shuffledFinal = shuffle(finalLocations);

// Print statistics
console.log('\n=== Statistics ===');
console.log(`Total locations: ${shuffledFinal.length}`);
console.log(`From represented: ${stats.fromRepresented}`);
console.log(`From underrepresented: ${stats.fromUnderrepresented}`);
console.log(`From diverse: ${stats.fromDiverse}`);

if (Object.keys(stats.shortfall).length > 0) {
  console.log('\nCountries with shortfall:');
  for (const [country, info] of Object.entries(stats.shortfall)) {
    console.log(`  ${country}: target ${info.target}, got ${info.got}, missing ${info.missing}`);
  }
}

// Count by country in final output
const finalByCountry = {};
for (const loc of shuffledFinal) {
  const country = getCountryCode(loc);
  finalByCountry[country] = (finalByCountry[country] || 0) + 1;
}

console.log('\n=== Final distribution ===');
const sortedCountries = Object.entries(finalByCountry)
  .sort((a, b) => b[1] - a[1]);

for (const [country, count] of sortedCountries) {
  const targetPct = normalizedDistribution[country]?.toFixed(2) || '?';
  const actualPct = ((count / shuffledFinal.length) * 100).toFixed(2);
  console.log(`  ${country}: ${count} (${actualPct}% vs target ${targetPct}%)`);
}

// Write output
const outputPath = path.join(__dirname, 'aeuw.json');
fs.writeFileSync(outputPath, JSON.stringify(shuffledFinal));
console.log(`\nWritten ${shuffledFinal.length} locations to ${outputPath}`);

// Generate actual distribution JSON
const actualDistribution = {};
for (const [country, count] of sortedCountries) {
  actualDistribution[country] = parseFloat(((count / shuffledFinal.length) * 100).toFixed(4));
}

const actualDistPath = path.join(__dirname, 'aeuw-actual-distribution.json');
fs.writeFileSync(actualDistPath, JSON.stringify(actualDistribution, null, 2));
console.log(`Written actual distribution to ${actualDistPath}`);

// Generate comparison chart using QuickChart API
async function generateComparisonChart() {
  console.log('\nGenerating comparison chart...');

  // Load world-main for comparison
  const worldMainLocations = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/world-main.json'), 'utf8'));
  const worldMainByCountry = {};
  for (const loc of worldMainLocations) {
    const c = loc.country;
    if (c) worldMainByCountry[c] = (worldMainByCountry[c] || 0) + 1;
  }
  const worldMainDist = {};
  for (const [c, n] of Object.entries(worldMainByCountry)) {
    worldMainDist[c] = parseFloat(((n / worldMainLocations.length) * 100).toFixed(2));
  }

  // Load world-arbitrary for comparison
  const worldArbLocations = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/world-arbitrary.json'), 'utf8'));
  const worldArbByCountry = {};
  for (const loc of worldArbLocations) {
    const c = loc.country;
    if (c) worldArbByCountry[c] = (worldArbByCountry[c] || 0) + 1;
  }
  const worldArbDist = {};
  for (const [c, n] of Object.entries(worldArbByCountry)) {
    worldArbDist[c] = parseFloat(((n / worldArbLocations.length) * 100).toFixed(2));
  }

  // Sort countries by target percentage (descending) - show all countries
  const chartCountries = Object.entries(normalizedDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([country]) => country);

  const worldMainData = chartCountries.map(c => worldMainDist[c] || 0);
  const worldArbData = chartCountries.map(c => worldArbDist[c] || 0);
  const targetData = chartCountries.map(c => parseFloat(normalizedDistribution[c].toFixed(2)));
  const actualData = chartCountries.map(c => parseFloat(actualDistribution[c]?.toFixed(2) || 0));

  const chartConfig = {
    type: 'bar',
    data: {
      labels: chartCountries,
      datasets: [
        {
          label: 'World-Main %',
          data: worldMainData,
          backgroundColor: 'rgba(255, 206, 86, 0.7)',
          borderColor: 'rgba(255, 206, 86, 1)',
          borderWidth: 1
        },
        {
          label: 'World-Arbitrary %',
          data: worldArbData,
          backgroundColor: 'rgba(255, 159, 64, 0.7)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1
        },
        {
          label: 'Target %',
          data: targetData,
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: 'AEUW Actual %',
          data: actualData,
          backgroundColor: 'rgba(75, 192, 192, 0.7)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `Distribution: Main (${worldMainLocations.length.toLocaleString()}) / Arbitrary (${worldArbLocations.length.toLocaleString()}) / AEUW (${shuffledFinal.length.toLocaleString()})`,
          font: { size: 16 }
        },
        legend: {
          position: 'top'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Country Code'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Percentage (%)'
          },
          beginAtZero: true
        }
      }
    }
  };

  const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=2400&h=800&bkg=white`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const chartPath = path.join(__dirname, 'aeuw-distribution-comparison.png');
    fs.writeFileSync(chartPath, buffer);
    console.log(`Written comparison chart to ${chartPath}`);
  } catch (err) {
    console.error('Failed to generate chart:', err.message);

    // Fallback: save chart config for manual rendering
    const configPath = path.join(__dirname, 'aeuw-chart-config.json');
    fs.writeFileSync(configPath, JSON.stringify(chartConfig, null, 2));
    console.log(`Chart config saved to ${configPath} (use at quickchart.io)`);
  }
}

await generateComparisonChart();
