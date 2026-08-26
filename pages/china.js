// ChinaGuessr (temporary): the shareable landing URL. The static export emits
// /china/index.html; Home seeds the singleplayer screen with the China map.
//
// Round 1 is warm before the game mounts: the page carries a build-time
// sample of pool spots, hydration picks one and starts its metadata + base
// tiles right away, and the HTML preconnects both Baidu hosts (a ~1.4 s TLS
// handshake each from outside China) while the bundle is still loading. The
// full pool is fetched behind round 1 for the rounds after it.
//
// Reachable ONLY by this URL: no menu entry, no map-chooser tile, not in the
// sitemap, and noindex here. It is shared by hand with a few people.
import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Home from '@/components/home';
import ChinaLanding from '@/components/china/ChinaLanding';
import { setChinaLandingUp } from '@/components/china/landingState';
import { warmPano, sdataUrl, tileUrl, BAIDU_HOSTS } from '@/components/china/baidu';
import { orderByFreshness, locKey } from '@/shared/locations/repeatGuard.js';
import { seenLocs } from '@/components/utils/seenLocations';

const SEED_SAMPLE = 40;

// One pick per page mount; a repeat call inside the same second returns the
// same spot so a double-invoked initializer cannot warm two panos. The first
// baked spot is the one the HTML already preloads, so a new visitor takes it;
// a returning player who has seen it gets a fresh one from the rest.
let lastPick = null;
function pickSeed(seedLocations) {
  if (typeof window === 'undefined' || !seedLocations?.length) return { seed: null, warm: null };
  if (lastPick && Date.now() - lastPick.at < 1000) return lastPick;
  const seen = seenLocs();
  const seed = seen.includes(locKey(seedLocations[0]))
    ? (orderByFreshness(seedLocations.slice(1), seen)[0] || seedLocations[0])
    : seedLocations[0];
  lastPick = { seed, warm: warmPano(seed.panoId), at: Date.now() };
  return lastPick;
}

// Landing phases. The overlay fades for OVERLAY_FADE_MS; the corner map's
// entrance (styles/china.scss, keyed off the wrapper class) runs a little
// longer, so the class outlives the overlay.
const OVERLAY_FADE_MS = 450;
const ENTRANCE_MS = 1200;

// Started by the HTML parser, ahead of the JS bundle: the reveal needs
// exactly sdata + z0 + the z1 pair. crossOrigin matches the renderer's
// anonymous Image() and plain fetch() so the preloads are the same cache entries.
const preloadLinks = (seed) => !seed ? [] : [
  { href: sdataUrl(seed.panoId), as: 'fetch' },
  { href: tileUrl(seed.panoId, 0, 0, 0), as: 'image' },
  { href: tileUrl(seed.panoId, 1, 0, 0), as: 'image' },
  { href: tileUrl(seed.panoId, 1, 1, 0), as: 'image' },
];

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
        <meta name="robots" content="noindex" />
        {BAIDU_HOSTS.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
        {preloadLinks(seedLocations?.[0]).map((link) => (
          <link key={link.href} rel="preload" href={link.href} as={link.as} crossOrigin="anonymous" />
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
