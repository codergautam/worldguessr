import Head from "next/head";

export default function HeadContent() {
  return (
    <Head>
    <title>WorldGuessr - Play Geoguessr Free</title>
    <meta name="description" content="Explore WorldGuessr - the #1 free and open source alternative to GeoGuessr. Engage in the fun of discovering new places with our free Geoguessr game." />
    <meta name="google-site-verification" content="7s9wNJJCXTQqp6yr1GiQxREhloXKjtlbOIPTHZhtY04" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"/>
    <link rel="icon" href="/icon.png" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.6.0/dist/leaflet.css"
           integrity="sha512-xwE/Az9zrjBIphAcBb3F6JVqxf46+CDLwfLMHloNu6KEQCAWi6HcDUbeOfBIptF7tcCzusKFjFw2yuvEpDL9wQ=="
           crossorigin=""/>


<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&display=swap" rel="stylesheet"/>

    <meta property="og:title" content="WorldGuessr - Play Geoguessr Free" />
    <meta property="og:description" content="Explore and play the free GeoGuessr game on WorldGuessr. Discover new places and challenge your geographical knowledge." />
    <meta property="og:image" content="/icon_144x144.png" />
    <meta property="og:url" content="https://worldguessr.com" />
    <meta property="og:type" content="website" />
    </Head>
  )
}