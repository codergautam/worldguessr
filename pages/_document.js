import { Html, Head, Main, NextScript } from "next/document";
import { Partytown } from '@qwik.dev/partytown/react';

export default function Document() {
  return (
    <Html lang="en" style={{ backgroundColor: '#000000' }}>
      <Head>
        {/* Font preconnects and stylesheets */}
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Jockey+One&family=Lexend:wght@100..900&family=Rubik:wght@400;500;600;700&display=swap" rel="stylesheet"/>

        <Partytown
          debug={process.env.NODE_ENV === 'development'}
          forward={['nitroAds', 'nitroAds.createAd', 'nitroAds.queue', 'nitroAds.addUserToken', 'dataLayer.push', 'gtag']}
        />
        {/* Google Analytics - gtag must be defined on main thread for forwarding to work */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              window.gtag = function(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-KFK0S0RXG5');
            `,
          }}
        />
        {/* Load gtag.js in web worker via Partytown */}
        <script
          type="text/partytown"
          src="https://www.googletagmanager.com/gtag/js?id=G-KFK0S0RXG5"
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              background-color: #000000 !important;
              margin: 0;
              padding: 0;
            }
          `
        }} />
      </Head>
      <body className="mainBody" style={{ backgroundColor: '#000000' }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
