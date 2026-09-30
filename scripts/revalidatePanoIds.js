import fs from 'node:fs/promises';
import path from 'node:path';

const poolPath = path.resolve(process.argv[2] || 'data/world-main.json');
const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required');

const pool = JSON.parse(await fs.readFile(poolPath, 'utf8'));
let nextIndex = 0;
let invalid = 0;
const workerCount = Math.min(8, pool.length);

async function worker() {
  while (nextIndex < pool.length) {
    const index = nextIndex++;
    const point = pool[index];
    if (!point.panoId) continue;
    const query = new URLSearchParams({ pano: point.panoId, key });
    const response = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${query}`);
    if (!response.ok) throw new Error(`Google metadata request failed (${response.status})`);
    const metadata = await response.json();
    if (metadata.status === 'OK' && typeof metadata.pano_id === 'string') {
      point.panoId = metadata.pano_id;
      point.panoValid = true;
    } else if (metadata.status === 'ZERO_RESULTS' || metadata.status === 'NOT_FOUND') {
      point.panoValid = false;
      invalid++;
    } else {
      throw new Error(`Google metadata returned ${metadata.status || 'unknown status'}`);
    }
  }
}

await Promise.all(Array.from({ length: workerCount }, worker));
const tempPath = `${poolPath}.revalidated`;
await fs.writeFile(tempPath, `${JSON.stringify(pool)}\n`);
await fs.rename(tempPath, poolPath);
console.log(`Revalidated ${pool.length} panoramas; marked ${invalid} invalid in ${poolPath}`);
