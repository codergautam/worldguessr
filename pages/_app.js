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
import '@/styles/queueScreen.css';

import { GoogleOAuthProvider } from '@react-oauth/google';

import { useEffect } from "react";
import { useRouter } from "next/router";
import { asset, stripBase } from '@/lib/basePath';
import { DEFAULT_BACKGROUND_PATH, accentForSku, backgroundUrlForSku, paintSiteBackground } from '@/lib/siteBackground';
import { useSession } from '@/components/auth/auth';
import installErrorTracking from '@/lib/errorTracking';
import installGdFetchShim from '@/lib/gdFetchShim';
import getPlatform from '@/components/utils/getPlatform';
import { attachUiClickSounds } from '@/components/utils/audio';
import { installExternalLinkGuard } from '@/components/utils/externalLinks';
import { MultiplayerProvider } from '@/components/multiplayer/MultiplayerProvider';

import '@smastrom/react-rating/style.css'

// Install before hydration so console.error / window.error patches are live
// when React replays render errors during initial mount.
let __errorTrackingCleanup = null;
if (typeof window !== 'undefined') {
  // Must run before the first fetch of the session: GD's service worker blanks
  // every fetch() body on their hosting, so the GD build talks XHR instead.
  // See lib/gdFetchShim.js for the full story.
  if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === 'true') {
    installGdFetchShim();
  }
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
  //
  // The sku is kept alongside the URL because the accent is resolved from it
  // too, and an accent object cannot be an effect dependency (new identity
  // every render). The sku is a plain string and changes exactly when the URL
  // does.
  const equippedBackgroundSku = session?.token?.cosmetics?.equipped?.background || null;
  const equippedBackground = backgroundUrlForSku(equippedBackgroundSku);
  // components/auth/auth.js: `false` means the session is still resolving,
  // `null` means genuinely signed out. The difference decides whether "no
  // background equipped" is an answer or just the absence of one.
  const sessionResolved = session !== false;

  useEffect(() => {
    // A PURCHASED background overrides the default, and THE SESSION IS THE
    // WRITER OF RECORD — but not the first paint an owner sees. The pre-paint
    // script in _document replays this device's last equipped background so a
    // reload does not flash London first; this only confirms or corrects it.
    //
    // How the property is written, when it dissolves rather than cuts, why an
    // unequip REMOVES it instead of writing the default URL into it, and where
    // the accent lands in all that, are all one decision and they live in one
    // place: paintSiteBackground() in lib/siteBackground.js, which the shop's
    // equip calls too. This file's whole remaining job is deciding WHICH
    // background, and holding off until the file is actually loadable.
    //
    // backgroundUrlForSku already applied basePath; the default is a bare
    // catalogue-style path and still needs it.
    const backgroundPath = equippedBackground || asset(DEFAULT_BACKGROUND_PATH);
    const accent = accentForSku(equippedBackgroundSku);

    let cancelled = false;
    const markAppReady = () => {
      if (!cancelled) document.body?.classList.add('app-ready');
    };

    // THE SWAP WAITS FOR THE IMAGE, and the crossfade is what happens after.
    // Starting the dissolve the moment the session resolves would fade in a
    // layer pointed at a file the browser has not fetched yet — it would paint
    // nothing, so the "new" picture would arrive part-way through its own
    // fade. Preloading first is what makes the dissolve a dissolve.
    //
    // Waiting costs an owner nothing on a normal load: the pre-paint script in
    // _document already put their city up before React existed, a cached image
    // reports `complete` synchronously, and paintSiteBackground() does not
    // animate when the target already matches what is painted. What it buys is
    // the FIRST sign-in on a device, where there is no cached answer.
    //
    // IT ONLY HANDS BACK TO THE DEFAULT ONCE THE SESSION HAS RESOLVED. The
    // first render of every page has no session yet, so running this
    // unconditionally would dissolve a paying owner's background away to the
    // stock one and back every single load.
    const settle = () => {
      if (cancelled) return;
      if (equippedBackground || sessionResolved) {
        paintSiteBackground(backgroundPath, !!equippedBackground, accent);
      }
      markAppReady();
    };

    // An image that never resolves either way leaves the pre-paint value
    // standing, which is the safe direction: a stale correct background beats a
    // broken one.
    const backgroundImage = new window.Image();
    backgroundImage.decoding = 'async';
    backgroundImage.onload = settle;
    backgroundImage.onerror = settle;
    backgroundImage.src = backgroundPath;

    if (backgroundImage.complete) settle();

    return () => {
      cancelled = true;
      backgroundImage.onload = null;
      backgroundImage.onerror = null;
    };
    // All three deps are plain primitives derived from the session, so this runs
    // once for anonymous visitors and at most twice for a signed-in owner
    // (default, then their image). `app-ready` is additive — the second pass
    // re-adds a class the body already has, it never un-reveals the app.
    //
    // A CLIENT-SIDE SIGN-IN RE-RUNS THIS, which it did not used to: the session
    // it reads is the shared store in components/auth/auth.js, and until
    // publishSession() existed a fresh sign-in only ever reached home.js's local
    // copy. That is why an owner had to refresh before their background appeared.
  }, [equippedBackground, equippedBackgroundSku, sessionResolved]);

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
    // Poki and 6x don't own their URL: deploys live at a nested path with
    // document-relative assets (assetPrefix '.'), so router.replace('/es')
    // would strand the document at the CDN root and 404 every later chunk.
    // Locale still resolves in-app via localStorage/window.language.
    if (process.env.NEXT_PUBLIC_POKI === 'true' || process.env.NEXT_PUBLIC_6X === 'true') return;
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