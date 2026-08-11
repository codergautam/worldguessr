import { asset } from '@/lib/basePath';
import { MARKER_SKIN_ICONS, PIN_PATHS } from '@/lib/markerIcons';

/* ===========================================================================
 *  Marker-skin preview images.
 *
 *  THE SHOP NO LONGER SHOWS THE MAP'S OWN ASSETS, and sharpness is the whole
 *  reason. The map pins live on src.png's 151x163 canvas and get stretched to
 *  the 30x49 icon box by Leaflet; the shop card imitated that by handing the
 *  full-size PNG to a 44x72 <img>, which left the BROWSER to do a ~3.4x
 *  non-uniform downscale. On the flat stock pin that mush is invisible — on
 *  the skins' 3px outlines it read as blur, which is exactly what the owner
 *  flagged ("the initial one doesn't").
 *
 *  So every pin now has a pre-rendered thumbnail under /pins/previews/, at
 *  88x144 — EXACTLY 2x the card's 44x72 box, with the map's canvas stretch
 *  already baked in by a lanczos resample at build time (see the recolor
 *  script). The browser's only remaining job is an integer 2:1 reduction,
 *  which cannot smear a line. The thumbnails are regenerated whenever the pin
 *  art is; a stale one shows a stale COLOUR, not a broken card.
 *
 *  THIS ALSO CUT THE SHOP'S LEAFLET DEPENDENCY. The old version imported the
 *  map chunk and read Leaflet icon objects purely to reuse their blob URLs —
 *  the price of not writing the paths twice. The paths are still not written
 *  twice: the preview path is DERIVED from the same PIN_PATHS table the map
 *  reads (basename swap into /pins/previews/), so the two stay joined at the
 *  filename and the shop costs no map code at all.
 *
 *  Resolves to {} on any failure; the cards then render without a pin rather
 *  than breaking the tab.
 * ======================================================================== */

/**
 * Reserved key for the STOCK guess pin — what the map draws when no marker skin
 * is equipped, and therefore what the Pins section's Default card previews.
 * The `__` prefix cannot collide with a catalogue sku (every marker sku is
 * `marker_*`).
 */
export const STOCK_PIN_KEY = '__stock';

const PATH_BY_KEY = new Map(PIN_PATHS.map(({ key, path }) => [key, path]));

/** /pins/gold.png -> /pins/previews/gold.png (src.png -> /pins/previews/src.png) */
function previewPath(mapPath) {
  const base = mapPath.slice(mapPath.lastIndexOf('/') + 1);
  return `/pins/previews/${base}`;
}

let pending = null;

/**
 * @returns {Promise<Record<string, string>>} sku -> image URL. Still a promise
 * purely so the call sites that awaited the old leaflet-reading version keep
 * working unchanged; nothing async remains underneath.
 */
export function loadMarkerSkinUrls() {
  if (pending) return pending;

  pending = (async () => {
    const urls = {};
    Object.entries(MARKER_SKIN_ICONS).forEach(([sku, key]) => {
      const path = PATH_BY_KEY.get(key);
      if (path) urls[sku] = asset(previewPath(path));
    });
    urls[STOCK_PIN_KEY] = asset(previewPath(PATH_BY_KEY.get('src') || '/src.png'));
    return urls;
  })().catch(() => ({}));

  return pending;
}
