import "@/styles/globals.scss";
import "@/styles/multiPlayerModal.css";
import { SessionProvider } from "next-auth/react";

import { GoogleAnalytics } from "nextjs-google-analytics";
import { useEffect } from "react";
import { appWithTranslation } from 'next-i18next'

import '@smastrom/react-rating/style.css'

function App({ Component, pageProps }) {
  useEffect(() => {
    console.log("App mounted - build 2");
  });
  return (
    <>
      <GoogleAnalytics trackPageViews gaMeasurementId="G-KFK0S0RXG5" />
      <SessionProvider session={pageProps.session}>
      <Component {...pageProps} />
      </SessionProvider>
    </>
  );
}

export default appWithTranslation(App);