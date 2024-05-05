import "@/styles/globals.css";
import "@/styles/multiPlayerModal.css";
import { SessionProvider } from "next-auth/react";

import { GoogleAnalytics } from "nextjs-google-analytics";
import { useEffect } from "react";

import "./globals.css"
import {ThemeProvider as NextThemesProvider} from "@/components/themes/theme-provider";
export default function App({ Component, pageProps }) {
  useEffect(() => {
    console.log("App mounted - build 2");
  });
  return (
    <>
      <GoogleAnalytics trackPageViews gaMeasurementId="G-KFK0S0RXG5" />
      <SessionProvider session={pageProps.session}>
              <NextThemesProvider
            attribute="class"
            defaultTheme="light"
            disableTransitionOnChange>
            <Component {...pageProps} />
        </NextThemesProvider>
      </SessionProvider>
    </>
  );
}
