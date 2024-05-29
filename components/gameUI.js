import { useEffect, useState } from "react"
import findLatLongRandom from "./findLatLong";
import dynamic from "next/dynamic";
import GameBtn from "./ui/gameBtn";
import { FaMap } from "react-icons/fa";
import useWindowDimensions from "./useWindowDimensions";
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

export default function GameUI({ loading, setLoading, session }) {
  const { width, height } = useWindowDimensions();

  const [latLong, setLatLong] = useState({ lat: 0, long: 0 })
  const [streetViewShown, setStreetViewShown] = useState(false)
  const [miniMapShown, setMiniMapShown] = useState(false)
  const [miniMapExpanded, setMiniMapExpanded] = useState(false)
  const [hintShown, setHintShown] = useState(false)
  const [pinPoint, setPinPoint] = useState(null)
  // dist between guess & target
  const [km, setKm] = useState(null);

  useEffect(() => {
    setLoading(true)
    findLatLongRandom().then((latLong) => {
      setLatLong(latLong)
      setTimeout(() => {
        setStreetViewShown(true)
        setTimeout(() => {
          setLoading(false)
        }, 100);
      }, 500);
    });
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
  return (
    <div className="gameUI">
      <iframe className={`streetview ${!streetViewShown ? 'hidden' : ''} ${false ? 'multiplayer' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {

      }}></iframe>
      <div id="miniMapArea" onMouseEnter={() => {
        setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded ? 'mapFullscreen' : ''} ${miniMapShown ? 'shown' : ''}`}>


        {latLong && <MapWidget session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} />}

        <div className="miniMap__btns">

          <button className={`miniMap__btn ${!pinPoint ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint} onClick={() => {
            alert('test')
          }}>Guess</button>
          <button className={`miniMap__btn hintBtn`} onClick={() => {
            alert('test')
          }}>Hint</button>
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''}`}>
        {miniMapShown && (
          <>
            {/* guess and hint  */}

            <button className="miniMap__btn guessBtn" disabled={!pinPoint} onClick={() => {
              alert('test')
            }}>Guess</button>
            <button className="miniMap__btn hintBtn" onClick={() => {
              alert('test')
            }}>Hint</button>
          </>
        )}

        <button className="gameBtn" onClick={() => {
          setMiniMapShown(!miniMapShown)
        }}><FaMap size={50} /></button>
      </div>
    </div>
  )
}