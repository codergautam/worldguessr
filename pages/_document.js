import { Html, Head, Main, NextScript } from "next/document";

// The language homepages export localized HTML, but a hardcoded lang="en"
// told Google the Spanish/French/... pages were English — one more reason it
// mixed the language variants up in search results.
const PATH_LANGS = { "/es": "es", "/fr": "fr", "/de": "de", "/ru": "ru" };

export default function Document({ pathname }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  return (
    <Html lang={PATH_LANGS[pathname] || "en"} translate="no" className="notranslate" style={{ backgroundColor: '#000000' }}>
      <Head>
        <meta name="google" content="notranslate" />
        <link rel="preload" href={`${basePath}/street2.webp`} as="image" type="image/webp" fetchpriority="high" />

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
              background: url("${basePath}/street2.webp") center/cover no-repeat;
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
            <div id="cmg-splash" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgb(36,36,36)',
              zIndex: 999999,
              display: 'flex',
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
