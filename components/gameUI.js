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
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

export default function GameUI({ ws, multiplayerState, backBtnPressed, setMultiplayerState, countryStreak, setCountryStreak, loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, latLong, streetViewShown, setStreetViewShown, loadLocation, gameOptions, setGameOptions, showAnswer, setShowAnswer, pinPoint, setPinPoint, hintShown, setHintShown, xpEarned, setXpEarned }) {
  const { width, height } = useWindowDimensions();
  // how to determine if touch screen?
  let isTouchScreen = false;
  if(window.matchMedia("(pointer: coarse)").matches) {
    isTouchScreen = true;
  }

  const [miniMapShown, setMiniMapShown] = useState(false)
  const [miniMapExpanded, setMiniMapExpanded] = useState(false)
  const [roundStartTime, setRoundStartTime] = useState(null);
  const [lostCountryStreak, setLostCountryStreak] = useState(0);
  const [timeToNextMultiplayerEvt, setTimeToNextMultiplayerEvt] = useState(0);

  // dist between guess & target
  const [km, setKm] = useState(null);


  useEffect(() => {

    const interval = setInterval(() => {
    if(multiplayerState?.inGame && multiplayerState?.gameData?.nextEvtTime) {
      setTimeToNextMultiplayerEvt(Math.max(0,Math.floor((multiplayerState.gameData.nextEvtTime - Date.now()) / 100)/10))
    }
    }, 100)

    return () => {
      clearInterval(interval)
    }
  }, [multiplayerState])

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
  }, [gameOptions])
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

  return (
    <div className="gameUI">
      { latLong && multiplayerState?.gameData?.state !== 'end' && (
      <iframe className={`streetview ${(!streetViewShown || loading || showAnswer) ? 'hidden' : ''} ${false ? 'multiplayer' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {

      }}></iframe>
      )}


      {(!multiplayerState || (multiplayerState.inGame && ['guess', 'getready'].includes(multiplayerState.gameData?.state))) && ((multiplayerState?.inGame && multiplayerState?.gameData?.curRound === 1) ? multiplayerState?.gameData?.state === "guess" : true ) && (
        <>
      <div id="miniMapArea" onMouseEnter={() => {
        setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded ? 'mapFullscreen' : ''} ${miniMapShown ? 'shown' : ''} ${showAnswer ? 'answerShown' : ''}`}>


        {latLong && !loading && <MapWidget ws={ws} gameOptions={gameOptions} answerShown={showAnswer} session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} multiplayerState={multiplayerState} />}

        <div className={`miniMap__btns ${showAnswer ? 'answerShownBtns' : ''}`}>
          <button className={`miniMap__btn ${!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final) ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final)} onClick={guess}>
           {multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final ? multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length) > 0 ? `Waiting for ${multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length)} players...` : 'Waiting...' : 'Guess'}
            </button>

          { !multiplayerState?.inGame && (
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>Hint</button>
          )}
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''} ${showAnswer ? 'answerShownBtns' : ''}`}>
        {miniMapShown && (
          <>
            {/* guess and hint  */}

            <button className={`miniMap__btn ${!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final) ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final)} onClick={guess}>
           {multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final ? 'Waiting for others...' : 'Guess'}
            </button>

            {!multiplayerState?.inGame && (
            <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>Hint</button>
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

Round #{multiplayerState?.gameData?.curRound} / {multiplayerState?.gameData?.rounds} - {timeToNextMultiplayerEvt}s

        </span>

        {multiplayerState && multiplayerState.inGame && multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1 && (
          <BannerText text={"Game starting in " + timeToNextMultiplayerEvt + "s"} shown={true} />
        )}


        {multiplayerState && multiplayerState.inGame && ((multiplayerState?.gameData?.state === 'getready' && timeToNextMultiplayerEvt < 5 && multiplayerState?.gameData?.curRound !== 1 && multiplayerState?.gameData?.curRound <= multiplayerState?.gameData?.rounds)||(multiplayerState?.gameData?.state === "end")) && (
          <PlayerList multiplayerState={multiplayerState} playAgain={() => {


            backBtnPressed(true)

          }} backBtn={() => {

            backBtnPressed()
          }} />
        )}

      <GameOptions shown={gameOptionsModalShown} onClose={() => {
        setGameOptionsModalShown(false)
      }} gameOptions={gameOptions} setGameOptions={setGameOptions} />

{/* <EndBanner xpEarned={xpEarned} usedHint={showHint} session={session} lostCountryStreak={lostCountryStreak} guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} fullReset={fullReset} km={km} playingMultiplayer={playingMultiplayer} /> */}
<EndBanner countryStreak={countryStreak} lostCountryStreak={lostCountryStreak} xpEarned={xpEarned} usedHint={hintShown} session={session}  guessed={showAnswer} latLong={latLong} pinPoint={pinPoint} fullReset={loadLocation} km={km} multiplayerState={multiplayerState} />

    </div>
  )
}