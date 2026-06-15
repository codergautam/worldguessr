import { asset } from '@/lib/basePath';

const sounds = {
  interfaceClick: { src: '/assets/sounds/interfaceClick.wav', volume: 0.55 },
  interfaceClickHover: { src: '/assets/sounds/interfaceClickHover.wav', volume: 0.35 },
  interfaceClickTone: { src: '/assets/sounds/interfaceClickTone.wav', volume: 0.6 },
  pop: { src: '/assets/sounds/pop.mp3', volume: 0.7 },
};

const cache = new Map();

function getBase(name) {
  const def = sounds[name];
  if (!def) return null;
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(asset(def.src));
    audio.preload = 'auto';
    cache.set(name, audio);
  }
  return audio;
}

export default function playSound(name) {
  if (typeof window === 'undefined') return;
  const def = sounds[name];
  if (!def) return;
  const base = getBase(name);
  if (!base) return;
  try {

    const node = base.cloneNode();
    node.volume = def.volume ?? 1;
    const p = node.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}
