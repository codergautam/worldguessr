// SEO edge Worker for www.worldguessr.com (routes in ../wrangler.jsonc).
//
// The site is a static Next.js export: every /map page ships the same shell
// with an empty <title> and no description, and only the browser fills it
// in. Search engines that render JavaScript cope; the crawlers behind AI
// answers do not, and either way the raw HTML is what gets quoted. This
// Worker fills the shell at the edge from the public map API, so
// /map/<slug> is a real page for every map without a rebuild.
//
// FAIL OPEN. Any error anywhere returns the untouched origin response. A
// map page with a blank title is the status quo; a map page that 500s is a
// regression. Never let this Worker be the reason a page does not load.
//
// A same-zone fetch() from a Worker goes to the origin (Pages), not back
// through this route, so fetching the shell cannot recurse.

import { mapTitle, mapDescription } from "../../../shared/mapSeo.js";

const SLUG_RE = /^[a-z0-9_-]{1,80}$/i;
const MAP_DATA_TTL = 3600; // seconds
const SITEMAP_TTL = 3600;

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);
      const url = new URL(request.url);

      if (url.pathname === "/sitemap-maps.xml") return await sitemap(request, env, ctx);
      if (url.pathname === "/about") return await aboutPage(request, env, ctx);

      // The CrazyGames embed drives this page with ?crazygames and must keep
      // its query string; leave it alone.
      if (url.searchParams.has("crazygames")) return fetch(request);

      // /map?s=<slug> is the legacy URL. One canonical URL per map, so send
      // it to /map/<slug>. Unknown shapes (no slug, bad slug) pass through.
      if (url.pathname === "/map") {
        const s = url.searchParams.get("s") || url.searchParams.get("slug");
        if (s && SLUG_RE.test(s)) {
          return Response.redirect(`${env.SITE_ORIGIN}/map/${s}`, 301);
        }
        return fetch(request);
      }

      const m = url.pathname.match(/^\/map\/([^/]+)\/?$/);
      if (!m || !SLUG_RE.test(m[1])) return fetch(request);
      return await mapPage(request, m[1], env, ctx);
    } catch (err) {
      console.log(JSON.stringify({ level: "error", where: "seo-edge", message: String(err && err.message || err) }));
      return fetch(request);
    }
  },
};

// ---------------------------------------------------------------------------
// /map/<slug>

