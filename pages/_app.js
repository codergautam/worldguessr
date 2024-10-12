import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";

import { GoogleAnalytics } from "nextjs-google-analytics";
import { useEffect } from "react";

import '@smastrom/react-rating/style.css'

function App({ Component, pageProps }) {
  return (
    <>
      <GoogleAnalytics trackPageViews gaMeasurementId="G-KFK0S0RXG5" />
      <Component {...pageProps} />
    </>
  );
}

export default App;