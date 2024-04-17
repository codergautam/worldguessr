import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Inter } from 'next/font/google';
import styles from '@/styles/Home.module.css';
import Script from 'next/script';
import dynamic from 'next/dynamic';
import findLatLongRandom from '@/components/findLatLong';
import useWindowDimensions from '@/components/useWindowDimensions';
import GameControls from '@/components/Tab';
import { FaDiscord, FaGithub, FaInfo } from 'react-icons/fa';
import Modal from 'react-responsive-modal';
import 'react-responsive-modal/styles.css';
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

    // info modal showing or not
    const [infoModal, setInfoModal] = useState(false);

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
    setMapFullscreen(false);
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
      <title>WorldGuessr - Play Geoguessr Free</title>
    <meta name="description" content="Explore WorldGuessr - the #1 free and open source alternative to GeoGuessr. Engage in the fun of discovering new places with our free Geoguessr game." />
    <meta name="keywords" content="GeoGuessr, GeoGuessr free, free geography game, map game, explore world game"/>
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
    <meta property="og:image" content="/icon.png" />
    <meta property="og:url" content="https://worldguessr.com" />
    <meta property="og:type" content="website" />
</Head>
      <main className={`${styles.main} ${inter.className}`} id="main">
        <div className={`top ${mapShown?'hideOnMobile':''}`}>
        <div className="topItem navbar">
  <div>
    <a id="logo" alt="worldguessr logo" onClick={fullReset} style={{cursor: "pointer"}}>
      <img id="icon" src="/logo.png" alt="WorldGuessr logo" />
    </a>
    {/* <button className="navButton">Game Mode</button>
    <button className="navButton">Game Map</button> */}
  </div>
  <div>
    <button className="navButton" onClick={() => {
      setInfoModal(true);
    }}><FaInfo size={25}/></button>
    <a href='https://discord.gg/ubdJHjKtrC' className="navButton" target='_blank'><FaDiscord size={25} /></a>
    <a href='https://github.com/codergautam/worldguessr' className="navButton" target='_blank'><FaGithub size={25} /></a>
  </div>
</div>
        </div>

        <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>
  <div className="bannerContent">
    <h1 className='mainBannerTxt'>Your guess was {km} km away!</h1>
    <p className="motivation">
      {km < 10 ? 'Perfect!' : km < 500 ? 'Thats pretty close! 🎉' : km < 2000 ? 'At least its the same continent?' : 'You\'ll do better next time!'}
    </p>
  </div>
  <div className="buttonContainer">
  <button className="playAgain" onClick={fullReset}>
    Play Again
  </button>
  <button className="openInMaps" onClick={() => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latLong.lat},${latLong.long}`);
  }}>
    Open in Google Maps
  </button>
</div>
</div>


        {/* how to play */}


        <Modal id="infoModal" styles={{
    modal: {
        zIndex: 100,
        background: 'black',
        color: 'white',
        padding: '20px',
        borderRadius: '10px',
        fontFamily: "'Arial', sans-serif",
        maxWidth: '500px',
        textAlign: 'center'
    }
}} open={infoModal} center>

    <h1 style={{
        marginBottom: '20px',
        fontSize: '24px',
        fontWeight: 'bold'
    }}>How to Play</h1>

    <p style={{
        fontSize: '16px',
        marginBottom: '10px'
    }}>
        🧐 Explore your surroundings, and try to guess where in the World you are
    </p>
    <p style={{
        fontSize: '16px',
        marginBottom: '10px'
    }}>
        🗺️ Use the map to place your guess, and check your accuracy
    </p>
    <p style={{
        fontSize: '16px',
        marginBottom: '20px'
    }}>
        🎓 Learn geography through play, and have fun!
    </p>

    <button className="toggleMap" style={{
        fontSize: '16px',
        fontWeight: 'bold',
        color: 'white',
        background: 'green',
        border: 'none',
        borderRadius: '5px',
        padding: '10px 20px',
        cursor: 'pointer'
    }} onClick={() => {
        setInfoModal(false);
    }}>
        Close
    </button>
</Modal>


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
