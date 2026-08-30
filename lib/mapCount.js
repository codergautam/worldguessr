import { useEffect, useState } from "react";
import config from "@/clientConfig";
import baked from "@/lib/mapCountBaked.json";

// The accepted community-map count. Three sources, in order of freshness:
//   1. lib/mapCountBaked.json, written by scripts/fetchMapCount.mjs at build
//      time. This is what the static HTML states, so crawlers see a number.
//   2. GET /api/map/count on mount, so people see today's number.
//   3. On /about the edge Worker rewrites [data-map-count] live as well.
// A count of 0 means "not baked yet"; callers render a word instead.
//
// The live number may only move the baked one UP. Accepted maps do not
// vanish by the thousand, so a smaller answer means the fetch reached a
// different database (the dev API on localhost with a few hundred maps)
// and would print "928" over a real 71,000 on every page that shows it.

export const BAKED_MAP_COUNT = Number(baked?.count) || 0;

export function useMapCount() {
  const [count, setCount] = useState(BAKED_MAP_COUNT);
  useEffect(() => {
    let cancelled = false;
    const { apiUrl } = config();
    fetch(`${apiUrl}/api/map/count`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && Number.isInteger(d.count) && d.count >= BAKED_MAP_COUNT) setCount(d.count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return count;
}

// "12,345" in the page's locale, or the locale's word for "thousands of"
// while no count is known. `thousands` is the translated fallback phrase.
export function formatMapCount(count, locale, thousands) {
  return count > 0 ? count.toLocaleString(locale || "en-US") : thousands;
}
