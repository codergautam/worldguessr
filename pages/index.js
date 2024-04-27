import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Inter } from 'next/font/google';
import styles from '@/styles/Home.module.css';
import dynamic from 'next/dynamic';
import findLatLongRandom from '@/components/findLatLong';
import useWindowDimensions from '@/components/useWindowDimensions';
import GameControls from '@/components/Tab';
import { FaDiscord, FaGithub, FaInfo } from 'react-icons/fa';
import Modal from 'react-responsive-modal';
import 'react-responsive-modal/styles.css';

import findCountry from '@/components/findCountry';
import MultiplayerModal from '@/components/multiPlayerModal';
import calcPoints from '@/components/calcPoints';
import InfoModal from '@/components/infoModal';
import EndBanner from '@/components/endBanner';
import Navbar from '@/components/navbar';
import HeadContent from '@/components/headContent';
import Loader from '@/components/loader';
import Leaderboard from '@/components/leaderboard';
import formatTime from '@/components/formatNum';
import BottomLeft from '@/components/bottomLeft';
const inter = Inter({ subsets: ['latin'] });
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

const multiplayerMatchBuffer = 5000; // deadline is 5000ms before next round to show the end stats
export default function Home() {
  const mapDivRef = useRef(null);
  const guessBtnRef = useRef(null);
  // this button exists to prevent cheating by focusing on the iframe and tabbing etc
  // const focusBtn = useRef(null);
  // desktop: is minimap viewable (always true when in game)
  // mobile: is minimap tab active (false means streetview)
  const [mapShown, setMapShown] = useState(true);

  // desktop: is minimap in enlarged view
  // always true on mobile
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // user selection point
  const [pinPoint, setPinPoint] = React.useState(null);

  // coords & country of dest
  const [latLong, setLatLong] = useState(null);

  // whether guess confirmed or not
  const [guessed, setGuessed] = useState(false);

  // dist between guess & target
  const [km, setKm] = useState(null);

  // waiting for iframe
  const [loading, setLoading] = useState(true);

    // info modal showing or not
    const [infoModal, setInfoModal] = useState(false);

    const [countryStreak, setCountryStreak] = useState(0);

    const [guessing, setGuessing] = useState(false);

    const [multiplayerModal, setMultiplayerModal] = useState(false);
    const [multiplayerEnded, setMultiplayerEnded] = useState(false);
    const [multiplayerData, setMultiplayerData] = useState(null);
    const [playingMultiplayer, setPlayingMultiplayer] = useState(false);
    const [multiplayerTimers, setMultiplayerTimers] = useState(null);
    const [multiplayerRoundIndex, setMultiplayerRoundIndex] = useState(0);
    const [multiplayerinMatchBuffer, setMultiplayerinMatchBuffer] = useState(false);
    const [multiplayerSentGuess, setMultiplayerSentGuess] = useState(false);
    const [multiplayerLeaderboardMobile, setMultiplayerLeaderboardMobile] = useState(false);

  // screen dim
  const {width, height} = useWindowDimensions();

  function onMultiplayerModalClose(data) {
    setMultiplayerModal(false);

    if(data) {
    setMultiplayerData(data);
    setPinPoint(null);
    setPlayingMultiplayer(true);
    setMultiplayerEnded(false);
    }
  }

  function findCurrentPoint(gameData) {
    if(!gameData?.points) return { currentPoint: null, currentPointIndex: null };
    let currentPoint = null;
        let currentPointIndex = null;
        for(let i = 0; i < gameData.points.length; i++) {
          if(gameData.points[i].t <= Date.now()) {
            currentPoint = [gameData.points[i]];
            currentPointIndex = i;
          }
        }
        return { currentPoint, currentPointIndex };
    }
  function updateMultiplayerData(gameData, latLo, inMatchBuffer = false) {

    setMultiplayerData({
      ...multiplayerData,
      gameData
    });


    const { currentPoint, currentPointIndex } = findCurrentPoint(gameData);

        if(!currentPoint) {
          // game not started
          setMultiplayerTimers({
            timeTillRound: gameData.points[0].t - Date.now()
          })
        } else {
          // game started
          const inBuffer =  (typeof currentPointIndex === "number" && gameData.points[currentPointIndex+1]) ? gameData.points[currentPointIndex + 1].t - (Date.now()) - multiplayerMatchBuffer : gameData.endTime - Date.now() - multiplayerMatchBuffer;

          setMultiplayerTimers({
            timeLeft: inBuffer < 0 ? multiplayerMatchBuffer - Math.abs(inBuffer) : inBuffer,
            currentPoint: currentPoint[0],
            currentRound: currentPointIndex+1
          });
          setMultiplayerRoundIndex(currentPointIndex);

          if(inBuffer < -1 * multiplayerMatchBuffer) {
            setLatLong(null);
            setMultiplayerinMatchBuffer(false);
            setGuessed(false);
            setPinPoint(null);
            setMultiplayerSentGuess(false);
            setGuessing(false);
            setLoading(true);
            setMultiplayerEnded(true);
            setMultiplayerLeaderboardMobile(true);
          } else if(inBuffer <= 0) {
            // round over
            setGuessing(false);
            setGuessed(true);
            setMultiplayerinMatchBuffer(true);
            // setLatLong(null);
          } else if(!latLo || inMatchBuffer) {
            console.log('not in match buffer');
            setLatLong({ lat: currentPoint[0].lat, long: currentPoint[0].long, country: currentPoint[0].country });
            setLoading(false);
            setMultiplayerinMatchBuffer(false);
            setGuessed(false);
            setPinPoint(null);
            setMultiplayerSentGuess(false);

          }
        }
  }

  useEffect(() => {
    let int;
    let lastReq = 0;
    if(playingMultiplayer) {
      if(multiplayerData) {
        int = setInterval(() => {
        if(Date.now() - lastReq > 500) {
          const code = multiplayerData.code;
          lastReq = Date.now();
          fetch('/api/gameState', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: code })
          }).then(res => res.json()).then(gameData => {
            if(gameData.error) {
              console.error(gameData.error);
              return;
            }

            updateMultiplayerData(gameData, latLong, multiplayerinMatchBuffer);
          }).catch(e => {
            console.error(e);
          });
        } else {
          updateMultiplayerData(multiplayerData.gameData, latLong, multiplayerinMatchBuffer);
        }
        }, 100);
      }
    }

    return () => {
      if(int) {
        clearInterval(int);
      }
    }
  }, [playingMultiplayer, multiplayerData, latLong, multiplayerinMatchBuffer]);

  useEffect(() => {
    if(playingMultiplayer) {
      setLatLong(null);
    } else if(!playingMultiplayer && !multiplayerEnded) {
      console.log('resetting multiplayer data');
      fullReset();
    }
  }, [playingMultiplayer, multiplayerEnded]);


  function resetMap() {
    if(playingMultiplayer) return;
    setLatLong(null);
    console.log('requesting random lat long')
    findLatLongRandom().then((data) => {
      setLatLong(data);
    });
  }

  async function guess() {
    setGuessing(true);

     if(playingMultiplayer) {
      console.log(multiplayerData)
      try {
        const response = await fetch('/api/guess', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lat: pinPoint.lat,
            long: pinPoint.lng,
            gameCode: multiplayerData.code,
            playerSecret: multiplayerData.myData.playerSecret,
            roundNo: multiplayerTimers.currentRound
          })
        });

        const data = await response.json();
        console.log(data);
        setMultiplayerSentGuess(true);

        if (data.error) {
          console.error(data.error);
          return;
        }

      } catch (error) {
        console.error(error);
      }
      } else {

        setMapFullscreen(true);
        if(!mapShown) {
          setMapShown(true);
        }
         setGuessed(true);

      }


     const pinPointCountry = await findCountry({ lat: pinPoint.lat, lon: pinPoint.lng });
     const destCountry = latLong.country;
     if(pinPointCountry === destCountry) {
       console.log('correct guess');
       setCountryStreak(countryStreak + 1);
       window.localStorage.setItem('countryStreak', countryStreak + 1);
     } else {
       console.log('incorrect guess');
       setCountryStreak(0);
       window.localStorage.setItem('countryStreak', 0);
     }
     if(!playingMultiplayer) {
      setGuessing(false);
     }
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
    if(width < 600) {
      setMapFullscreen(true);
    } else if(width > 600) {
      if(!mapShown) {
        setMapShown(true);
      }
    }
  }, [width])

  useEffect(() => {
    if(width < 600) {
      setMapShown(false);
    }
    if(window) {
      const cS = parseInt(window.localStorage.getItem('countryStreak'));
      if(cS) {
        console.log('setting country streak', cS);
        setCountryStreak(cS);
      }
    }
  }, []);

  useEffect(() => {
    function keydown(e) {
      if(pinPoint && e.key === ' ' && !guessed && !guessing) {
        guess();
      } else if(guessed && e.key === ' ' &&!playingMultiplayer) {
        fullReset();
      }
    }
    // on space key press, guess
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
    }
  }, [pinPoint, guessed, playingMultiplayer]);

  return (
    <>
      <HeadContent />
      <main className={`${styles.main} ${inter.className}`} id="main">
        <Navbar mapShown={mapShown} setInfoModal={setInfoModal} fullReset={fullReset} setMultiplayerModal={setMultiplayerModal} playingMultiplayer={playingMultiplayer} />
        <BottomLeft setInfoModal={setInfoModal} />
        <EndBanner guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} fullReset={fullReset} km={km} playingMultiplayer={playingMultiplayer} />

        {/* how to play */}
        <InfoModal shown={infoModal} onClose={() => {
          setInfoModal(false);
        }} />



        <div className="MainDiv">
          <div id="innerMainDiv" ref={mapDivRef}>
            {/* loading globe */}
            <Loader loading={loading} latLong={latLong} loadingText={playingMultiplayer && multiplayerTimers?.timeTillRound ? Math.round(multiplayerTimers.timeTillRound/1000) : 'Loading...'} />
{latLong && (
          <iframe className={`${!mapShown ? 'mapHidden': ''} ${playingMultiplayer ? 'multiplayer': ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=${process.env.NEXT_PUBLIC_GOOGLE}&fov=90`} id="streetview" style={{ height: '100vh', zIndex: 10, opacity: (loading||guessed)?'0':''}} referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {
setTimeout(() => {
          setLoading(false)
}, 200);
          }}></iframe>
)}
          { multiplayerData && (
            <Leaderboard gameData={multiplayerData ? multiplayerData?.gameData : null} playingMultiplayer={playingMultiplayer} mobileOpen={multiplayerLeaderboardMobile} currentRound={multiplayerTimers?.currentRound - (multiplayerinMatchBuffer ? 0 : 1)} realCurrentRoundIndex={multiplayerTimers?.currentRound} gameEnded={multiplayerEnded} finish={() => {
              setPlayingMultiplayer(false);
              setMultiplayerData(null);
              setMultiplayerTimers(null);
              setMultiplayerEnded(false);
              setMultiplayerRoundIndex(0);
              setMultiplayerinMatchBuffer(false);
              setMultiplayerSentGuess(false);
              setMultiplayerLeaderboardMobile(false);
            }} />

          )}
             <div id="timerDiv" style={{ display: (playingMultiplayer && multiplayerTimers?.timeLeft && !multiplayerEnded) ? '' : 'none' }}>
                { multiplayerTimers ? formatTime(Math.round(multiplayerTimers.timeLeft/1000)) : '' }
              </div>

           <div id="miniMap" onMouseEnter={() => {
            if(mapShown && !mapFullscreen) {
              setMapFullscreen(true);
            }
          }} onMouseLeave={() => {
            if(mapShown && mapFullscreen && width > 600) {
              setMapFullscreen(false);
            }
          }} className={`${guessed ? 'gameOver' : !mapShown ? 'mapHidden' : mapFullscreen ? 'mapFullscreen' : ''} ${playingMultiplayer ? 'multiplayer' : ''}`} style={{visibility: loading||!latLong ? 'hidden' : ''}}>



