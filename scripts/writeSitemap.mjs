// Writes <export dir>/sitemap-pages.xml after `next build`: the static pages
// plus the 93 official country maps, every lastmod = the build date. Runs
// from the "build" script in package.json. The community-map sitemap is
// NOT here: it comes from the API through the edge Worker (see
// public/sitemap.xml). Skipped for portal builds, which live on other
// origins and must never advertise www URLs.

import fs from "node:fs";
import path from "node:path";

const SITE_URL = "https://www.worldguessr.com";
const portal = ["NEXT_PUBLIC_COOLMATH", "NEXT_PUBLIC_POKI", "NEXT_PUBLIC_GAMEDISTRIBUTION", "NEXT_PUBLIC_6X", "NEXT_PUBLIC_SCHOOLGUESSR"]
  .some((k) => process.env[k] === "true");
if (portal) {
  console.log("[sitemap] portal build, skipped");
  process.exit(0);
}

// With output:'export' a custom NEXT_DIST_DIR is the export dir; the default
// export dir is ./out (see next.config.js).
const outDir = path.resolve(process.env.NEXT_DIST_DIR || "out");
if (!fs.existsSync(outDir)) {
  console.error(`[sitemap] export dir not found: ${outDir}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

// Only canonical URLs: /en, /<lang>/daily and /map?s= all canonicalise
// elsewhere and would only be reported as duplicates.
const pages = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/es", changefreq: "weekly", priority: "0.8" },
  { loc: "/fr", changefreq: "weekly", priority: "0.8" },
  { loc: "/de", changefreq: "weekly", priority: "0.8" },
  { loc: "/ru", changefreq: "weekly", priority: "0.8" },
  { loc: "/about", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare-to-geoguessr", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare-to-openguessr", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare-to-geotastic", changefreq: "monthly", priority: "0.7" },
  { loc: "/daily", changefreq: "daily", priority: "0.9" },
  { loc: "/maps", changefreq: "daily", priority: "0.9" },
  { loc: "/china", changefreq: "weekly", priority: "0.7" },
  { loc: "/hall-of-fame", changefreq: "weekly", priority: "0.5" },
  { loc: "/leaderboard", changefreq: "daily", priority: "0.5" },
  { loc: "/privacy", changefreq: "yearly", priority: "0.1" },
];

const countryMaps = JSON.parse(fs.readFileSync(path.resolve("public/officialCountryMaps.json"), "utf8"));
for (const m of countryMaps) {
  if (m.slug && /^[a-z0-9_-]+$/i.test(m.slug)) {
    pages.push({ loc: `/map/${m.slug}`, changefreq: "monthly", priority: "0.7" });
  }
}

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url>
    <loc>${SITE_URL}${esc(p.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

fs.writeFileSync(path.join(outDir, "sitemap-pages.xml"), xml);
console.log(`[sitemap] wrote ${pages.length} URLs to ${path.join(outDir, "sitemap-pages.xml")}`);
