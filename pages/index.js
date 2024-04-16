import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Inter } from 'next/font/google';
import styles from '@/styles/Home.module.css';
import Script from 'next/script';
import dynamic from 'next/dynamic';
import findLatLongRandom from '@/components/findLatLong';
import useWindowDimensions from '@/components/useWindowDimensions';
const inter = Inter({ subsets: ['latin'] });
const Map = dynamic(() => import("../components/Map"), { ssr: false });
export default function Home() {
  const mapDivRef = useRef(null);
  const [mapShown, setMapShown] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [pinPoint, setPinPoint] = React.useState(null);
  const [latLong, setLatLong] = useState(null);
  const [guessed, setGuessed] = useState(false);
  const [km, setKm] = useState(null);
  const [loading, setLoading] = useState(true);
  const {width, height} = useWindowDimensions();

  function resetMap() {
    setLatLong(null);
    findLatLongRandom().then((data) => {
      setLatLong(data);
    });
  }

  function fullReset() {
    setLoading(true);
    setGuessed(false);
    setPinPoint(null);
    setMapFullscreen(false);
    setLatLong(null);
    setKm(null);
    if(width < 600) {
      setMapShown(false)
    }
    resetMap();
  }

  useEffect(() => {
    // emit resize event to force map to resize
    if (mapFullscreen || mapShown) {
      window.dispatchEvent(new Event('resize'));
      const correctionTimes = 20;
      const totalTime = 260;
      const time = totalTime / correctionTimes;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        window.dispatchEvent(new Event('resize'));
        console.log('Resizing map');
        if (i >= correctionTimes) {
          clearInterval(interval);
        }
      }, time);

    }
  }, [mapFullscreen, mapShown]);



  useEffect(() => {
    resetMap();
    if(width < 600) {
      setMapShown(false);
    }
  }, []);

  return (
    <>
      <Head>
        <title>WorldGuessr</title>
        <meta name="description" content="The #1 free and open source GeoGuessr game" />
        <meta name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"/>
        <link rel="icon" href="/icon.png" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.6.0/dist/leaflet.css"
   integrity="sha512-xwE/Az9zrjBIphAcBb3F6JVqxf46+CDLwfLMHloNu6KEQCAWi6HcDUbeOfBIptF7tcCzusKFjFw2yuvEpDL9wQ=="
   crossorigin=""/>

      </Head>
      {/* <Script
      referrerPolicy="no-referrer-when-downgrade"
        src="https://maps.googleapis.com/maps/api/js?key=AIzaSyDpIxJVFjMHOYsOv14lVN9Imlsh6pYI7z0&callback=initialize"
        onLoad={() => {
          console.log('Google Maps API loaded');
          initialize();
        }}
      /> */}
      <main className={`${styles.main} ${inter.className}`} id="main">
        <div className={`top ${mapShown?'hideOnMobile':''}`}>
          <div className="topItem topLeft">
            <a id="logo" alt="worldguessr logo" onClick={() => {
      fullReset()
            }} style={{cursor: "pointer"}}>
              <img id="icon" src="/logo.png" alt="WorldGuessr logo" />
            </a>
          </div>
          <div id="topCenter">

          </div>
          <div className="topItem topRight" style={{opacity: (pinPoint && !guessed) ? '1' : '0', transition: 'all 250ms ease', backgroundColor:'rgba(255, 255, 255, 0.1)', backdropFilter: 'none'}}>
          { pinPoint && !guessed && (
            <button className="guessBtn" onClick={() => {
              setMapFullscreen(true);
              if(width < 600  && !mapShown) {
                setMapShown(true);
              }
               setGuessed(true)
            }}>
            Guess
            </button>
            )}
          </div>
        </div>

        <div className="MainDiv">
          <div id="innerMainDiv" ref={mapDivRef}>


<img style={{position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: (!latLong || loading) ? '1' : '0', transition: 'all 250ms ease'}} src="/load.gif" />

{latLong && (
          <iframe className={`${!mapShown ? 'mapHidden': ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyD90QHwKReAN3TohEbw6TVyIsq0vUNBmpI&fov=90`} id="streetview" style={{width: '100vw', height: '100vh', zIndex: 10, opacity: loading?'0':''}} referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {
setTimeout(() => {
          setLoading(false)
}, 200);
          }}></iframe>
)}
           <div id="miniMap" className={`${!mapShown ? 'mapHidden' : mapFullscreen ? 'mapFullscreen' : ''}`} style={{opacity: loading ? '0' : '1', transition: 'all 250ms ease'}} onMouseEnter={() => {
            if(mapShown && !mapFullscreen) {
              setMapFullscreen(true);
            }
          }} onMouseLeave={() => {
            if(mapShown && mapFullscreen) {
              setMapFullscreen(false);
            }
          }}>
            <div id="mapControls">
              {km && guessed && mapShown && (
  <>
                <h1 style={{display: "inline-block"}}>
                  {km} km
                </h1>
    &nbsp;
    &nbsp;
    </>
              )}
            <button className="toggleMap" onClick={() => setMapShown(!mapShown)} style={{display: (!mapShown || mapFullscreen || (width && width < 600)) ? '' : 'none'}}>
            {mapShown ? 'Hide Map' : 'Show Map'}
            </button>
            {/* { mapShown && !guessed && (
            <button className="toggleMap hideOnMobile" onClick={() => setMapFullscreen(!mapFullscreen)}>
            {!mapFullscreen ? 'Fullscreen' : 'Exit Fullscreen'}
            </button>
            )} */}


            {guessed && mapShown && (
              <button className="toggleMap" onClick={() => {
                fullReset()
              }}>
              Play Again
              </button>
            )}
            </div>

            {mapShown && <Map fullscreen={mapFullscreen} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={guessed} location={latLong} setKm={setKm} />}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
