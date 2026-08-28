# seo-edge

Cloudflare Worker on `www.worldguessr.com/map*` and `/sitemap-maps.xml`.
It fills the static `/map` shell with the real map's title, description,
canonical, JSON-LD and crawlable facts at the edge, for every map, with no
rebuild. It fails open: any error returns the origin page untouched.

## Deploy

Order matters: the API endpoint first, then the Worker.

1. Deploy the API server (it auto-mounts `api/map/sitemap.js` as
   `GET /api/map/sitemap`). Check: `curl -s "https://api.worldguessr.com/api/map/sitemap?page=2" | head -5`
2. From this folder:
   ```
   npx wrangler login
   npx wrangler deploy
   ```
   Wrangler creates the two routes from `wrangler.jsonc` on the
   `worldguessr.com` zone.

## Verify

```
curl -s -A "Mozilla/5.0 (compatible; GPTBot/1.2)" https://www.worldguessr.com/map/japan | grep -oE "<title>[^<]*</title>|rel=\"canonical\"[^>]*"
curl -sI https://www.worldguessr.com/map?s=japan | grep -iE "^(HTTP|location)"      # 301 → /map/japan
curl -s https://www.worldguessr.com/sitemap.xml; curl -s https://www.worldguessr.com/sitemap-maps-2.xml | head -6
curl -sI https://www.worldguessr.com/map/no-such-map-xyz | head -1                 # 404
```

Then in Search Console: Sitemaps → add `https://www.worldguessr.com/sitemap.xml`.

## Roll back

`npx wrangler delete` (or remove the two routes in the dashboard). The
`_redirects` rule in `public/` still serves `/map/<slug>` as before.

## Free tier

The Workers Free plan allows 100,000 requests per day and 10 ms CPU per
request. This Worker is routed only for map page HTML (`/map/*`), the
sitemaps and `/about`, never for assets, and `/maps` (the hub) is
deliberately outside the route. Map data is cached at the edge for an hour,
so the API is not hit per request.

One setting to flip once, in the dashboard: **Workers & Pages → your zone's
Workers settings → Request limit failure mode → Fail open.** With that, on a
day the quota is exhausted, routed requests bypass the Worker and the map
pages load from Pages as before (without the SEO tags). Without it the
default is fail closed, which would error those pages for the rest of the
day.

If usage ever nears the cap, Workers Paid is USD 5 a month for 10 million
requests.

## Notes

- `mapData` is cached at the edge for 1 hour per slug. A map edit shows in
  the raw HTML within the hour; the browser view is live as always.
- The `?crazygames` embed is passed through untouched.
- `pages/map.js` removes the injected `#map-seo` block on mount, so users
  never see two copies of the description.
