import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Inter } from 'next/font/google';
import styles from '@/styles/Home.module.css';
import Script from 'next/script';
import dynamic from 'next/dynamic';
import findLatLongRandom from '@/components/findLatLong';
import useWindowDimensions from '@/components/useWindowDimensions';
import GameControls from '@/components/Tab';
const inter = Inter({ subsets: ['latin'] });
const Map = dynamic(() => import("../components/Map"), { ssr: false });
export default function Home() {
  const mapDivRef = useRef(null);
  // desktop: is minimap viewable (always true when in game)
  // mobile: is minimap tab active (false means streetview)
  const [mapShown, setMapShown] = useState(true);

  // desktop: is minimap in enlarged view
  // always true on mobile
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // user selection point
  const [pinPoint, setPinPoint] = React.useState(null);

  // coords of dest
  const [latLong, setLatLong] = useState(null);

  // whether guess confirmed or not
  const [guessed, setGuessed] = useState(false);

  // dist between guess & target
  const [km, setKm] = useState(null);

  // waiting for iframe
  const [loading, setLoading] = useState(true);

  // screen dim
  const {width, height} = useWindowDimensions();

  function resetMap() {
    setLatLong(null);
    findLatLongRandom().then((data) => {
      setLatLong(data);
    });
  }

  function guess() {
    setMapFullscreen(true);
    if(!mapShown) {
      setMapShown(true);
    }
     setGuessed(true);
  }

  function fullReset() {
    setLoading(true);
    setGuessed(false);
    setPinPoint(null);
    if(width > 600) setMapFullscreen(false);
    setLatLong(null);
    setKm(null);
    if(width < 600) {
      setMapShown(false)
    }
    resetMap();
  }

  useEffect(() => {
    // emit resize event to force map to resize
    if (mapFullscreen || mapShown || guessed) {
      window.dispatchEvent(new Event('resize'));
      if(guessed ) return;
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
  }, [mapFullscreen, mapShown, guessed]);

  useEffect(() => {
    if(width < 600) {
      setMapFullscreen(true);
    } else if(width > 600) {
      if(!mapShown) {
        setMapShown(true);
      }
    }
  }, [width])



  useEffect(() => {
    resetMap();
    if(width < 600) {
      setMapShown(false);
    }
  }, []);

  useEffect(() => {
    console.log('guessed', guessed);
  }, [guessed]);

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

          </div>
        </div>

        <div id='endBanner' style={{display: guessed ? '' : 'none'}}>
            <h1>
              {km} km
            </h1>
            <button className="toggleMap" onClick={() => {
              fullReset()
            }}>
              Play Again
            </button>
        </div>

        <div className="MainDiv">
          <div id="innerMainDiv" ref={mapDivRef}>


<img style={{position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: (!latLong || loading) ? '1' : '0', transition: 'all 250ms ease'}} src="/load.gif" />

{latLong && (
          <iframe className={`${!mapShown ? 'mapHidden': ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyD90QHwKReAN3TohEbw6TVyIsq0vUNBmpI&fov=90`} id="streetview" style={{width: '100vw', height: '100vh', zIndex: 10, opacity: (loading||guessed)?'0':''}} referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {
setTimeout(() => {
          setLoading(false)
}, 200);
          }}></iframe>
)}

           <div id="miniMap" onMouseEnter={() => {
            if(mapShown && !mapFullscreen) {
              setMapFullscreen(true);
            }
          }} onMouseLeave={() => {
            if(mapShown && mapFullscreen && width > 600) {
              setMapFullscreen(false);
            }
          }} className={`${guessed ? 'gameOver' : !mapShown ? 'mapHidden' : mapFullscreen ? 'mapFullscreen' : ''}`} style={{opacity: loading ? '0' : '1'}}>

<div id="mapControlsAbove" style={{display: (!width || width>600)&&(!guessed) ? '' : 'none'}}>
{ pinPoint && !guessed && (
            <button className="guessBtn" onClick={() => {guess()}} style={{display: width > 600 ? '' : 'none'}}>
            Guess
            </button>
            )}
            </div>

            {mapShown && <Map fullscreen={mapFullscreen} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={guessed} location={latLong} setKm={setKm} height={"100%"}/>}
            </div>

            <GameControls onCameraClick={() => {
              if(mapShown) {
                setMapShown(false);
              }
            }} onMapClick={() => {
              if(!mapShown) {
                setMapShown(true);
              }
            }
            }
            showGuessBtn={pinPoint && !guessed} onGuessClick={() => {
              guess()
            }} disableDiv={guessed || loading} />
          </div>
        </div>
      </main>
    </>
  );
}
