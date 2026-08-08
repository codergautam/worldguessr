import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import "@/styles/accountModal.css";
import "@/styles/mapModal.css";
import '@/styles/duel.css';
import '@/styles/daily.scss';
import '@/styles/nameGlow.css';
import '@/styles/shop.css';
import '@/styles/playerCard.css';
import '@/styles/season1Badges.css';
import '@/styles/hallOfFame.css';

import { GoogleOAuthProvider } from '@react-oauth/google';

import { useEffect } from "react";
import { useRouter } from "next/router";
import { asset, stripBase } from '@/lib/basePath';
import { DEFAULT_BACKGROUND_PATH, backgroundUrlForSku, rememberSiteBackground } from '@/lib/siteBackground';
import { useSession } from '@/components/auth/auth';
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
  // Passive here: useSession only starts an auth fetch once window.cConfig
  // exists, and cConfig is set by the page (home.js), never by _app — so this
  // subscribes to the session rather than pulling one forward into the
  // pre-interaction window.
  const { data: session } = useSession();
  // URL of the background this visitor actually PAID for, or null — the shared
  // resolver in lib/siteBackground.js, which is also what the shop's equip and
  // /user's per-profile background go through.
  const equippedBackground = backgroundUrlForSku(session?.token?.cosmetics?.equipped?.background);
  // components/auth/auth.js: `false` means the session is still resolving,
  // `null` means genuinely signed out. The difference decides whether "no
  // background equipped" is an answer or just the absence of one.
  const sessionResolved = session !== false;

  useEffect(() => {
    // A PURCHASED background overrides the default. This is still the writer of
    // record — the session decides — but it is no longer the first paint an
    // owner sees: the pre-paint script in _document replays this device's last
    // equipped background so the reload does not flash London first. See the
    // cache contract in lib/siteBackground.js.
    //
    // REMOVING the property is not the same as writing the default URL into it,
    // and the removal branch is why this is safe to run for everybody: it hands
    // `--site-bg` back to the :root rule _document declared, so unequipping
    // leaves exactly one owner of the value instead of a stale inline copy that
    // would survive a future change to the default.
    //
    // IT ONLY REMOVES ONCE THE SESSION HAS RESOLVED. The first render of every
    // page has no session yet, so an unconditional removal here would delete
    // the pre-paint value and restore the exact flash this is meant to kill —
    // just later, and only for the people who paid.
    //
    // backgroundUrlForSku already applied basePath; the default is a bare
    // catalogue-style path and still needs it.
    const backgroundPath = equippedBackground || asset(DEFAULT_BACKGROUND_PATH);
    if (equippedBackground) {
      document.documentElement.style.setProperty('--site-bg', `url("${backgroundPath}")`);
      rememberSiteBackground(backgroundPath);
    } else if (sessionResolved) {
      document.documentElement.style.removeProperty('--site-bg');
      rememberSiteBackground(null);
    }

    let cancelled = false;
    const markAppReady = () => {
      if (!cancelled) document.body?.classList.add('app-ready');
    };

    const backgroundImage = new window.Image();
    backgroundImage.decoding = 'async';
    backgroundImage.onload = markAppReady;
    backgroundImage.onerror = markAppReady;
    backgroundImage.src = backgroundPath;

    if (backgroundImage.complete) markAppReady();

    return () => {
      cancelled = true;
      backgroundImage.onload = null;
      backgroundImage.onerror = null;
    };
    // Both deps are plain primitives derived from the session, so this runs
    // once for anonymous visitors and at most twice for a signed-in owner
    // (default, then their image). `app-ready` is additive — the second pass
    // re-adds a class the body already has, it never un-reveals the app.
  }, [equippedBackground, sessionResolved]);

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