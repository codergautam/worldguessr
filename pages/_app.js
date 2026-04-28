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

import '@smastrom/react-rating/style.css'

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

  useEffect(() => installErrorTracking(), []);

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
  }, []);

  return (
    <>
      { process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID  ? (
      <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      <Component {...pageProps} />
      </GoogleOAuthProvider>
      ) : (
        <Component {...pageProps} />
      )}
    </>
  );
}

export default App;