async function mapPage(request, slug, env, ctx) {
  // The shell and the data are independent; fetch them together.
  const [shellRes, data] = await Promise.all([
    fetch(`${env.SITE_ORIGIN}/map`, {
      headers: { accept: "text/html" },
      cf: { cacheTtl: 300, cacheEverything: true },
    }),
    mapData(slug, env, ctx),
  ]);

  if (!shellRes.ok || !(shellRes.headers.get("content-type") || "").includes("text/html")) {
    return fetch(request);
  }

  if (data === undefined) {
    // The API failed or timed out, so we do not know whether this map exists.
    // Fail open without adding noindex; a transient outage must never remove
    // a valid map from search.
    return fetch(request);
  }

  if (data === null) {
    // The API explicitly said this slug does not exist or is not accepted.
    // Return a real 404 and keep the dead URL out of the index.
    const rewriter = new HTMLRewriter().on("head", {
      element(el) { el.append('<meta name="robots" content="noindex">', { html: true }); },
    });
    const res = rewriter.transform(shellRes);
    return new Response(res.body, { status: 404, headers: withEdgeHeaders(res.headers) });
  }

  const seo = buildSeo(data, slug, env);
  const rewriter = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(seo.title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", seo.description); } })
    .on("head", { element(el) { el.append(seo.headTags, { html: true }); } })
    .on("body", { element(el) { el.append(seo.bodyBlock, { html: true }); } });

  const res = rewriter.transform(shellRes);
  return new Response(res.body, { status: 200, headers: withEdgeHeaders(res.headers) });
}

function withEdgeHeaders(headers) {
  const h = new Headers(headers);
  h.set("x-seo-edge", "map");
  // Short shared TTL: a map edit shows up within minutes; the data cache
  // below is the one that actually saves origin trips.
  h.set("cache-control", "public, max-age=300");
  return h;
}

// Public map data, cached at the edge for an hour. Returns:
//   object  → the map
//   null    → the API said 404 (no such accepted map)
//   undefined → could not tell (API error/timeout); caller must not 404
async function mapData(slug, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`${env.SITE_ORIGIN}/__seo-cache/map/${encodeURIComponent(slug)}`);
  const hit = await cache.match(cacheKey);
  if (hit) {
    const body = await hit.json();
    return body.notFound ? null : body.mapData;
  }

  let apiRes;
  try {
    apiRes = await fetch(`${env.API_ORIGIN}/api/map/publicData?slug=${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return undefined;
  }

  let payload;
  if (apiRes.status === 404) {
    payload = { notFound: true };
  } else if (apiRes.ok) {
    const json = await apiRes.json();
    if (!json || !json.mapData || !json.mapData.name) return undefined;
    // Keep only what the page needs; the locations sample never leaves the API.
    const d = json.mapData;
    payload = {
      mapData: {
        name: d.name,
        slug: d.slug || slug,
        description_short: d.description_short || "",
        description_long: d.description_long || "",
        created_by: d.created_by || "",
        plays: typeof d.plays === "number" ? d.plays : null,
        hearts: typeof d.hearts === "number" ? d.hearts : null,
        // Country maps come as the raw repo JSON: no locationsCnt, but the
        // full data array (community maps ship a 5-item sample, so only
        // trust the array when the count is absent).
        locationsCnt: typeof d.locationsCnt === "number" ? d.locationsCnt
          : (Array.isArray(d.data) && d.countryCode ? d.data.length : null),
        countryCode: d.countryCode || null,
        lastUpdated: d.lastUpdated || null,
        // Country maps only: "How to recognize <country>" paragraphs from
        // public/officialCountryMaps.json.
        recognitionTips: typeof d.recognitionTips === "string" ? d.recognitionTips : "",
      },
    };
  } else {
    return undefined;
  }

  // The API marks community maps private/no-store because the SIGNED-IN
  // view is personalised. This request carried no credentials, so the body
  // is the anonymous view and safe to share. Cache it under our own key.
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${MAP_DATA_TTL}` },
  })));
  return payload.notFound ? null : payload.mapData;
}

