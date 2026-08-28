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

function clamp(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, "") + "…";
}
