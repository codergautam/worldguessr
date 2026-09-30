// ChinaGuessr (temporary): the shareable landing URL. The static export emits
// /china/index.html. Home requests each round from the server so the HTML and
// hydrated props never contain Baidu pool coordinates.
//
// Reachable only by this URL: no menu entry, no map-chooser tile. Listed in
// the sitemap (scripts/writeSitemap.mjs) and indexable since Aug 29 2026 at
// the owner's request; before that it was noindex and shared by hand.
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Home from '@/components/home';
import ChinaLanding from '@/components/china/ChinaLanding';
import { setChinaLandingUp } from '@/components/china/landingState';

// Landing phases. The overlay fades for OVERLAY_FADE_MS; the corner map's
// entrance (styles/china.scss, keyed off the wrapper class) runs a little
// longer, so the class outlives the overlay.
const OVERLAY_FADE_MS = 450;
const ENTRANCE_MS = 1200;

export default function ChinaPage() {
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
        <Home initialScreen="china" />
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
  return { props: {} };
}
