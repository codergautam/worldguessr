// The one definition of a map page's title and description. Imported by
// pages/map.js (the hydrated page) and by workers/seo-edge (the raw HTML a
// crawler gets), so the two can never disagree. Pure: no platform APIs.

export const MAP_META_TAIL = "Play it on WorldGuessr, a free GeoGuessr alternative. No account needed.";
const SNIPPET_MAX = 158;

// Mirrors the homepage title ("WorldGuessr - Play Geoguessr for free"), same
// casing.
export function mapTitle(name) {
  return `Play ${String(name).trim()} Geoguessr for free - WorldGuessr`;
}

// Longest variant that fits a search snippet: description + facts + tail,
// then without the facts, then a clamp of the description + tail.
// `facts` is an array of short strings such as "1,492 Street View locations".
export function mapDescription(descriptionShort, facts = []) {
  const short = String(descriptionShort || "").trim().replace(/\s+/g, " ");
  const withFacts = [short, facts.length ? facts.join(", ") + "." : "", MAP_META_TAIL].filter(Boolean).join(" ");
  const withoutFacts = [short, MAP_META_TAIL].filter(Boolean).join(" ");
  if (withFacts.length <= SNIPPET_MAX) return withFacts;
  if (withoutFacts.length <= SNIPPET_MAX) return withoutFacts;
  return clamp(withoutFacts, SNIPPET_MAX);
}

// Which community maps are worth a search result. Google indexed maps with
// 11 locations, 0 hearts and no description, and showed them with garbage
// snippets; thin pages like that pull the good ones down. Country maps
// always index. A community map needs some play or some love. The same
// rule gates the sitemap (api/map/sitemap.js, as a Mongo filter), the
// Worker's noindex, and the client-side noindex on pages/map.js.
export const MIN_INDEX_PLAYS = 100;
export const MIN_INDEX_HEARTS = 3;

export function isIndexableMap(m) {
  if (!m) return false;
  if (m.countryCode) return true;
  return (Number(m.plays) || 0) >= MIN_INDEX_PLAYS || (Number(m.hearts) || 0) >= MIN_INDEX_HEARTS;
}

// The one-line description for a map whose creator wrote none, so the
// snippet is a sentence about the map instead of only the generic tail.
export function mapFallbackShort(name, locationsCnt, creator) {
  const n = Number(locationsCnt) || 0;
  const where = n ? `${n.toLocaleString("en-US")} Street View locations` : "Street View locations";
  return `${String(name).trim()} is a community map with ${where}${creator ? `, made by ${creator}` : ""}.`;
}

function clamp(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, "") + "…";
}
