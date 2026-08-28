// Bakes the accepted community-map count into lib/mapCountBaked.json before
// `next build`, so the static HTML (home About panel, /about) states a real
// number for crawlers that never run JavaScript. The browser refreshes it on
// load (lib/mapCount.js) and the edge Worker rewrites it live on /about.
// If the API is unreachable the previous baked value stays: a build must
// never fail, and never bake a zero, because of this.

import fs from "node:fs";
import path from "node:path";

const out = path.resolve("lib/mapCountBaked.json");
const api = process.env.NEXT_PUBLIC_API_URL ? `https://${process.env.NEXT_PUBLIC_API_URL}` : "https://api.worldguessr.com";

try {
  const res = await fetch(`${api}/api/map/count`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { count } = await res.json();
  if (!Number.isInteger(count) || count <= 0) throw new Error(`bad count ${count}`);
  fs.writeFileSync(out, JSON.stringify({ count, fetchedAt: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
  console.log(`[mapCount] baked ${count}`);
} catch (err) {
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
  console.warn(`[mapCount] fetch failed (${err.message}); keeping baked value ${prev ? prev.count : "none"}`);
}
