# seo-edge

Cloudflare Worker on `www.worldguessr.com/map*` and `/sitemap-maps.xml`.
It fills the static `/map` shell with the real map's title, description,
canonical, JSON-LD and crawlable facts at the edge, for every map, with no
rebuild. It fails open: any error returns the origin page untouched.

## Deploy

Order matters: the API endpoint first, then the Worker.

1. Deploy the API server (it auto-mounts `api/map/sitemap.js` as
   `GET /api/map/sitemap`). Check: `curl -s https://api.worldguessr.com/api/map/sitemap | head -5`
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
curl -s https://www.worldguessr.com/sitemap-maps.xml | head -8
curl -sI https://www.worldguessr.com/map/no-such-map-xyz | head -1                 # 404
```

Then in Search Console: Sitemaps → add `https://www.worldguessr.com/sitemap.xml`.

## Roll back

`npx wrangler delete` (or remove the two routes in the dashboard). The
`_redirects` rule in `public/` still serves `/map/<slug>` as before.

## Notes

- `mapData` is cached at the edge for 1 hour per slug. A map edit shows in
  the raw HTML within the hour; the browser view is live as always.
- The `?crazygames` embed is passed through untouched.
- `pages/map.js` removes the injected `#map-seo` block on mount, so users
  never see two copies of the description.
