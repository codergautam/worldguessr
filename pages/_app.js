import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";

import { GoogleAnalytics } from "nextjs-google-analytics";
import { GoogleOAuthProvider } from '@react-oauth/google';

import '@smastrom/react-rating/style.css'

function App({ Component, pageProps }) {
  console.log("Rendering the component",Component.name);
  return (
    <>
      <GoogleAnalytics trackPageViews gaMeasurementId="G-KFK0S0RXG5" />
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