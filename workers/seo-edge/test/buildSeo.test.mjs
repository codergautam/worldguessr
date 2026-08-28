// Smoke test: `node test/buildSeo.test.mjs [--local] [slug...]` pulls real
// public map data (or, with --local, a country map straight from
// public/officialCountryMaps.json, the way the API will serve it once
// deployed) and prints what the Worker would put in the HTML. No Workers
// runtime needed; buildSeo is pure. Default slugs cover one country map and
// one community map.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import seoWorker, { buildSeo } from "../src/index.js";

const env = { SITE_ORIGIN: "https://www.worldguessr.com", API_ORIGIN: "https://api.worldguessr.com" };
const args = process.argv.slice(2);
const local = args.includes("--local");
const slugs = args.filter((a) => a !== "--local");
if (!slugs.length) slugs.push("japan", "capitals-of-the-world");

async function verifyLookupFailureHandling() {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const originalHTMLRewriter = globalThis.HTMLRewriter;

  class FakeHTMLRewriter {
    on(_selector, handler) { this.handler = handler; return this; }
    transform(response) {
      let injected = "";
      this.handler.element({ append(html) { injected += html; } });
      return new Response(`<html><head>${injected}</head></html>`, { status: response.status, headers: response.headers });
    }
  }

  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.HTMLRewriter = FakeHTMLRewriter;
  let apiMode = "failure";
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === `${env.SITE_ORIGIN}/map`) {
      return new Response("<html><head></head><body></body></html>", { headers: { "content-type": "text/html" } });
    }
    if (url.startsWith(`${env.API_ORIGIN}/api/map/publicData`)) {
      if (apiMode === "failure") throw new Error("simulated API outage");
      return new Response("", { status: 404 });
    }
    if (url === `${env.SITE_ORIGIN}/map/japan`) {
      return new Response("origin fallback", { headers: { "content-type": "text/html" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await seoWorker.fetch(
      new Request(`${env.SITE_ORIGIN}/map/japan`),
      env,
      { waitUntil() {} },
    );
    assert.equal(await response.text(), "origin fallback");
    assert.equal(response.headers.get("x-seo-edge"), null);

    apiMode = "not-found";
    const missingResponse = await seoWorker.fetch(
      new Request(`${env.SITE_ORIGIN}/map/no-such-map`),
      env,
      { waitUntil() {} },
    );
    assert.equal(missingResponse.status, 404);
    assert.match(await missingResponse.text(), /name="robots" content="noindex"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (originalHTMLRewriter === undefined) delete globalThis.HTMLRewriter;
    else globalThis.HTMLRewriter = originalHTMLRewriter;
  }
}

await verifyLookupFailureHandling();

async function load(slug) {
  if (local) {
    const json = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../../public/officialCountryMaps.json"), "utf8"));
    const m = json.find((x) => x.slug === slug);
    if (!m) return null;
    // api/map/publicData.js shape for a country map.
    return { ...m, description_short: m.shortDescription, description_long: m.longDescription, created_by: "WorldGuessr" };
  }
  const res = await fetch(`${env.API_ORIGIN}/api/map/publicData?slug=${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
  if (!res.ok) { console.log(`${slug}: API ${res.status}`); return null; }
  return (await res.json()).mapData;
}

for (const slug of slugs) {
  const mapData = await load(slug);
  if (!mapData) continue;
  const seo = buildSeo(mapData, slug, env);
  console.log(`\n=== ${slug}`);
  console.log("title:", seo.title, `(${seo.title.length})`);
  console.log("description:", seo.description, `(${seo.description.length})`);
  console.log("head tags:\n" + seo.headTags);
  console.log("body block:\n" + seo.bodyBlock);
  for (const [k, v] of Object.entries(seo)) {
    if (typeof v === "string" && /<script>|javascript:/i.test(v.replace(/<script type="application\/ld\+json">/g, ""))) {
      throw new Error(`unescaped content in ${k}`);
    }
  }
}
