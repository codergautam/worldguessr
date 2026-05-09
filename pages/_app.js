import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import "@/styles/accountModal.css";
import "@/styles/mapModal.css";
import '@/styles/duel.css';
import '@/styles/daily.scss';

import { GoogleOAuthProvider } from '@react-oauth/google';

import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { asset, stripBase } from '@/lib/basePath';
import installErrorTracking from '@/lib/errorTracking';
import installReloadDiagnostics from '@/lib/reloadDiagnostics';
import { installGlobalHaptics } from '@/lib/haptics';
import { MultiplayerProvider } from '@/components/multiplayer/MultiplayerProvider';
import NativeAuthSheet from '@/components/auth/NativeAuthSheet';

import '@smastrom/react-rating/style.css'

const SAFE_AREA_VAR_FALLBACK = 'env(safe-area-inset-top, 0px)';

// Install before hydration so console.error / window.error patches are live
// when React replays render errors during initial mount.
let __errorTrackingCleanup = null;
let __reloadDiagnosticsCleanup = null;
if (typeof window !== 'undefined') {
  __reloadDiagnosticsCleanup = installReloadDiagnostics();
  __errorTrackingCleanup = installErrorTracking();
  // Fast Refresh / HMR: tear down so edits to errorTracking.js take effect
  // without a full page reload, and so we don't leak listeners across reloads.
  if (typeof module !== 'undefined' && module.hot) {
    module.hot.dispose(() => {
      try {
        __reloadDiagnosticsCleanup?.();
        __errorTrackingCleanup?.();
      } catch (_) { /* noop */ }
    });
  }
}

const SUPPORTED_LOCALES = ["es", "fr", "de", "ru"];

function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const log = window.__wgReloadDiagnostics?.log;
    if (!log || !router?.events) return;

    const handleStart = (url, meta) => log('routeChangeStart', { url, shallow: meta?.shallow });
    const handleComplete = (url, meta) => log('routeChangeComplete', { url, shallow: meta?.shallow });
    const handleError = (error, url, meta) => {
      log('routeChangeError', {
        url,
        shallow: meta?.shallow,
        cancelled: !!error?.cancelled,
        message: error?.message,
      });
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleError);
    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleError);
    };
  }, [router]);

  useEffect(() => {
    return installGlobalHaptics();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const capacitor = window.Capacitor;
    const isNative = !!(
      capacitor?.isNativePlatform?.() ||
      (capacitor?.getPlatform && capacitor.getPlatform() !== 'web')
    );

    document.documentElement.style.setProperty('--wg-safe-top', '0px');
    if (!isNative) return;

    document.body.classList.add('capacitor-native');
    document.documentElement.style.setProperty('--wg-safe-top', SAFE_AREA_VAR_FALLBACK);

    const safeArea = capacitor?.Plugins?.SafeArea;
    const applyNativeInsets = (result) => {
      const top = Number(result?.insets?.top);
      if (Number.isFinite(top)) {
        document.documentElement.style.setProperty('--wg-safe-top', `${top}px`);
      }
    };

    const refreshNativeInsets = () => {
      safeArea?.getSafeAreaInsets?.().then(applyNativeInsets).catch(() => {});
    };

    refreshNativeInsets();
    window.addEventListener('resize', refreshNativeInsets);
    window.addEventListener('orientationchange', refreshNativeInsets);
    window.visualViewport?.addEventListener('resize', refreshNativeInsets);

    return () => {
      document.body.classList.remove('capacitor-native');
      document.documentElement.style.setProperty('--wg-safe-top', '0px');
      window.removeEventListener('resize', refreshNativeInsets);
      window.removeEventListener('orientationchange', refreshNativeInsets);
      window.visualViewport?.removeEventListener('resize', refreshNativeInsets);
    };
  }, []);

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
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <MultiplayerProvider>
        { process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID  ? (
        <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
        <NativeAuthSheet />
        <Component {...pageProps} />
        </GoogleOAuthProvider>
        ) : (
          <>
            <NativeAuthSheet />
            <Component {...pageProps} />
          </>
        )}
      </MultiplayerProvider>
    </>
  );
}

export default App;
