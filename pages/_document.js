import { Html, Head, Main, NextScript } from "next/document";
import {
  DEFAULT_BACKGROUND_LQIP,
  DEFAULT_BACKGROUND_PATH,
  IS_PORTAL_BUILD,
  PREPAINT_SITE_BG_SCRIPT,
  SITE_BG_FADE_MS,
} from "@/lib/siteBackground";

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
              /* The INCOMING photograph during a swap; \`none\` the rest of the
                 time. See the crossfade contract in lib/siteBackground.js. */
              --site-bg-next: none;
              --site-bg-fade-duration: ${SITE_BG_FADE_MS}ms;
            }
            html, body {
              background-color: #000000 !important;
              margin: 0;
              padding: 0;
            }
            /* THE RESTING LAYER, and at rest the only one.
               THREE LAYERS IN ONE STACK, and the order is the feature: a 50%
               black scrim on top, the real photograph under it, the inlined
               152-byte placeholder at the bottom. The photograph paints nothing
               until it arrives, so a first visit shows the scene's colours
               instantly instead of black, and its arrival is invisible because
               both are center/cover and the photograph is opaque.
               THE SCRIM REPLACED \`opacity: 0.5\`. Over a canvas forced to black
               the two are the same picture — but this element has to CROSSFADE
               with another one now, and two layers at 0.5 sum to 0.75 of a
               layer at the midpoint and visibly brighten. Two OPAQUE layers
               dissolve linearly. The identical scrim is written out again on
               html::before below rather than shared through a variable: this is
               the inline critical CSS in front of every first paint, and an
               undefined var() invalidates the whole declaration, which would
               black the site out rather than degrade. Keep the two in step. */
            body::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)),
                          var(--site-bg) center/cover no-repeat,
                          var(--site-bg-lqip) center/cover no-repeat;
              z-index: 0;
              pointer-events: none;
            }
            /* THE OUTGOING LAYER, and it LITERALLY does not exist unless a
               swap is running — there is no resting rule for html::before, so
               without the class there is no \`content\` and the browser generates
               no box at all. A visitor who never buys a background composites
               nothing extra, ever. On <html> rather than as body::after because
               body::after is the LAST child of body and would paint ABOVE the
               menu at any shared z-index; this is outside <body> entirely and
               so is structurally beneath every pixel of the app. It holds the
               picture already on screen still, while body::before fades the new
               one in over it. No LQIP here: the incoming file is preloaded
               before a swap ever starts, and the placeholder is the DEFAULT
               city, which is the wrong blur to show under any other one. */
            html.site-bg-swap::before {
              content: '';
              display: block;
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)),
                          var(--site-bg) center/cover no-repeat,
                          var(--site-bg-lqip) center/cover no-repeat;
              z-index: 0;
              pointer-events: none;
            }
            html.site-bg-swap body::before {
              background: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)),
                          var(--site-bg-next) center/cover no-repeat;
              /* An ANIMATION, not a transition: it has to run on the frame the
                 class lands, from a state this element does not otherwise have.
                 Duration pairs with SITE_BG_FADE_MS in lib/siteBackground.js. */
              animation: siteBgFadeIn var(--site-bg-fade-duration) ease-in-out both;
            }
            @keyframes siteBgFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            /* Reduce means reduce: the new picture simply appears. The commit
               on the other side of the timer is unchanged and still invisible,
               because it is the same URL either way. */
            @media (prefers-reduced-motion: reduce) {
              html.site-bg-swap body::before { animation: none; }
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
