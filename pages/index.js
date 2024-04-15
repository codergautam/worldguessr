import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Inter } from 'next/font/google';
import styles from '@/styles/Home.module.css';
import Script from 'next/script';
import dynamic from 'next/dynamic';
const inter = Inter({ subsets: ['latin'] });
const Map = dynamic(() => import("../components/Map"), { ssr: false });
export default function Home() {
  const mapDivRef = useRef(null);
  const [mapShown, setMapShown] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [pinPoint, setPinPoint] = React.useState(null);

  function initialize() {
    var fenway = { lat: 48.8484, lng: 2.2945 };
    new google.maps.StreetViewPanorama(mapDivRef.current, {
      position: fenway,
      disableDefaultUI: true,
      showRoadLabels: false,
    });
  }

  useEffect(() => {
    // emit resize event to force map to resize
    if (mapFullscreen) {
      window.dispatchEvent(new Event('resize'));
    }
  }, [mapFullscreen]);

  return (
    <>
      <Head>
        <title>WorldGuessr</title>
        <meta name="description" content="The #1 free and open source GeoGuessr game" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/icon.png" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.6.0/dist/leaflet.css"
   integrity="sha512-xwE/Az9zrjBIphAcBb3F6JVqxf46+CDLwfLMHloNu6KEQCAWi6HcDUbeOfBIptF7tcCzusKFjFw2yuvEpDL9wQ=="
   crossorigin=""/>
      </Head>
      <Script
      referrerPolicy="no-referrer-when-downgrade"
        src="https://maps.googleapis.com/maps/api/js?key=AIzaSyDpIxJVFjMHOYsOv14lVN9Imlsh6pYI7z0&callback=initialize"
        onLoad={() => {
          console.log('Google Maps API loaded');
          initialize();
        }}
      />
      <main className={`${styles.main} ${inter.className}`} id="main">
        <div className="top">
          <div className="topItem topLeft">
            <a id="logo" alt="worldguessr logo">
              <img id="icon" src="/logo.png" alt="WorldGuessr logo" />
            </a>
          </div>
          <div id="topCenter">

          </div>
          {/* <div className="topItem topRight">
           ffgh
          </div> */}
        </div>

        <div className="MainDiv">
          <div id="innerMainDiv" ref={mapDivRef}>

            <div id="miniMap" className={`${!mapShown ? 'mapHidden' : mapFullscreen ? 'mapFullscreen' : ''}`}>
            <button className="toggleMap" onClick={() => setMapShown(!mapShown)}>
            {mapShown ? 'Hide Map' : 'Show Map'}
            </button>
            &nbsp;
            &nbsp;
            { mapShown && (
            <button className="toggleMap" onClick={() => setMapFullscreen(!mapFullscreen)}>
            {!mapFullscreen ? 'Fullscreen' : 'Exit Fullscreen'}
            </button>
            )}
            {mapShown && <Map fullscreen={mapFullscreen} pinPoint={pinPoint} setPinPoint={setPinPoint} />}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
