import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { asset, stripBase } from '@/lib/basePath';
import { getLangFromPath } from '@/components/useTranslations';
import { loadRampScript, preloadRampScript } from '@/components/utils/playwire';
import { APP_STORE_URL, DISCORD_URL, GITHUB_URL, PLAY_STORE_RATING, PLAY_STORE_URL, YOUTUBE_URL } from '@/lib/aboutContent';

// www is the canonical WorldGuessr host — every absolute social/search URL
// must stay on it so previews and canonicals agree.
const SITE_URL = "https://www.worldguessr.com";
const SCHOOL_URL = "https://schoolguessr.com";

// Social/search preview art, keyed by brand. og:image needs ABSOLUTE URLs
// (crawlers ignore relative ones), so never run these through asset().
// width/height are the files' true pixel sizes — keep in sync if art changes.
const BRANDS = {
  worldguessr: {
    siteName: "WorldGuessr",
    siteUrl: SITE_URL,
    twitterCard: "summary_large_image",
    ogImage: { url: `${SITE_URL}/worldguessr-1200x630.png`, width: 1200, height: 630, type: "image/png" },
    // Both ratios so Google can pick the square for square search thumbnails.
    searchImages: [
      `${SITE_URL}/worldguessr-1200x630.png`,
      `${SITE_URL}/worldguessr_square_1200.png`,
    ],
  },
  schoolguessr: {
    // Still the 500x500 logo — needs dedicated 1200x630 + 1200x1200 art.
    // Once made, swap these entries and flip twitterCard to
    // "summary_large_image" ("summary" renders a square logo better).
    siteName: "SchoolGuessr",
    siteUrl: SCHOOL_URL,
    twitterCard: "summary",
    ogImage: { url: `${SCHOOL_URL}/schoolguessrlogo.png`, width: 500, height: 500, type: "image/png" },
    searchImages: [`${SCHOOL_URL}/schoolguessrlogo.png`],
  },
};

