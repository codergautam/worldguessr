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
import { dailyBackgroundPath } from '@/lib/dailyBackground';
import installErrorTracking from '@/lib/errorTracking';
import getPlatform from '@/components/utils/getPlatform';
import { attachUiClickSounds } from '@/components/utils/audio';
import { installExternalLinkGuard } from '@/components/utils/externalLinks';
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
    // Set CSS custom properties for background images that need basePath.
    // dailyBackgroundPath rotates per UTC day; _document.js already set the
    // identical value pre-paint, so this is a same-value re-assert plus the
    // app-ready preload gate below waiting on the right image.
    const streetBackground = asset(dailyBackgroundPath());
    document.documentElement.style.setProperty('--bg-street2', `url("${streetBackground}")`);

    // Prefetch TOMORROW's background at idle so the daily rotation never
    // costs a cold LCP fetch: today's first visit finds the image already
    // in HTTP cache from yesterday's session. Lowest-priority hint, deferred
    // past the pre-interaction window (perf-overhaul rule); portals resolve
    // every day to street2 so the guard makes this a no-op there.
    const tomorrowBackground = asset(dailyBackgroundPath(Date.now() + 86400000));
    if (tomorrowBackground !== streetBackground && typeof document !== 'undefined') {
      const prefetchTomorrow = () => {
        if (document.querySelector(`link[rel="prefetch"][href="${tomorrowBackground}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = tomorrowBackground;
        document.head.appendChild(link);
      };
      if ('requestIdleCallback' in window) requestIdleCallback(prefetchTomorrow, { timeout: 15000 });
      else setTimeout(prefetchTomorrow, 8000);
    }

    let cancelled = false;
    const markAppReady = () => {
      if (!cancelled) document.body?.classList.add('app-ready');
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

  // Main-menu click sound: one delegated listener scoped to the home
  // .g2_nav_ui menu (only — not app-wide). Attaching a listener is free; the
  // sound itself loads on the first interaction, so the pre-interaction
  // window stays empty.
  useEffect(() => {
    attachUiClickSounds();
  }, []);

  // GameDistribution forbids the game navigating away or opening tabs. Every
  // known link is fixed at its source; this is the backstop for the surfaces
  // that don't exist yet. No-op on every other build.
  useEffect(() => installExternalLinkGuard(), []);

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
    // Poki doesn't own its URL: deploys live at a nested per-version path with
    // document-relative assets (assetPrefix '.'), so router.replace('/es')
    // would strand the document at the CDN root and 404 every later chunk.
    // Locale still resolves in-app via localStorage/window.language.
    if (process.env.NEXT_PUBLIC_POKI === 'true') return;
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