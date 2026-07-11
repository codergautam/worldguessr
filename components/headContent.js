import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { asset, stripBase } from '@/lib/basePath';
import { getLangFromPath } from '@/components/useTranslations';

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

export default function HeadContent({ text, inCoolMathGames, inCrazyGames = false, inGameDistribution = false, titleOverride, descOverride, canonicalOverride }) {
  useEffect(() => {
    if (!window.location.search.includes("crazygames") && !process.env.NEXT_PUBLIC_POKI &&
  !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION) {


  // start adinplay script
    // const scriptAp = document.createElement('script');
    // scriptAp.src = "https://api.adinplay.com/libs/aiptag/pub/SWT/worldguessr.com/tag.min.js";
    // scriptAp.async = true;
    // document.body.appendChild(scriptAp);
    // end adinplay script

// start nitroPay script
window.nitroAds=window.nitroAds||{createAd:function(){return new Promise(e=>{window.nitroAds.queue.push(["createAd",arguments,e])})},addUserToken:function(){window.nitroAds.queue.push(["addUserToken",arguments])},queue:[]};

      const loadNitroAds = () => {
        if (document.querySelector('script[src*="nitropay.com"]')) return;
        const script = document.createElement('script');
        script.src = "https://s.nitropay.com/ads-2071.js";
        script.async = true;
        document.head.appendChild(script);
      };

      // Load the ad stack on the first real user interaction instead of at
      // page load. New players see no ads during onboarding anyway, and
      // returning players interact within moments (mousemove counts), so this
      // costs ~no impressions — but it keeps NitroPay + everything it drags
      // in (GPT, prebid, Confiant, Amazon, id syncs) entirely off the initial
      // load. Idle-until-interaction visitors never fetch ads at all.
      // requestIdleCallback keeps the fetch off the triggering interaction's
      // own critical path (INP).
      const INTERACTION_EVENTS = ['pointerdown', 'mousemove', 'touchstart', 'keydown', 'wheel'];
      const listenerOpts = { passive: true, capture: true };
      const onFirstInteraction = () => {
        removeInteractionListeners();
        if ('requestIdleCallback' in window) {
          requestIdleCallback(loadNitroAds, { timeout: 1500 });
        } else {
          setTimeout(loadNitroAds, 200);
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

// end nitroPay script
      return () => {
        removeInteractionListeners();
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

      // Only load NitroPay if cmgopt flag is true
      let nitroScript = null;
      let unmounted = false;
      fetch('https://www.worldguessr.com/cmgopt.txt')
        .then(res => res.text())
        .then(text => {
          if (unmounted) return;
          if (text.trim() === 'true') {
            window.nitroAds=window.nitroAds||{createAd:function(){return new Promise(e=>{window.nitroAds.queue.push(["createAd",arguments,e])})},addUserToken:function(){window.nitroAds.queue.push(["addUserToken",arguments])},queue:[]};
            nitroScript = document.createElement('script');
            nitroScript.src = "https://s.nitropay.com/ads-2071.js";
            nitroScript.async = true;
            document.head.appendChild(nitroScript);
          }
        })
        .catch(() => {});

      return () => {
        unmounted = true;
        document.body.removeChild(script);
        document.body.removeChild(script2);
        if (nitroScript && nitroScript.parentNode) {
          document.head.removeChild(nitroScript);
        }
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
  // Language homepages (/, /es, /fr, /de, /ru) are near-duplicate exports.
  // Without hreflang + self-canonicals Google clusters them and can pick a
  // non-English one to show every searcher (it served /es with a Spanish
  // title to English users). Main worldguessr.com only — platform builds
  // (Poki/CoolMath/CrazyGames/GD/SchoolGuessr) live on other origins.
  const isMainSite = !isSchoolGuessr && !inCoolMathGames && !inCrazyGames && !inGameDistribution &&
    process.env.NEXT_PUBLIC_POKI !== "true" && process.env.NEXT_PUBLIC_COOLMATH !== "true";
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
</Head>
  )
}
