import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import "@/styles/accountModal.css";
import "@/styles/mapModal.css";
import '@/styles/duel.css';

import { GoogleOAuthProvider } from '@react-oauth/google';

import { useEffect } from "react";
import { asset } from '@/lib/basePath';
import installErrorTracking from '@/lib/errorTracking';

import '@smastrom/react-rating/style.css'

function App({ Component, pageProps }) {
  useEffect(() => {
    // Set CSS custom properties for background images that need basePath
    document.documentElement.style.setProperty('--bg-street2', `url("${asset('/street2.webp')}")`);
    // Fade out the static body::before background now that React has taken over
    document.body.classList.add('app-ready');
  }, []);

  useEffect(() => installErrorTracking(), []);

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