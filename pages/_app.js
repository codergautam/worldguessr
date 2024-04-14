import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/react"
import { GoogleAnalytics } from "nextjs-google-analytics";
export default function App({ Component, pageProps }) {
  return (
    <>
      <Analytics />
      <GoogleAnalytics trackPageViews gaMeasurementId="G-KFK0S0RXG5" />
      <Component {...pageProps} />
    </>
  );
}
