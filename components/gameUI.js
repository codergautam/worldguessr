import { useEffect, useState } from "react"
import dynamic from "next/dynamic";
import { FaMap } from "react-icons/fa";
import useWindowDimensions from "./useWindowDimensions";
import GameOptions from "./gameOptionsModal";
import EndBanner from "./endBanner";
import calcPoints from "./calcPoints";
import findCountry from "./findCountry";
import ChatBox from "./chatBox";
import BannerText from "./bannerText";
import PlayerList from "./playerList";
import { FaExpand, FaMinimize, FaThumbtack } from "react-icons/fa6";
import { useTranslation } from 'next-i18next'

const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

export default function GameUI({ timeOffset, ws, multiplayerState, backBtnPressed, setMultiplayerState, countryStreak, setCountryStreak, loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, latLong, streetViewShown, setStreetViewShown, loadLocation, gameOptions, setGameOptions, showAnswer, setShowAnswer, pinPoint, setPinPoint, hintShown, setHintShown, xpEarned, setXpEarned }) {
  const { t: text } = useTranslation("common");

  const { width, height } = useWindowDimensions();
  // how to determine if touch screen?
  let isTouchScreen = false;
  if(window.matchMedia("(pointer: coarse)").matches) {
    isTouchScreen = true;
  }

  const [miniMapShown, setMiniMapShown] = useState(false)
  const [miniMapExpanded, setMiniMapExpanded] = useState(false)
  const [miniMapFullscreen, setMiniMapFullscreen] = useState(false)
  const [roundStartTime, setRoundStartTime] = useState(null);
  const [lostCountryStreak, setLostCountryStreak] = useState(0);
  const [timeToNextMultiplayerEvt, setTimeToNextMultiplayerEvt] = useState(0);
  const [mapPinned, setMapPinned] = useState(false);
  // dist between guess & target
  const [km, setKm] = useState(null);


  useEffect(() => {

    const interval = setInterval(() => {
    if(multiplayerState?.inGame && multiplayerState?.gameData?.nextEvtTime) {
      setTimeToNextMultiplayerEvt(Math.max(0,Math.floor(((multiplayerState.gameData.nextEvtTime - Date.now()) - timeOffset) / 100)/10))
    }
    }, 100)

    return () => {
      clearInterval(interval)
    }
  }, [multiplayerState, timeOffset])

  useEffect(() => {
    if(multiplayerState?.inGame) return;
    if (!latLong) {
      setLoading(true)
      setStreetViewShown(false)
    } else {
      setRoundStartTime(Date.now());
      setXpEarned(0);
    }
  }, [latLong, multiplayerState])

  useEffect(() => {
    window.localStorage.setItem("countryStreak", countryStreak);
  }, [countryStreak])


  useEffect(() => {
    function keydown(e) {
      if(pinPoint && e.key === ' ' && !showAnswer) {
        guess();
      } else if(showAnswer && e.key === ' ') {
        loadLocation();
      }
    }
    // on space key press, guess
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
    }
  }, [pinPoint, showAnswer]);

  useEffect(() => {
    if (!loading && latLong && width > 600 && !isTouchScreen) {
      setMiniMapShown(true)
    } else {
      setMiniMapShown(false)
    }
  }, [loading, latLong, width])

  function showHint() {
    setHintShown(true)
  }
  useEffect(() => {
    loadLocation()
  }, [gameOptions?.location])
  function guess() {
    setShowAnswer(true)

    if(multiplayerState?.inGame) return;

    if(xpEarned > 0 && session?.token?.secret) {
      fetch('/api/storeGame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          secret: session.token.secret,
          lat: pinPoint.lat,
          long: pinPoint.lng,
          usedHint: hintShown,
          actualLat: latLong.lat,
          actualLong: latLong.long,
          maxDist: gameOptions.maxDist,
          roundTime: Math.round((Date.now() - roundStartTime)/ 1000)
        })
      }).then(res => res.json()).then(data => {
        if(data.error) {
          console.error(data.error);
          return;
        }
      }).catch(e => {
        console.error(e);
      });
    }

    if(gameOptions.location === 'all') {
    findCountry({ lat: pinPoint.lat, lon: pinPoint.lng }).then((country) => {

      setLostCountryStreak(0);
      if(country === latLong.country) {
        setCountryStreak(countryStreak + 1);
      } else {
        setCountryStreak(0);
        setLostCountryStreak(countryStreak);
      }
    });
    }
  }

  useEffect(() => {
    if(!latLong || !pinPoint || multiplayerState?.inGame) return;
    setXpEarned(Math.round(calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: hintShown, maxDist: gameOptions.maxDist }) / 50))
  }, [km, latLong, pinPoint])

  useEffect(() => {
    // const map =  new google.maps.Map(document.getElementById("map"), {
    //   center: fenway,
    //   zoom: 14,
    // });
    if(!latLong) return;
    console.log('showroadname', gameOptions)


    const panorama = new google.maps.StreetViewPanorama(
      document.getElementById("googlemaps"),
      {
        position: { lat: latLong.lat, lng: latLong.long },
        pov: {
          heading: 0,
          pitch: 0,
        },
        motionTracking: false,
        linksControl: gameOptions?.nm ? false:true,
        clickToGo: gameOptions?.nm ? false:true,

        panControl: gameOptions?.npz ? false:true,
        zoomControl: gameOptions?.npz ? false:true,
        showRoadLabels: gameOptions?.showRoadName===true?true:false
      },
    );


    console.log(panorama, "panorama")

    window.inverted = false;

    // pano onload
    function fixBranding() {
      console.log("fixing branding")
      document.querySelectorAll('*').forEach(el => {
        if(el.innerHTML === "For development purposes only") {
          console.log(el.innerHTML)
          el.remove()
          window.inverted = true;

        }
        if(el.src === "https://maps.gstatic.com/mapfiles/api-3/images/google_gray.svg" ) {
          try {
          (el.parentElement.parentElement).remove()
          }catch(e){

          }
        }
      });

      console.log(window.inverted)
      if(window.inverted) {

        document.querySelectorAll("[aria-label=\"Map\"]").forEach((d) => {
          // d.classList.add("inverted")

        })

      }
    }

    function fixPitch() {
      // point towards road

      panorama.setPov(panorama.getPhotographerPov());
    }

    let loaded = false;

    panorama.addListener("pano_changed", () => {
      if(loaded) return;
      loaded = true;
      fixBranding();

      fixPitch();
    });


    return () => {
    }


  }, [latLong, gameOptions?.nm, gameOptions?.npz, gameOptions?.showRoadName])

  return (
    <div className="gameUI">
      { latLong && multiplayerState?.gameData?.state !== 'end' && (
      // <iframe className={`streetview ${(!streetViewShown || loading || showAnswer) ? 'hidden' : ''} ${false ? 'multiplayer' : ''} ${gameOptions?.nmpz ? 'nmpz' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture' onLoad={() => {

      // }}></iframe>
      <div id="googlemaps" className={`streetview inverted ${(!streetViewShown || loading || showAnswer) ? 'hidden' : ''} ${false ? 'multiplayer' : ''} ${(gameOptions?.npz) ? 'nmpz' : ''}`}></div>

      )}
{/*


',

*/}



      {(!multiplayerState || (multiplayerState.inGame && ['guess', 'getready'].includes(multiplayerState.gameData?.state))) && ((multiplayerState?.inGame && multiplayerState?.gameData?.curRound === 1) ? multiplayerState?.gameData?.state === "guess" : true ) && (
        <>


      <div id="miniMapArea" onMouseEnter={() => {
        setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        if(mapPinned) return;
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded ? 'mapExpanded' : ''} ${miniMapShown ? 'shown' : ''} ${showAnswer ? 'answerShown' : ''} ${miniMapFullscreen&&miniMapExpanded ? 'fullscreen' : ''}`}>

{!showAnswer && (
<div className="mapCornerBtns desktop" style={{ visibility: miniMapExpanded ? 'visible' : 'hidden' }}>
          <button className="cornerBtn" onClick={() => {
            setMiniMapFullscreen(!miniMapFullscreen)
            if(!miniMapFullscreen) {
              setMiniMapExpanded(true)
            }
          }}>{miniMapFullscreen  ? (
            <FaMinimize />
          ) : (
            <FaExpand />
          )}</button>
          <button className="cornerBtn" onClick={() => {
            setMapPinned(!mapPinned)
          }}>
            <FaThumbtack style={{ transform: mapPinned ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>
        </div>
)}
        {latLong && !loading && <MapWidget ws={ws} gameOptions={gameOptions} answerShown={showAnswer} session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} multiplayerState={multiplayerState} />}


        <div className={`miniMap__btns ${showAnswer ? 'answerShownBtns' : ''}`}>
          <button className={`miniMap__btn ${!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final) ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final)} onClick={guess}>
           {multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final ? multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length) > 0 ? `${text("waitingForPlayers", {p:multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length)})}...` : `${text("waiting")}...` : text("guess")}
            </button>

          { !multiplayerState?.inGame && (
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>{text('hint')}</button>
          )}
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''} ${showAnswer ? 'answerShownBtns' : ''}`}>
        {miniMapShown && (
          <>
            {/* guess and hint  */}

            <button className={`miniMap__btn ${!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final) ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final)} onClick={guess}>
           {multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final ? multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length) > 0 ? `${text("waitingForPlayers", {p: multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length)})}...` :  `${text("waiting")}...` : text("guess")}
            </button>

          { !multiplayerState?.inGame && (
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>{text('hint')}</button>
          )}
          </>
        )}
        <button className={`gameBtn ${miniMapShown ? 'mobileMiniMapExpandedToggle' : ''}`} onClick={() => {
          setMiniMapShown(!miniMapShown)
        }}><FaMap size={miniMapShown ? 30 : 50} /></button>
      </div>
      </>
      )}

      <span className={`timer ${(loading||showAnswer||!multiplayerState||(multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1)||multiplayerState?.gameData?.state === 'end') ? '' : 'shown'}`}>

