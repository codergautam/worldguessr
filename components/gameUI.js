import { useEffect, useState } from "react"
import dynamic from "next/dynamic";
import { FaMap } from "react-icons/fa";
import useWindowDimensions from "./useWindowDimensions";
import GameOptions from "./gameOptionsModal";
import EndBanner from "./endBanner";
import calcPoints from "./calcPoints";
import findCountry from "./findCountry";
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

export default function GameUI({ countryStreak, setCountryStreak, loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, latLong, setLatLong, streetViewShown, setStreetViewShown, loadLocation, gameOptions, setGameOptions, showAnswer, setShowAnswer, pinPoint, setPinPoint, hintShown, setHintShown, xpEarned, setXpEarned }) {
  const { width, height } = useWindowDimensions();

  const [miniMapShown, setMiniMapShown] = useState(false)
  const [miniMapExpanded, setMiniMapExpanded] = useState(false)
  const [roundStartTime, setRoundStartTime] = useState(null);
  const [lostCountryStreak, setLostCountryStreak] = useState(0);

  // dist between guess & target
  const [km, setKm] = useState(null);

  useEffect(() => {
    loadLocation()
  }, []);

  useEffect(() => {
    if (!latLong) {
      setLoading(true)
      setStreetViewShown(false)
    } else {
      setRoundStartTime(Date.now());
      setXpEarned(0);
    }
  }, [latLong])

  useEffect(() => {
    console.log('saving country streak to', countryStreak)
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
    if (!loading && latLong && width > 600) {
      console.log('setting mini map')
      setMiniMapShown(true)
    } else {
      setMiniMapShown(false)
    }
  }, [loading, latLong, width])

  function showHint() {
    setHintShown(true)
  }

  function guess() {
    setShowAnswer(true)

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
        console.log(data);
      }).catch(e => {
        console.error(e);
      });
    }

    if(gameOptions.location === 'all') {
    findCountry({ lat: pinPoint.lat, lon: pinPoint.lng }).then((country) => {

      console.log('country', country, latLong.country)
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
    if(!latLong || !pinPoint) return;
    setXpEarned(Math.round(calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: hintShown, maxDist: gameOptions.maxDist }) / 50))
  }, [km, latLong, pinPoint])

  return (
    <div className="gameUI">
      <iframe className={`streetview ${(!streetViewShown || loading || showAnswer) ? 'hidden' : ''} ${false ? 'multiplayer' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {

      }}></iframe>
      <div id="miniMapArea" onMouseEnter={() => {
        setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded ? 'mapFullscreen' : ''} ${miniMapShown ? 'shown' : ''} ${showAnswer ? 'answerShown' : ''}`}>


        {latLong && !loading && <MapWidget answerShown={showAnswer} session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} />}

        <div className={`miniMap__btns ${showAnswer ? 'answerShownBtns' : ''}`}>
          <button className={`miniMap__btn ${!pinPoint ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint} onClick={guess}>Guess</button>
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>Hint</button>
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''} ${showAnswer ? 'answerShownBtns' : ''}`}>
        {miniMapShown && (
          <>
            {/* guess and hint  */}

            <button className={`miniMap__btn ${!pinPoint ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint} onClick={guess}>Guess</button>
            <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>Hint</button>
          </>
        )}


        <button className={`gameBtn ${miniMapShown ? 'mobileMiniMapExpandedToggle' : ''}`} onClick={() => {
          setMiniMapShown(!miniMapShown)
        }}><FaMap size={miniMapShown ? 30 : 50} /></button>
      </div>
      {/* <span className={`timer ${(loading||showAnswer) ? '' : 'shown'}`}>0:00</span> */}

      <GameOptions shown={gameOptionsModalShown} onClose={() => {
        setGameOptionsModalShown(false)
      }} gameOptions={gameOptions} setGameOptions={setGameOptions} />

{/* <EndBanner xpEarned={xpEarned} usedHint={showHint} session={session} lostCountryStreak={lostCountryStreak} guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} fullReset={fullReset} km={km} playingMultiplayer={playingMultiplayer} /> */}
<EndBanner countryStreak={countryStreak} lostCountryStreak={lostCountryStreak} xpEarned={xpEarned} usedHint={hintShown} session={session}  guessed={showAnswer} latLong={latLong} pinPoint={pinPoint} fullReset={loadLocation} km={km} playingMultiplayer={false} />

    </div>
  )
}