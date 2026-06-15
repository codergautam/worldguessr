
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function keyFor(map) {
  if (!map) return 'unknown';
  return map.id || map.slug || map.countryMap || map.name || 'unknown';
}

const colorCache = new Map();

export function mapColor(map) {
  const k = keyFor(map);
  const cached = colorCache.get(k);
  if (cached) return cached;
  const seed = hashString(String(k));
  const hue = seed % 360;
  const accent = `hsl(${hue}, 70%, 62%)`;
  const accentDim = `hsl(${hue}, 50%, 26%)`;
  const accentSoft = `hsla(${hue}, 70%, 62%, 0.18)`;
  const out = { hue, accent, accentDim, accentSoft };
  colorCache.set(k, out);
  return out;
}

export function bannerBg(map) {
  const { accentDim } = mapColor(map);
  return `linear-gradient(135deg, ${accentDim} 0%, #0a0e1a 100%)`;
}
