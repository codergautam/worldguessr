// ChinaGuessr (temporary): the shareable landing URL. The static export emits
// /china/index.html; Home seeds the singleplayer screen with the China map.
//
// Round 1 is warm before the game mounts: the page carries a build-time
// sample of pool spots, hydration picks one at random and starts its metadata
// + base tiles right away, and the HTML preconnects both Baidu hosts (a
// ~1.4 s TLS handshake each from outside China) while the bundle is still
// loading. The full pool is fetched behind round 1 for the rounds after it.
//
// Reachable only by this URL: no menu entry, no map-chooser tile. Listed in
// the sitemap (scripts/writeSitemap.mjs) and indexable since Aug 29 2026 at
// the owner's request; before that it was noindex and shared by hand.
import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Home from '@/components/home';
import ChinaLanding from '@/components/china/ChinaLanding';
import { setChinaLandingUp } from '@/components/china/landingState';
import { warmPano, BAIDU_HOSTS } from '@/components/china/baidu';

const SEED_SAMPLE = 60;

// Round-1 picks this browser has had, newest last. The site's own seen-ring
// (components/utils/seenLocations.js) only records official maps, and the
// china slug is not one, so this keeps its own short list: a tester who
// reloads /china ten times gets ten different openers.
const RECENT_KEY = 'wg_china_recent_seeds';
const RECENT_CAP = 30;
function readRecent() {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch (e) { return []; }
}
function writeRecent(list) {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(-RECENT_CAP))); } catch (e) { /* private mode */ }
}

// One pick per page mount; a repeat call inside the same second returns the
// same spot so a double-invoked initializer cannot warm two panos. Random
// among the baked spots not seen recently (all of them, if every one has been).
let lastPick = null;
function pickSeed(seedLocations) {
  if (typeof window === 'undefined' || !seedLocations?.length) return { seed: null, warm: null };
  if (lastPick && Date.now() - lastPick.at < 1000) return lastPick;
  const recent = readRecent();
  const fresh = seedLocations.filter((loc) => !recent.includes(loc.panoId));
  const pool = fresh.length ? fresh : seedLocations;
  const seed = pool[Math.floor(Math.random() * pool.length)];
  writeRecent([...recent.filter((id) => id !== seed.panoId), seed.panoId]);
  lastPick = { seed, warm: warmPano(seed.panoId), at: Date.now() };
  return lastPick;
}

// Landing phases. The overlay fades for OVERLAY_FADE_MS; the corner map's
// entrance (styles/china.scss, keyed off the wrapper class) runs a little
// longer, so the class outlives the overlay.
const OVERLAY_FADE_MS = 450;
const ENTRANCE_MS = 1200;

export default function ChinaPage({ seedLocations }) {
  const [{ seed }] = useState(() => pickSeed(seedLocations));
  // 'landing' (overlay up, game loading under it) -> 'leaving' (overlay fading,
  // map sliding in) -> 'entering' (overlay gone, map still arriving) -> 'playing'.
  const [phase, setPhase] = useState('landing');

  // The navbar reads this (Menu label, no reload button) while the cover is up.
  useEffect(() => {
    setChinaLandingUp(phase === 'landing');
    return () => setChinaLandingUp(false);
  }, [phase]);

  useEffect(() => {
    if (phase === 'leaving') {
      const t = setTimeout(() => setPhase('entering'), OVERLAY_FADE_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'entering') {
      const t = setTimeout(() => setPhase('playing'), ENTRANCE_MS - OVERLAY_FADE_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const wrapperClass = phase === 'landing' ? 'china-page--landing'
    : phase === 'playing' ? '' : 'china-page--entering';

  return (
    <>
      <Head>
        {BAIDU_HOSTS.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
      </Head>
      {/* display:contents — a class hook only, never a box, so Home's fixed and
          absolute layers keep the viewport as their containing block. */}
      <div className={wrapperClass} style={{ display: 'contents' }}>
        <Home initialScreen="china" initialLocation={seed} />
      </div>
      {(phase === 'landing' || phase === 'leaving') && (
        <ChinaLanding
          leaving={phase === 'leaving'}
          onPlay={() => setPhase('leaving')}
        />
      )}
    </>
  );
}

export async function getStaticProps() {
  const rows = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'china-baidu.json'), 'utf8'));
  const seedLocations = [];
  const taken = new Set();
  while (seedLocations.length < Math.min(SEED_SAMPLE, rows.length)) {
    const i = Math.floor(Math.random() * rows.length);
    if (taken.has(i)) continue;
    taken.add(i);
    const row = rows[i];
    seedLocations.push({ lat: row.lat, long: row.lng, panoId: row.panoId, country: row.country, provider: 'baidu' });
  }
  return { props: { seedLocations } };
}
