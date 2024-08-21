import Head from "next/head";
import Script from "next/script";
// import { useTranslation } from "react-i18next";

export default function HeadContent({text}) {

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
{/* <script src="https://greggman.github.io/webgl-helpers/webgl-force-preservedrawingbuffer.js"></script> */}
<script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js" defer></script>
<script src="https://greggman.github.io/webgl-helpers/webgl-force-preservedrawingbuffer.js" defer></script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3340825671684972"
      crossorigin="anonymous">
</script>
{/* data-adbreak-test="on" */}
{/*  */}


    <meta property="og:image" content="/icon_144x144.png" />
    <meta property="og:url" content="https://worldguessr.com" />
    <meta property="og:type" content="website" />

</Head>
  )
}
