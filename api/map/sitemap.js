import Map from "../../models/Map.js";

// GET /api/map/sitemap → an XML sitemap of every accepted community map, as
// https://www.worldguessr.com/map/<slug>. The edge Worker (workers/seo-edge)
// serves it on www as /sitemap-maps.xml; the static sitemap index in
// public/sitemap.xml points there. Official country maps are NOT here: they
// are repo JSON, so scripts/writeSitemap.mjs lists them at build time.
//
// Public, identical for everyone, and a full collection scan: cache it at
// every layer (mongoose cache 1h, HTTP 1h, Worker cache 1h).

const SITE_URL = "https://www.worldguessr.com";
// Sitemap protocol cap is 50,000 URLs. Most-played first so that if the
// collection ever passes it, the tail that drops is the tail nobody plays.
const MAX_URLS = 49000;

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function isoDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const maps = await Map.find({ accepted: true })
    .select("slug lastUpdated created_at plays")
    .sort({ plays: -1 })
    .limit(MAX_URLS)
    .lean()
    .cache(3600, "mapSitemap");

  const urls = maps
    .filter((m) => m.slug && /^[a-z0-9_-]+$/i.test(m.slug))
    .map((m) => {
      const lastmod = isoDate(m.lastUpdated || m.created_at);
      return `  <url>\n    <loc>${SITE_URL}/map/${xmlEscape(m.slug)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </url>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  return res.send(xml);
}
