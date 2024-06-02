import { useEffect, useState } from "react"
import dynamic from "next/dynamic";
import { FaMap } from "react-icons/fa";
import useWindowDimensions from "./useWindowDimensions";
import GameOptions from "./gameOptionsModal";
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

export default function GameUI({ loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, latLong, setLatLong, streetViewShown, setStreetViewShown, loadLocation, gameOptions, setGameOptions }) {
  const { width, height } = useWindowDimensions();

  const [miniMapShown, setMiniMapShown] = useState(false)
  const [miniMapExpanded, setMiniMapExpanded] = useState(false)
  const [hintShown, setHintShown] = useState(false)
  const [pinPoint, setPinPoint] = useState(null)
  // dist between guess & target

  const [km, setKm] = useState(null);

  useEffect(() => {
    loadLocation()
  }, []);

  useEffect(() => {
    if (!latLong) {
      setLoading(true)
      setStreetViewShown(false)
    }
  }, [latLong])
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
  }

  return (
    <div className="gameUI">
      <iframe className={`streetview ${(!streetViewShown || loading) ? 'hidden' : ''} ${false ? 'multiplayer' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {

      }}></iframe>
      <div id="miniMapArea" onMouseEnter={() => {
        setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded ? 'mapFullscreen' : ''} ${miniMapShown ? 'shown' : ''}`}>


        {latLong && !loading && <MapWidget session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} />}

        <div className="miniMap__btns">
          <button className={`miniMap__btn ${!pinPoint ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint} onClick={guess}>Guess</button>
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} onClick={showHint}>Hint</button>
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''}`}>
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
      <span className={`timer ${loading ? '' : 'shown'}`}>0:00</span>

      <GameOptions shown={gameOptionsModalShown} onClose={() => {
        setGameOptionsModalShown(false)
      }} gameOptions={gameOptions} setGameOptions={setGameOptions} />

    </div>
  )
}