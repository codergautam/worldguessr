import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const NUM_WORKERS = os.cpus().length;

const mapPath = './data/world-pinpointable.json';

if (isMainThread) {
  // ===== MAIN THREAD =====
  const arbitraryWorld = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

  console.log(`Processing ${arbitraryWorld.length} locations with ${NUM_WORKERS} workers...`);
  const startTime = Date.now();

  // Split work among workers
  const chunkSize = Math.ceil(arbitraryWorld.length / NUM_WORKERS);
  const chunks = [];
  for (let i = 0; i < NUM_WORKERS; i++) {
    chunks.push(arbitraryWorld.slice(i * chunkSize, (i + 1) * chunkSize));
  }

  // Spawn workers
  const results = new Array(NUM_WORKERS);
  let completed = 0;

  const promises = chunks.map((chunk, index) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: { chunk, index } });

      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          process.stdout.write(`\rWorker ${index}: ${msg.processed}/${msg.total}`);
        } else if (msg.type === 'done') {
          results[index] = msg.results;
          completed++;
          console.log(`\nWorker ${index} done (${completed}/${NUM_WORKERS})`);
          resolve();
        }
      });

      worker.on('error', reject);
    });
  });

  await Promise.all(promises);

  // Combine results
  const allResults = results.flat();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nProcessed ${allResults.length} locations in ${elapsed}s`);

  // Update original data with country codes
  for (let i = 0; i < arbitraryWorld.length; i++) {
    arbitraryWorld[i].country = allResults[i];
  }

  // Write back
  fs.writeFileSync(mapPath, JSON.stringify(arbitraryWorld));
  console.log(`Saved to ${mapPath}`);

} else {
  // ===== WORKER THREAD =====
  const borders = (await import('@osm_borders/maritime_10m')).default;
  const GeoJsonLookup = (await import('geojson-geometries-lookup')).default;

  const geoLookup = new GeoJsonLookup(borders);
  const { chunk, index } = workerData;
  const results = [];

  for (let i = 0; i < chunk.length; i++) {
    const loc = chunk[i];
    const result = geoLookup.getContainers({ type: 'Point', coordinates: [loc.lng, loc.lat] });
    const country = result.features.length > 0
      ? result.features[0].properties.isoA2
      : null;
    results.push(country);

    if ((i + 1) % 5000 === 0) {
      parentPort.postMessage({ type: 'progress', processed: i + 1, total: chunk.length });
    }
  }

  parentPort.postMessage({ type: 'done', results });
}