{/* Round #{multiplayerState?.gameData?.curRound} / {multiplayerState?.gameData?.rounds} - {timeToNextMultiplayerEvt}s */}
      {text("roundTimer", {r:multiplayerState?.gameData?.curRound, mr: multiplayerState?.gameData?.rounds, t: timeToNextMultiplayerEvt})}
        </span>

        {multiplayerState && multiplayerState.inGame && multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1 && (
          <BannerText text={
            text("gameStartingIn", {t:timeToNextMultiplayerEvt})
          } shown={true} />
        )}


        {multiplayerState && multiplayerState.inGame && ((multiplayerState?.gameData?.state === 'getready' && timeToNextMultiplayerEvt < 5 && multiplayerState?.gameData?.curRound !== 1 && multiplayerState?.gameData?.curRound <= multiplayerState?.gameData?.rounds)||(multiplayerState?.gameData?.state === "end")) && (
          <PlayerList multiplayerState={multiplayerState} playAgain={() => {


            backBtnPressed(true)

          }} backBtn={() => {

            backBtnPressed()
          }} />
        )}

      <GameOptions singleplayer={!multiplayerState?.inGame} shown={gameOptionsModalShown} onClose={() => {
        setGameOptionsModalShown(false)
      }} gameOptions={gameOptions} setGameOptions={setGameOptions} />

{/* <EndBanner xpEarned={xpEarned} usedHint={showHint} session={session} lostCountryStreak={lostCountryStreak} guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} fullReset={fullReset} km={km} playingMultiplayer={playingMultiplayer} /> */}
<EndBanner countryStreak={countryStreak} lostCountryStreak={lostCountryStreak} xpEarned={xpEarned} usedHint={hintShown} session={session}  guessed={showAnswer} latLong={latLong} pinPoint={pinPoint} fullReset={loadLocation} km={km} multiplayerState={multiplayerState} />

    </div>
  )
}