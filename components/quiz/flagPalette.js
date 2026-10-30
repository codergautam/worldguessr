// The main colours of a flag, for the hit burst: the 40px flagcdn PNG read
// back from a tiny canvas (flagcdn serves CORS). Up to four colours that each
// cover at least 6% of the cloth; near-black is lifted so it still shows on
// the dark map. Cached per code; any failure gives green and white.

import { flagSrc } from '../modes/quizClient';

const FALLBACK = ['#4ade80', '#ffffff'];
const cache = new Map();

function read(img) {
  const w = 20;
  const h = 14;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const buckets = new Map();
  let seen = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    seen++;
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  const colors = [...buckets.values()]
    .filter((b) => b.n >= seen * 0.06)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((b) => {
      let [r, g, bl] = [b.r / b.n, b.g / b.n, b.b / b.n];
      if (0.299 * r + 0.587 * g + 0.114 * bl < 40) [r, g, bl] = [74, 74, 74];
      // canvas-confetti only reads hex.
      return `#${[r, g, bl].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    });
  return colors.length ? colors : FALLBACK;
}

export function flagPalette(code) {
  if (typeof window === 'undefined' || !code) return Promise.resolve(FALLBACK);
  if (!cache.has(code)) {
    cache.set(code, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try { resolve(read(img)); } catch { resolve(FALLBACK); }
      };
      img.onerror = () => resolve(FALLBACK);
      img.src = flagSrc(code, 40);
    }));
  }
  return cache.get(code);
}
