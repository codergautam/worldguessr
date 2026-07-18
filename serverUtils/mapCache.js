import { syncedClearCache } from './cacheBus.js';

/**
 * Single choke point for invalidating everything that caches a map's data:
 * the recachegoose keys on this process + peers (cacheBus), and Cloudflare's
 * edge copy of /mapLocations/<slug> (purge-by-URL, available on all CF plans).
 *
 * The CF purge lets the 8h edge cache rule on /mapLocations stay (server-load
 * shield) while edits still go live worldwide instantly. Browser freshness is
 * handled separately: the route sends max-age=0, so the CF rule's Browser
 * Cache TTL must be "Respect Existing Headers".
 *
 * CF purge needs three env vars on the API process — without them it is a
 * silent no-op so dev/self-hosted setups need no config:
 *   CF_API_TOKEN       token with the Zone.Cache Purge permission
 *   CF_ZONE_ID         zone id from the CF dashboard overview page
 *   PUBLIC_API_ORIGIN  public base of this API, e.g. https://api.worldguessr.com
 */
export function clearMapCaches(slug) {
  syncedClearCache('mapLocations_' + slug);
  syncedClearCache('mapPublicData_' + slug);

  const token = process.env.CF_API_TOKEN;
  const zone = process.env.CF_ZONE_ID;
  const origin = process.env.PUBLIC_API_ORIGIN;
  if (!token || !zone || !origin) return;

  // Fire-and-forget: a failed purge must never fail the map save — worst case
  // the edge serves stale until its TTL, which is the pre-purge status quo.
  fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: [`${origin}/mapLocations/${encodeURIComponent(slug)}`] }),
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.warn(`[cfPurge] ${slug}: HTTP ${r.status} ${body.slice(0, 300)}`);
    }
  }).catch((err) => {
    console.warn(`[cfPurge] ${slug}: ${err.message}`);
  });
}
