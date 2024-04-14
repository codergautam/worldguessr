import Head from "next/head";
import Image from "next/image";
import { Inter } from "next/font/google";
import styles from "@/styles/Home.module.css";
const inter = Inter({ subsets: ["latin"] });
import Script from "next/script";
import { useRef } from "react";

export default function Home() {

  const mapDivRef = useRef(null);

  function initialize() {
    var fenway = {lat: 48.8584, lng: 2.2945};
    var panorama = new google.maps.StreetViewPanorama(
        mapDivRef.current, {
          position: fenway,
          disableDefaultUI: true,
          showRoadLabels: false
        });
  }

  return (
    <>
      <Head>
        <title>WorldGuessr</title>
        <meta name="description" content="The #1 free and open source GeoGuessr game" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/icon.png" />
      </Head>
      <Script src="https://maps.googleapis.com/maps/api/js?key=&callback=initialize" onLoad={() =>{
        initialize()
      }}/>
      <main className={`${styles.main} ${inter.className}`} id="main">


        <div id="pano" style={{width: "100%", height: "100vh"}} ref={mapDivRef}></div>

      </main>
    </>
  );
}
