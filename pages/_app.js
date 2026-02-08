import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import "@/styles/accountModal.css";
import "@/styles/mapModal.css";
import '@/styles/duel.css';

import { GoogleOAuthProvider } from '@react-oauth/google';

import { useEffect } from "react";

import '@smastrom/react-rating/style.css'

function App({ Component, pageProps }) {
  useEffect(() => {
    const handleError = (event) => {
      // window.gtag?.('event', 'exception', {
      //   description: event.message || 'Unknown error',
      //   fatal: false,
      // });
    };

    const handleRejection = (event) => {
      // window.gtag?.('event', 'exception', {
      //   description: event.reason?.message || 'Unhandled promise rejection',
      //   fatal: false,
      // });
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