import { Html, Head, Main, NextScript } from "next/document";
import { DEFAULT_BACKGROUND_LQIP, DEFAULT_BACKGROUND_PATH, IS_PORTAL_BUILD, PREPAINT_SITE_BG_SCRIPT } from "@/lib/siteBackground";

// The language homepages export localized HTML, but a hardcoded lang="en"
// told Google the Spanish/French/... pages were English — one more reason it
// mixed the language variants up in search results.
const PATH_LANGS = { "/es": "es", "/fr": "fr", "/de": "de", "/ru": "ru" };

export default function Document({ pathname }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const backgroundUrl = `${basePath}${DEFAULT_BACKGROUND_PATH}`;

  return (
    <Html lang={PATH_LANGS[pathname] || "en"} translate="no" className="notranslate" style={{ backgroundColor: '#000000' }}>
      <Head>
        <meta name="google" content="notranslate" />
        {/* The site background (lib/siteBackground.js) is the LCP asset every
            visitor downloads before first paint, so it is preloaded at high
            priority and declared as a plain CSS var below — BAKED, not
            computed. Baked matters twice: no script sits in front of first
            paint, and scripts/packageEmbed.mjs rewrites baked asset refs when
            it builds the offline portal zips, which a runtime-computed URL
            would escape. A purchased background overrides the var after
            hydration (pages/_app.js). */}
        <link rel="preload" href={backgroundUrl} as="image" type="image/webp" fetchpriority="high" />

        {/* An OWNER's purchased background, painted on the first frame instead
            of after the auth round-trip that resolves it — see the cache
            contract in lib/siteBackground.js. Sits here, ahead of the GA stub
            below, because it is the only script on this page that first paint
            waits for; it reads one localStorage key and returns for everyone
            who has not bought a background, which is nearly everyone. The
            preload above stays exactly as it was: the default is still the
            baked, scanner-discovered LCP asset for every new visitor. */}
        {!IS_PORTAL_BUILD && (
          <script dangerouslySetInnerHTML={{ __html: PREPAINT_SITE_BG_SCRIPT }} />
        )}

        {/* Google Analytics */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              window.gtag = function(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-KFK0S0RXG5');
              window.addEventListener('load', function() {
                var s = document.createElement('script');
                s.src = 'https://www.googletagmanager.com/gtag/js?id=G-KFK0S0RXG5';
                s.async = true;
                document.head.appendChild(s);
              });
            `,
          }}
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --site-bg: url("${backgroundUrl}");
              --site-bg-lqip: url("${DEFAULT_BACKGROUND_LQIP}");
            }
            html, body {
              background-color: #000000 !important;
              margin: 0;
              padding: 0;
            }
            body::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              /* TWO LAYERS, and the order is the feature: the real photograph
                 sits on top, the inlined 152-byte placeholder underneath. The
                 top layer paints nothing until the image arrives, so a first
                 visit shows the scene's colours instantly instead of black,
                 and the swap is invisible because both are center/cover and
                 the photograph is opaque. See lib/siteBackground.js. */
              background: var(--site-bg) center/cover no-repeat,
                          var(--site-bg-lqip) center/cover no-repeat;
              opacity: 0.5;
              z-index: 0;
              pointer-events: none;
            }
          `
        }} />
      </Head>
      <body className="mainBody notranslate" translate="no" style={{ backgroundColor: '#000000' }}>
        {process.env.NEXT_PUBLIC_COOLMATH === "true" && (
          <>
            {/* Hidden by default so no-JS clients (crawlers, blocked scripts) never
                get a permanent full-screen logo — the inline script below reveals it. */}
            <div id="cmg-splash" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgb(36,36,36)',
              zIndex: 999999,
              display: 'none',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/coolmath-splash.png`}
                alt="Coolmath Splash"
                draggable="false"
                style={{
                  maxWidth: '80vw',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                  userSelect: 'none',
                }}
              />
            </div>
            <script dangerouslySetInnerHTML={{ __html: `
              document.getElementById('cmg-splash').style.display = 'flex';
              window.__cmgSplashStart = Date.now();
            `}} />
          </>
        )}
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

Document.getInitialProps = async (ctx) => {
  // ctx.defaultGetInitialProps is what the base Document class calls — going
  // through it (instead of importing the class) dodges the CJS/ESM default-
  // import interop that broke NextDocument.getInitialProps under pnpm.
  const initialProps = await ctx.defaultGetInitialProps(ctx);
  return { ...initialProps, pathname: ctx.pathname };
};