export default function HeadContent({ text, inCoolMathGames, inCrazyGames = false, inGameDistribution = false, titleOverride, descOverride, canonicalOverride, aboutContent }) {
  useEffect(() => {
    // NEXT_PUBLIC_SCHOOLGUESSR: schoolguessr.com is not (yet) on the Playwire
    // property's domain allowlist — serving RAMP from an unapproved domain
    // risks flagging the whole account. Gate pending CK's allowlist approval;
    // remove the term once confirmed.
    // NEXT_PUBLIC_6X is DELIBERATELY absent from this list: the 6x build is
    // the one portal that ships the full Playwire stack, exactly like
    // worldguessr.com. Do not "complete" the exclusion list with it.
    if (!window.location.search.includes("crazygames") && !process.env.NEXT_PUBLIC_POKI &&
  !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION &&
  !process.env.NEXT_PUBLIC_SCHOOLGUESSR) {


  // start adinplay script
    // const scriptAp = document.createElement('script');
    // scriptAp.src = "https://api.adinplay.com/libs/aiptag/pub/SWT/worldguessr.com/tag.min.js";
    // scriptAp.async = true;
    // document.body.appendChild(scriptAp);
    // end adinplay script

// ── Playwire RAMP (NitroPay's replacement, Aug 2) ──────────────────────────
// RAMP boots in passive mode (see utils/playwire.js): no auto units, no video
// player — slots are declared explicitly by bannerAdPlaywire.js only.

      // Load the ad stack on the first real user interaction instead of at
      // page load (July perf overhaul). New players see no ads during
      // onboarding anyway, and returning players interact within moments
      // (mousemove counts), so this costs ~no impressions — but it keeps the
      // ad stack + everything it drags in (GPT, prebid, id syncs) entirely
      // off the initial load. Idle-until-interaction visitors never fetch ads
      // at all. requestIdleCallback keeps the fetch off the triggering
      // interaction's own critical path (INP). Playwire's stock eager <head>
      // snippet would regress all of this — never "simplify" back to it.
      const INTERACTION_EVENTS = ['pointerdown', 'mousemove', 'touchstart', 'keydown', 'wheel'];
      const listenerOpts = { passive: true, capture: true };
      const onFirstInteraction = () => {
        removeInteractionListeners();
        if ('requestIdleCallback' in window) {
          requestIdleCallback(loadRampScript, { timeout: 1500 });
        } else {
          setTimeout(loadRampScript, 200);
        }
      };
      const removeInteractionListeners = () => {
        for (const evt of INTERACTION_EVENTS) {
          window.removeEventListener(evt, onFirstInteraction, listenerOpts);
        }
      };
      for (const evt of INTERACTION_EVENTS) {
        window.addEventListener(evt, onFirstInteraction, listenerOpts);
      }

      // Warm the script bytes once the page has fully settled — a preload
      // hint is network-only, so this keeps first-ad latency down without
      // giving up the interaction gate (execution still waits for a user).
      const schedulePreload = () => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(preloadRampScript, { timeout: 4000 });
        } else {
          setTimeout(preloadRampScript, 3000);
        }
      };
      if (document.readyState === 'complete') schedulePreload();
      else window.addEventListener('load', schedulePreload, { once: true });

      // Touch devices have no mousemove, so their first "interaction" is
      // usually the tap that LEAVES the home screen — meaning phones never
      // see the home ad at all under the pure gate. Touch-primary devices
      // therefore also load on a settle timer: 2s after the load event
      // (past the initial-load burst, within typical menu dwell), via idle
      // callback, executing from the preloaded cache. Desktop keeps the
      // pure gate — mousemove fires it effectively instantly anyway.
      // loadRampScript is idempotent, so gate + timer can't double-load.
      // (2s, down from 3.5s, Aug 3: revenue concession — the only inventory
      // still sacrificed is sub-2s bounces, which never monetize anyway.)
      let touchFallbackTimer = null;
      const scheduleTouchFallback = () => {
        touchFallbackTimer = setTimeout(() => {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadRampScript, { timeout: 2000 });
          } else {
            loadRampScript();
          }
        }, 2000);
      };
      const isTouchPrimary = window.matchMedia?.('(pointer: coarse)')?.matches;
      if (isTouchPrimary) {
        if (document.readyState === 'complete') scheduleTouchFallback();
        else window.addEventListener('load', scheduleTouchFallback, { once: true });
      }

      return () => {
        removeInteractionListeners();
        window.removeEventListener('load', schedulePreload);
        window.removeEventListener('load', scheduleTouchFallback);
        if (touchFallbackTimer) clearTimeout(touchFallbackTimer);
      };
    } else if(window.location.search.includes("crazygames")) {
      console.log("CrazyGames detected");
    //<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
    const script = document.createElement('script');
    script.src = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
    script.async = false;
    console.log(window.CrazyGames)
    // on script load
    script.onload=() => {
      console.log("sdk loaded", window.CrazyGames)
      if(window.onCrazyload) {
        window.onCrazyload();
      }
    }
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    }
    } else if(process.env.NEXT_PUBLIC_COOLMATH === "true") {
      /*<script
src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.3/jquery.min.js"></script>
<script type="text/ja
vascript"
src="https://www.coolmathgames.com/sites/default/files/cmg
-
ads.js"></script>*/

      const script = document.createElement('script');
      script.src = "https://ajax.googleapis.com/ajax/libs/jquery/3.6.3/jquery.min.js";
      script.async = false;
      document.body.appendChild(script);

      const script2 = document.createElement('script');
      script2.src = "https://www.coolmathgames.com/sites/default/files/cmg-ads.js";
      script2.async = false;
      document.body.appendChild(script2);

      // NitroPay removed (Playwire swap, Aug 2). The CMG build's optional
      // Nitro layer (behind the remote cmgopt.txt flag) is gone — decide with
      // CMG whether their build gets Playwire units at all.

      return () => {
        document.body.removeChild(script);
        document.body.removeChild(script2);
      }

    }else if(process.env.NEXT_PUBLIC_POKI === "true") {
      //
      const script = document.createElement('script');
      script.src = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
      script.async = true;
      document.body.appendChild(script);



      return () => {
        document.body.removeChild(script);
      }

    } else if(process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
      window["GD_OPTIONS"] = {
        "gameId": "fef00656129743768437b7589b7c48b1",
        "onEvent": function(event) {
          switch (event.name) {
            case "SDK_READY":
              console.log("[GD] SDK Ready");
              break;
            case "SDK_GAME_START":
            case "SDK_ERROR":
            case "AD_ERROR":
            case "AD_SDK_CANCELED":
              // advertisement done or failed, resume game
              if(window.onGDResumeGame) window.onGDResumeGame();
              break;
            case "SDK_GAME_PAUSE":
              // pause game logic / mute audio
              if(window.onGDPauseGame) window.onGDPauseGame();
              break;
            case "SDK_REWARDED_WATCH_COMPLETE":
              if(window.onGDRewardedComplete) window.onGDRewardedComplete();
              break;
            case "SDK_REWARDED_WATCH_SKIPPED":
              console.log("[GD] Rewarded ad skipped");
              if(window.onGDRewardedSkipped) window.onGDRewardedSkipped();
              break;
          }
        },
      };
      (function(d, s, id) {
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) return;
        js = d.createElement(s);
        js.id = id;
        js.src = 'https://html5.api.gamedistribution.com/main.min.js';
        fjs.parentNode.insertBefore(js, fjs);
      }(document, 'script', 'gamedistribution-jssdk'));

      return () => {};
    }
  }, []);

  const router = useRouter();
  const isSchoolGuessr = process.env.NEXT_PUBLIC_SCHOOLGUESSR === "true";
  // Language homepages (/, /es, /fr, /de, /ru, /zh) are near-duplicate exports.
  // Without hreflang + self-canonicals Google clusters them and can pick a
  // non-English one to show every searcher (it served /es with a Spanish
  // title to English users). Main worldguessr.com only — platform builds
  // (Poki/CoolMath/CrazyGames/GD/SchoolGuessr/6x) live on other origins.
  const isMainSite = !isSchoolGuessr && !inCoolMathGames && !inCrazyGames && !inGameDistribution &&
    process.env.NEXT_PUBLIC_POKI !== "true" && process.env.NEXT_PUBLIC_COOLMATH !== "true" &&
    process.env.NEXT_PUBLIC_6X !== "true";
  const brand = isSchoolGuessr ? BRANDS.schoolguessr : BRANDS.worldguessr;
  const pathLang = getLangFromPath(stripBase(router.asPath));
  const homeCanonical = pathLang ? `${SITE_URL}/${pathLang}` : `${SITE_URL}/`;
  const schoolGuessrTitle = "SchoolGuessr - A kid-friendly GeoGuessr game!";
  const schoolGuessrDesc = "Play SchoolGuessr, a free, kid-friendly geography guessing game made for classrooms. Safe for schools, no chat, no user content.";
  const resolvedTitle = titleOverride || (isSchoolGuessr
    ? schoolGuessrTitle
    : inCoolMathGames
      ? "WorldGuessr - Play it now at CoolmathGames.com"
      : text("tabTitle"));
  const resolvedDesc = descOverride || (isSchoolGuessr ? schoolGuessrDesc : text("shortDescMeta"));
  const resolvedOgTitle = titleOverride || (isSchoolGuessr ? schoolGuessrTitle : text("fullTitle"));
  const resolvedOgDesc = descOverride || (isSchoolGuessr ? schoolGuessrDesc : text("fullDescMeta"));

  return (
          <Head>
      <title>{resolvedTitle}</title>
    <meta property="og:title" content={resolvedOgTitle}/>

    <meta name="description"
    content={resolvedDesc}
    />
    <meta property="og:description"
    content={resolvedOgDesc}
    />
    {canonicalOverride && <link rel="canonical" href={canonicalOverride} />}
    {isMainSite && !canonicalOverride && (
      <>
        <link rel="canonical" href={homeCanonical} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/`} />
        <link rel="alternate" hrefLang="en" href={`${SITE_URL}/`} />
        <link rel="alternate" hrefLang="es" href={`${SITE_URL}/es`} />
        <link rel="alternate" hrefLang="fr" href={`${SITE_URL}/fr`} />
        <link rel="alternate" hrefLang="de" href={`${SITE_URL}/de`} />
        <link rel="alternate" hrefLang="ru" href={`${SITE_URL}/ru`} />
        <link rel="alternate" hrefLang="zh" href={`${SITE_URL}/zh`} />
      </>
    )}

<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, viewport-fit=cover, user-scalable=no"/>
    <link rel="icon" type={isSchoolGuessr ? "image/png" : "image/x-icon"} href={asset(isSchoolGuessr ? "/schoolguessrlogo.png" : "/icon.ico")} />
<meta name="google-site-verification" content="7s9wNJJCXTQqp6yr1GiQxREhloXKjtlbOIPTHZhtY04" />
<meta name="yandex-verification" content="2eb7e8ef6fb55e24" />


{/* Preload CrazyGames SDK when on CrazyGames platform */}
{inCrazyGames && (
  <link rel="preload" href="https://sdk.crazygames.com/crazygames-sdk-v3.js" as="script" />
)}

{/* <script disable-devtool-auto src='https://cdn.jsdelivr.net/npm/disable-devtool'></script> */}


{/* data-adbreak-test="on" */}
{/*  */}


    <meta property="og:site_name" content={brand.siteName} />
    <meta property="og:image" content={brand.ogImage.url} />
    <meta property="og:image:width" content={String(brand.ogImage.width)} />
    <meta property="og:image:height" content={String(brand.ogImage.height)} />
    <meta property="og:image:type" content={brand.ogImage.type} />
    <meta property="og:url" content={isSchoolGuessr ? brand.siteUrl : canonicalOverride || (isMainSite ? homeCanonical : SITE_URL)} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content={brand.twitterCard} />
    <meta name="twitter:title" content={resolvedOgTitle} />
    <meta name="twitter:description" content={resolvedOgDesc} />
    <meta name="twitter:image" content={brand.ogImage.url} />
    {(isMainSite || isSchoolGuessr) && (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: brand.siteName,
            url: brand.siteUrl,
            image: brand.searchImages,
          }),
        }}
      />
    )}
    {/* Pages that carry the About panel (components/aboutPanel.js): the FAQ
        the panel shows, and on the homepage the game as a free software
        product. Both read from the same lib/aboutContent.js definition as
        the panel, so the markup and the visible text never drift: a rating
        or a question in here that is not on the page is a policy violation,
        not an optimization. */}
    {isMainSite && aboutContent && (
      <>
        {aboutContent.gameSchema && <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["VideoGame", "SoftwareApplication"],
              name: brand.siteName,
              url: homeCanonical,
              description: text("shortDescMeta"),
              image: brand.searchImages,
              inLanguage: pathLang || "en",
              applicationCategory: "GameApplication",
              operatingSystem: "Web, Android, iOS",
              genre: "Geography",
              playMode: ["SinglePlayer", "MultiPlayer"],
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: PLAY_STORE_RATING.value,
                ratingCount: PLAY_STORE_RATING.count,
                bestRating: "5",
                worstRating: "1",
              },
              publisher: { "@type": "Organization", name: brand.siteName, url: brand.siteUrl },
              sameAs: [GITHUB_URL, PLAY_STORE_URL, APP_STORE_URL, DISCORD_URL, YOUTUBE_URL],
            }),
          }}
        />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: aboutContent.faq.map(({ q, a }) => ({
                "@type": "Question",
                name: text(q),
                acceptedAnswer: { "@type": "Answer", text: text(a) },
              })),
            }),
          }}
        />
      </>
    )}
</Head>
  )
}
