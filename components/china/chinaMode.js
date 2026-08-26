// ChinaGuessr (temporary): client-side constants for the Baidu-panorama mode.
// The mode is slug-driven — gameOptions.location === CHINA_SLUG IS the mode,
// so nothing has to be cleared when the player switches maps. Server code
// must not import this file (it uses the @/ alias).
import countryMaxDists from '@/public/countryMaxDists.json';

export const CHINA_SLUG = 'china';
export const CHINA_MAP_NAME = 'ChinaGuessr';
export const CHINA_MAX_DIST = countryMaxDists.CN; // 5019.239 km, same scale as a CN country map would use
// [west, south, east, north] — the CN bbox from public/genBorders.json, in the
// order components/Map.js sanitizeExtent expects.
export const CHINA_EXTENT = [73.5, 17.6, 134.8, 53.6];

export const isChinaMode = (gameOptions) => gameOptions?.location === CHINA_SLUG;
