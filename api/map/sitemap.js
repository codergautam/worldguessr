import Map from "../../models/Map.js";

// GET /api/map/sitemap?page=N → one XML sitemap page of accepted community
// maps, as https://www.worldguessr.com/map/<slug>, 45,000 per page (the
// protocol caps a file at 50,000). Ordered by _id: it is indexed, so paging
// costs no memory, and it is stable, so a map never straddles two pages
// between requests. (Sorting by plays across the whole collection blew
// MongoDB's 32 MB in-memory sort limit once the count passed ~70k.) Page 1
// when `page` is absent. Only maps that pass the quality gate below are
// listed (keep the numbers in step with MIN_INDEX_PLAYS / MIN_INDEX_HEARTS in
// shared/mapSeo.js). The edge Worker (workers/seo-edge) serves page N on
// www as /sitemap-maps-N.xml and builds the sitemap index that lists every
// page from /api/map/count. Official country maps are NOT here: they are
// repo JSON, so scripts/writeSitemap.mjs lists them at build time.
//
// Public, identical for everyone, and a full collection scan: cache it at
// every layer (mongoose cache 1h, HTTP 1h, Worker cache 1h).

const SITE_URL = "https://www.worldguessr.com";
export const SITEMAP_PAGE_SIZE = 45000;

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
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  // Same gate as isIndexableMap in shared/mapSeo.js: a community map needs
  // 100+ plays or 3+ hearts to be worth a search result. Thin maps still
  // have pages; they are just not advertised to crawlers.
  const maps = await Map.find({ accepted: true, $or: [{ plays: { $gte: 100 } }, { hearts: { $gte: 3 } }] })
    .select("slug lastUpdated created_at")
    .sort({ _id: 1 })
    .skip((page - 1) * SITEMAP_PAGE_SIZE)
    .limit(SITEMAP_PAGE_SIZE)
    .lean()
    .cache(3600, "mapSitemap_" + page);

  if (page > 1 && maps.length === 0) {
    return res.status(404).json({ message: "No such sitemap page" });
  }

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
