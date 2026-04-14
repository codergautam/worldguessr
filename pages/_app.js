import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import "@/styles/accountModal.css";
import "@/styles/mapModal.css";
import '@/styles/duel.css';

import { GoogleOAuthProvider } from '@react-oauth/google';

import { useEffect } from "react";
import { asset } from '@/lib/basePath';

import '@smastrom/react-rating/style.css'

function App({ Component, pageProps }) {
  useEffect(() => {
    // Set CSS custom properties for background images that need basePath
    document.documentElement.style.setProperty('--bg-street2', `url("${asset('/street2.webp')}")`);
    // Fade out the static body::before background now that React has taken over
    document.body.classList.add('app-ready');
  }, []);

  useEffect(() => {
    const ignoredErrors = [
      'ResizeObserver loop',
      'net::ERR_',
      'CORS',
      'Script error',
      'Load failed',
    ];
    const shouldIgnore = (msg) => !msg || ignoredErrors.some((e) => msg.includes(e));

    const handleError = (event) => {
      if (shouldIgnore(event.message)) return;
      window.gtag?.('event', 'exception', {
        description: event.message,
        fatal: false,
      });
    };

    const handleRejection = (event) => {
      const msg = event.reason?.message || '';
      if (shouldIgnore(msg)) return;
      window.gtag?.('event', 'exception', {
        description: msg || 'Unhandled promise rejection',
        fatal: false,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
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