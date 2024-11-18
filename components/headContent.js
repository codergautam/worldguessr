import Head from "next/head";
import Script from "next/script";
import { useEffect } from "react";

export default function HeadContent({text}) {
  useEffect(() => {
    if (!window.location.search.includes("crazygames") && !process.env.NEXT_PUBLIC_POKI) {
      const script = document.createElement('script');
      script.src = "https://api.adinplay.com/libs/aiptag/pub/SWT/worldguessr.com/tag.min.js";
      script.async = true;
      document.body.appendChild(script);
      //  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3340825671684972" crossorigin="anonymous">
      const script2 = document.createElement('script');
      script2.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3340825671684972";
      script2.async = true;
      script2.crossorigin = "anonymous";
      document.body.appendChild(script2);

      return () => {
        document.body.removeChild(script);
        document.body.removeChild(script2);
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
    } else if(process.env.NEXT_PUBLIC_POKI === "true") {
      //
      const script = document.createElement('script');
      script.src = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
      script.async = true;
      document.body.appendChild(script);



      return () => {
        document.body.removeChild(script);
      }

    }
  }, []);

  return (
          <Head>
      <title>
        {text("tabTitle")}
        </title>
    <meta property="og:title" content={text("fullTitle")}/>

    <meta name="description"
    content={text("shortDescMeta")}
    />
    <meta property="og:description"
    content={text("fullDescMeta")}
    />

    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="icon" type="image/x-icon" href="/icon.ico" />
<meta name="google-site-verification" content="7s9wNJJCXTQqp6yr1GiQxREhloXKjtlbOIPTHZhtY04" />
<meta name="yandex-verification" content="2eb7e8ef6fb55e24" />

{/* <link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/> */}
<link href="https://fonts.googleapis.com/css2?family=Jockey+One&display=swap" rel="stylesheet"/>
<script
      src="https://maps.googleapis.com/maps/api/js?v=weekly"
      defer
    ></script>


{/* <script disable-devtool-auto src='https://cdn.jsdelivr.net/npm/disable-devtool'></script> */}


{/* data-adbreak-test="on" */}
{/*  */}


    <meta property="og:image" content="/icon_144x144.png" />
    <meta property="og:url" content="https://worldguessr.com" />
    <meta property="og:type" content="website" />
</Head>
  )
}