// Exported for the Node smoke test in ../test/buildSeo.test.mjs only.
export function buildSeo(d, slug, env) {
  const canonical = `${env.SITE_ORIGIN}/map/${slug}`;
  const name = String(d.name).trim();
  const isCountry = !!d.countryCode;
  // Tolerate raw API shapes as well as the normalised cache shape.
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const plays = num(d.plays);
  const hearts = num(d.hearts);
  const locationsCnt = num(d.locationsCnt) ?? (Array.isArray(d.data) && isCountry ? d.data.length : null);
  // Title and description come from shared/mapSeo.js, the same module
  // pages/map.js renders from, so the raw HTML and the hydrated page agree.
  const title = mapTitle(name);
  const facts = [];
  if (locationsCnt) facts.push(`${locationsCnt.toLocaleString("en-US")} Street View locations`);
  if (plays) facts.push(`${plays.toLocaleString("en-US")} plays`);
  const short = (d.description_short || "").trim().replace(/\s+/g, " ");
  const description = mapDescription(short, facts);

  const longParas = (d.description_long || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const tipParas = (typeof d.recognitionTips === "string" ? d.recognitionTips : "").split("\n").map((s) => s.trim()).filter(Boolean);
  const creator = isCountry ? "WorldGuessr" : (d.created_by || "").trim();
  const updated = d.lastUpdated ? String(d.lastUpdated).slice(0, 10) : null;

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "WorldGuessr", item: `${env.SITE_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Community Maps", item: `${env.SITE_ORIGIN}/maps` },
      { "@type": "ListItem", position: 3, name, item: canonical },
    ],
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonical,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: "WorldGuessr", url: env.SITE_ORIGIN },
    breadcrumb,
    ...(isCountry ? { about: { "@type": "Country", name } } : {}),
  };

  const headTags = [
    `<link rel="canonical" href="${attr(canonical)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="WorldGuessr">`,
    `<meta property="og:image" content="${env.SITE_ORIGIN}/worldguessr-1200x630.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
    `<script type="application/ld+json">${jsonScript(jsonLd)}</script>`,
  ].join("\n");

  // Crawlable map facts. pages/map.js removes this block on mount and shows
  // the same facts through its own components, so a rendering crawler and a
  // human see one copy each, never two.
  const factItems = [];
  if (locationsCnt) factItems.push(`<li>${esc(locationsCnt.toLocaleString("en-US"))} Street View locations</li>`);
  if (plays !== null) factItems.push(`<li>${esc(plays.toLocaleString("en-US"))} plays</li>`);
  if (hearts) factItems.push(`<li>${esc(hearts.toLocaleString("en-US"))} hearts</li>`);
  if (creator) factItems.push(`<li>Created by ${esc(creator)}</li>`);
  if (updated) factItems.push(`<li>Updated ${esc(updated)}</li>`);

  const bodyBlock = `
<section id="map-seo" style="max-width:760px;margin:24px auto 48px;padding:0 20px;color:#fff;font-family:Lexend,sans-serif;line-height:1.5">
  <h1>${esc(name)}</h1>
  ${short ? `<p>${esc(short)}</p>` : ""}
  ${longParas.map((p) => `<p>${esc(p)}</p>`).join("\n  ")}
  ${tipParas.length ? `<h2>How to recognize ${esc(name)}</h2>\n  ${tipParas.map((p) => `<p>${esc(p)}</p>`).join("\n  ")}` : ""}
  ${factItems.length ? `<ul>${factItems.join("")}</ul>` : ""}
  <p>
    <a href="/?map=${attr(slug)}" style="color:#fff">Play ${esc(name)}</a> ·
    <a href="/maps" style="color:#fff">All community maps</a> ·
    <a href="/" style="color:#fff">WorldGuessr, a free GeoGuessr alternative</a>
  </p>
</section>`;

  return { title, description, headTags, bodyBlock };
}

// ---------------------------------------------------------------------------
// /about: the static page states the community-map count that was baked in
// at build time. Rewrite every [data-map-count] with the live number so the
// crawler's copy is current. Anything short of a good count passes through.

async function aboutPage(request, env, ctx) {
  const [originRes, count] = await Promise.all([fetch(request), mapCount(env, ctx)]);
  if (!count || !originRes.ok || !(originRes.headers.get("content-type") || "").includes("text/html")) {
    return originRes;
  }
  const formatted = count.toLocaleString("en-US");
  const res = new HTMLRewriter()
    .on("[data-map-count]", { element(el) { el.setInnerContent(formatted); } })
    .transform(originRes);
  const h = new Headers(res.headers);
  h.set("x-seo-edge", "about");
  return new Response(res.body, { status: res.status, headers: h });
}

// Accepted community-map count from the API, edge-cached for an hour.
// Returns 0 when it cannot be read.
async function mapCount(env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`${env.SITE_ORIGIN}/__seo-cache/map-count`);
  const hit = await cache.match(cacheKey);
  if (hit) return (await hit.json()).count || 0;
  let apiRes;
  try {
    apiRes = await fetch(`${env.API_ORIGIN}/api/map/count`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
  } catch {
    return 0;
  }
  if (!apiRes.ok) return 0;
  const json = await apiRes.json();
  const count = Number.isInteger(json && json.count) && json.count > 0 ? json.count : 0;
  if (count) {
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify({ count }), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${MAP_DATA_TTL}` },
    })));
  }
  return count;
}

// ---------------------------------------------------------------------------
// /sitemap-maps.xml

async function sitemap(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`${env.SITE_ORIGIN}/__seo-cache/sitemap-maps.xml`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const apiRes = await fetch(`${env.API_ORIGIN}/api/map/sitemap`, {
    headers: { accept: "application/xml" },
    signal: AbortSignal.timeout(15000),
  });
  if (!apiRes.ok) return fetch(request);

  const res = new Response(apiRes.body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=${SITEMAP_TTL}`,
      "x-seo-edge": "sitemap",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ---------------------------------------------------------------------------
// escaping

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function attr(s) { return esc(s); }
// JSON inside <script>: escape the one sequence that could close the tag.
function jsonScript(obj) { return JSON.stringify(obj).replace(/</g, "\\u003c"); }
