// Bakes the current Google Play rating into lib/storeRatingBaked.json before
// `next build`. lib/aboutContent.js reads it for the visible rating line and
// the aggregateRating in the homepage JSON-LD, so the "4.8 (662)" Google
// shows under the result tracks the store instead of a hand-typed constant.
//
// Source: the Play listing's own JSON-LD (application/ld+json with an
// aggregateRating), which is stable across Play's layout changes. Any
// failure keeps the previous baked value: a build must never fail, and a
// worse-looking number must never come from a bad parse, so a count lower
// than the baked one is rejected too (rating counts only grow).

import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("lib/storeRatingBaked.json");
const URL = "https://play.google.com/store/apps/details?id=com.codergautamyt.worldguessr&hl=en_US";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;

try {
  const res = await fetch(URL, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let rating = null;
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      const r = j.aggregateRating || (Array.isArray(j["@graph"]) && j["@graph"].find((n) => n.aggregateRating)?.aggregateRating);
      if (r && r.ratingValue && r.ratingCount) { rating = r; break; }
    } catch { /* not the block we want */ }
  }
  if (!rating) throw new Error("no aggregateRating JSON-LD on the Play page");
  const value = Number(rating.ratingValue);
  const count = parseInt(String(rating.ratingCount).replace(/[^0-9]/g, ""), 10);
  if (!(value >= 1 && value <= 5) || !(count > 0)) throw new Error(`bad values ${rating.ratingValue} / ${rating.ratingCount}`);
  if (prev && count < prev.count) throw new Error(`count went down (${count} < ${prev.count}); keeping baked`);
  const baked = { value: value.toFixed(1), count, fetchedAt: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(OUT, JSON.stringify(baked, null, 2) + "\n");
  console.log(`[storeRating] baked ${baked.value} from ${count} ratings`);
} catch (err) {
  console.warn(`[storeRating] ${err.message}; keeping baked value ${prev ? `${prev.value} (${prev.count})` : "none"}`);
}