<div id="mapControlsAbove" style={{display: (!width || width>600)&&(!guessed)? '' : 'none'}}>

            </div>
            {mapShown && latLong && <MapWidget fullscreen={mapFullscreen} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={guessed} guessing={guessing} location={latLong} setKm={setKm} height={"100%"} multiplayerSentGuess={multiplayerSentGuess} playingMultiplayer={playingMultiplayer} multiplayerGameData={multiplayerData ? multiplayerData?.gameData : null} round={multiplayerTimers?.currentRound} currentId={multiplayerData ? multiplayerData.myData.playerSecret : null} />}
            </div>

            <MultiplayerModal open={multiplayerModal} close={onMultiplayerModalClose} />

            { pinPoint && !guessed && (
            <button ref={guessBtnRef} className="guessBtn desktopGB" onClick={() => {guess()}} style={{display: width > 600 ? '' : 'none'}} disabled={loading || guessing}>
            { (playingMultiplayer && guessing) ? 'Waiting...' : 'Guess'}
            </button>
            )}

            <GameControls onCameraClick={() => {
              setMultiplayerLeaderboardMobile(false);
              if(mapShown) {
                setMapShown(false);
              }
            }} onMapClick={() => {
              setMultiplayerLeaderboardMobile(false);
              if(!mapShown) {
                setMapShown(true);
              }
            }
            }
            showGuessBtn={pinPoint && !guessed} onGuessClick={() => {
              if(!guessing) {
              guess()
              }
            }} guessing={guessing} disableDiv={guessed || loading} playingMultiplayer={playingMultiplayer} multiplayerTimers={multiplayerTimers} multiplayerRoundIndex={multiplayerRoundIndex} multiplayerinMatchBuffer={multiplayerinMatchBuffer}
            leaderboardClick={() => {
              setMultiplayerLeaderboardMobile(true);
              if(mapShown) {
                setMapShown(false);
              }
            }} />

          </div>
        </div>
      </main>
    </>
  );
}
