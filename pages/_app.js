import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import "@/styles/accountModal.css";
import "@/styles/mapModal.css";
import '@/styles/duel.css';
import '@/styles/daily.scss';

import { GoogleOAuthProvider } from '@react-oauth/google';

import { useEffect } from "react";
import { useRouter } from "next/router";
import { asset, stripBase } from '@/lib/basePath';
import installErrorTracking from '@/lib/errorTracking';
import getPlatform from '@/components/utils/getPlatform';
import { MultiplayerProvider } from '@/components/multiplayer/MultiplayerProvider';

import '@smastrom/react-rating/style.css'

// Install before hydration so console.error / window.error patches are live
// when React replays render errors during initial mount.
let __errorTrackingCleanup = null;
if (typeof window !== 'undefined') {
  __errorTrackingCleanup = installErrorTracking();
  // Fast Refresh / HMR: tear down so edits to errorTracking.js take effect
  // without a full page reload, and so we don't leak listeners across reloads.
  if (typeof module !== 'undefined' && module.hot) {
    module.hot.dispose(() => {
      try {
        __errorTrackingCleanup?.();
      } catch (_) { /* noop */ }
    });
  }
}

const SUPPORTED_LOCALES = ["es", "fr", "de", "ru"];

function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    // Set CSS custom properties for background images that need basePath
    const streetBackground = asset('/street2.webp');
    document.documentElement.style.setProperty('--bg-street2', `url("${streetBackground}")`);

    let cancelled = false;
    const markAppReady = () => {
      if (!cancelled) document.body.classList.add('app-ready');
    };

    const backgroundImage = new window.Image();
    backgroundImage.decoding = 'async';
    backgroundImage.onload = markAppReady;
    backgroundImage.onerror = markAppReady;
    backgroundImage.src = streetBackground;

    if (backgroundImage.complete) markAppReady();

    return () => {
      cancelled = true;
      backgroundImage.onload = null;
      backgroundImage.onerror = null;
    };
  }, []);

  // Field Web Vitals → GA4. CrUX shows failures (CLS especially) happening
  // mid-session where Lighthouse's load-only trace can't see them; the
  // attribution build names the exact element/interaction responsible so
  // fixes target the real culprit. Dynamically imported post-hydration so it
  // never sits on the critical path. gtag is a queueing stub from _document,
  // so events buffer safely until GTM loads on window load.
  useEffect(() => {
    let cancelled = false;
    import('web-vitals/attribution').then(({ onCLS, onINP, onLCP }) => {
      if (cancelled) return;
      const send = ({ name, value, id, rating, attribution }) => {
        const debugTarget = name === 'CLS' ? attribution?.largestShiftTarget
          : name === 'INP' ? attribution?.interactionTarget
          : attribution?.element;
        window.gtag?.('event', name, {
          // GA4 wants integers; CLS is a unitless fraction so scale it up
          value: Math.round(name === 'CLS' ? value * 1000 : value),
          metric_id: id,
          metric_rating: rating,
          debug_target: debugTarget || '(not set)',
          non_interaction: true,
        });
      };
      onCLS(send);
      onINP(send);
      onLCP(send);
    }).catch(() => { /* metrics are best-effort */ });
    return () => { cancelled = true; };
  }, []);

  // Tag the GA session with the platform (worldguessr / coolmath / crazygames /
  // gamedistribution / ...) so users can be segmented by source. Embedded SDKs
  // (CrazyGames) load async, so re-check shortly after mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const setPlatform = () => {
      try {
        window.gtag?.('set', 'user_properties', { platform: getPlatform() });
      } catch (_) { /* noop */ }
    };
    setPlatform();
    const t = setTimeout(setPlatform, 2000);
    return () => clearTimeout(t);
  }, []);

  // Auto-redirect first-time visitors at `/` to their device locale (es/fr/de/ru)
  // if it's supported. Client-only so SSR / crawlers keep seeing English at `/`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const path = stripBase(window.location.pathname || '/');
      if (path !== '/') return; // only redirect from the bare root

      // Skip if the user already picked a language (stored by /langSwitcher or prior visit)
      const stored = window.localStorage.getItem("lang");
      if (stored) return;

      const code = (navigator.language || "").slice(0, 2).toLowerCase();
      if (!SUPPORTED_LOCALES.includes(code)) return;

      // Preserve query string / hash when redirecting
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      router.replace(`/${code}${search}${hash}`);
    } catch (e) { /* noop — English fallback is fine */ }
  }, [router]);

  return (
    <MultiplayerProvider>
      { process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID  ? (
      <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      <Component {...pageProps} />
      </GoogleOAuthProvider>
      ) : (
        <Component {...pageProps} />
      )}
    </MultiplayerProvider>
  );
}

export default App;