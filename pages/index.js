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
import { signOut, useSession } from 'next-auth/react';
import SetUsernameModal from '@/components/setUsernameModal';
import AccountModal from '@/components/accountModal';
const inter = Inter({ subsets: ['latin'] });
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

const multiplayerMatchBuffer = 5000; // deadline is 5000ms before next round to show the end stats
export default function Home({ }) {
  const mapDivRef = useRef(null);
  const guessBtnRef = useRef(null);

  // get nextauth session
  const { data: session, status } = useSession();

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

    const [showHint, setShowHint] = useState(false);

    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [roundStartTime, setRoundStartTime] = useState(null);
    const [xpEarned, setXpEarned] = useState(0);

    const [multiplayerModal, setMultiplayerModal] = useState(false);
    const [multiplayerEnded, setMultiplayerEnded] = useState(false);
    const [multiplayerData, setMultiplayerData] = useState(null);
    const [playingMultiplayer, setPlayingMultiplayer] = useState(false);
    const [multiplayerTimers, setMultiplayerTimers] = useState(null);
    const [multiplayerRoundIndex, setMultiplayerRoundIndex] = useState(0);
    const [multiplayerinMatchBuffer, setMultiplayerinMatchBuffer] = useState(false);
    const [multiplayerSentGuess, setMultiplayerSentGuess] = useState(false);
    const [multiplayerLeaderboardMobile, setMultiplayerLeaderboardMobile] = useState(false);
    const [lostCountryStreak, setLostCountryStreak] = useState(0);

  // screen dim
  const {width, height} = useWindowDimensions();

  useEffect(() => {
    setRoundStartTime(Date.now());
    setXpEarned(0);
    setShowHint(false);
    console.log('round start time', Date.now());
  }, [latLong]);

  function onMultiplayerModalClose(data) {
    setMultiplayerModal(false);

    if(data) {
      setXpEarned(0);
    setMultiplayerData(data);
    setPinPoint(null);
    setPlayingMultiplayer(true);
    setMultiplayerEnded(false);
      setShowHint(false);
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
      fullReset();
    }
  }, [playingMultiplayer, multiplayerEnded]);


  function resetMap() {
    if(playingMultiplayer) return;
    setLatLong(null);
    findLatLongRandom().then((data) => {
      setLatLong(data);
    });
  }

  async function guess() {
    setGuessing(true);

     if(playingMultiplayer) {
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
            usedHint: showHint,
            roundNo: multiplayerTimers.currentRound,
            secret: session?.token?.secret,
            roundTime: Math.round((Date.now() - roundStartTime)/ 1000)
          })
        });
        setXpEarned(Math.round(calcPoints({ guessLat: pinPoint.lat, guessLon: pinPoint.lng, lat: latLong.lat, lon: latLong.long, usedHint: showHint }) / 100));

        const data = await response.json();
        setMultiplayerSentGuess(true);

        if (data.error) {
          console.error(data.error);
          return;
        }

      } catch (error) {
        console.error(error);
      }
      } else {

        if(session && session.token && session.token.secret) {
          fetch('/api/storeGame', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              secret: session.token.secret,
              lat: pinPoint.lat,
              long: pinPoint.lng,
              usedHint: showHint,
              actualLat: latLong.lat,
              actualLong: latLong.long,
              roundTime: Math.round((Date.now() - roundStartTime)/ 1000)
            })
          }).then(res => res.json()).then(data => {
            if(data.error) {
              console.error(data.error);
              return;
            }
            console.log(data);
          }).catch(e => {
            console.error(e);
          });
          setXpEarned(Math.round(calcPoints({ guessLat: pinPoint.lat, guessLon: pinPoint.lng, lat: latLong.lat, lon: latLong.long, usedHint: showHint }) / 100));
        }


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
       setLostCountryStreak(countryStreak);
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
    setLostCountryStreak(0);
    setXpEarned(0);
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
        <Navbar openAccountModal={()=>setAccountModalOpen(true)} session={session} mapShown={mapShown} setInfoModal={setInfoModal} fullReset={fullReset} setMultiplayerModal={setMultiplayerModal} playingMultiplayer={playingMultiplayer} />
        <BottomLeft setInfoModal={setInfoModal} />
        <EndBanner xpEarned={xpEarned} usedHint={showHint} session={session} lostCountryStreak={lostCountryStreak} guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} fullReset={fullReset} km={km} playingMultiplayer={playingMultiplayer} />

        {/* how to play */}
        <InfoModal shown={infoModal} onClose={() => {
          setInfoModal(false);
        }} />

        <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />
        <AccountModal shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} logOut={() => { signOut() }} />

        <div className="MainDiv">
          <div id="innerMainDiv" ref={mapDivRef}>
            {/* loading globe */}
            <Loader loading={loading} latLong={latLong} loadingText={playingMultiplayer && multiplayerTimers?.timeTillRound ? Math.round(multiplayerTimers.timeTillRound/1000) : 'Loading...'} />
{latLong && (
          <iframe className={`${!mapShown ? 'mapHidden': ''} ${playingMultiplayer ? 'multiplayer': ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" style={{ height: '100vh', zIndex: 10, opacity: (loading||guessed)?'0':''}} referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {
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
            {mapShown && latLong && <MapWidget session={session} showHint={showHint} fullscreen={mapFullscreen} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={guessed} guessing={guessing} location={latLong} setKm={setKm} height={"100%"} multiplayerSentGuess={multiplayerSentGuess} playingMultiplayer={playingMultiplayer} multiplayerGameData={multiplayerData ? multiplayerData?.gameData : null} round={multiplayerTimers?.currentRound} currentId={multiplayerData ? multiplayerData.myData.playerSecret : null} />}
            </div>

            <MultiplayerModal open={multiplayerModal} close={onMultiplayerModalClose} />

            { pinPoint && !guessed && (
            <button ref={guessBtnRef} className="guessBtn desktopGB" onClick={() => {guess()}} style={{display: width > 600 ? '' : 'none'}} disabled={loading || guessing}>
            { (playingMultiplayer && guessing) ? 'Waiting...' : 'Guess'}
            </button>
            )}
            { !guessed && latLong &&  !showHint && (
            <button className="guessBtn desktopGB hintBtn" onClick={() => {setShowHint(true)}} style={{display: width > 600 ? '' : 'none'}}>
            Hint
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
            }} showHint={showHint} setShowHint={setShowHint} guessing={guessing} disableDiv={guessed || loading} playingMultiplayer={playingMultiplayer} multiplayerTimers={multiplayerTimers} multiplayerRoundIndex={multiplayerRoundIndex} multiplayerinMatchBuffer={multiplayerinMatchBuffer}
            leaderboardClick={() => {
              setMultiplayerLeaderboardMobile(true);
              if(mapShown) {
                setMapShown(false);
              }
            }} guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} />

          </div>
        </div>
      </main>
    </>
  );
}
export async function getServerSideProps({ req, res }) {
  return {
    props: {  },
  };
}
