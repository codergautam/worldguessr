import { useEffect, useState } from "react"
import findLatLongRandom from "./findLatLong";
import dynamic from "next/dynamic";
const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });

export default function GameUI({ loading, setLoading, session }) {
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
    if(!latLong) {
      setLoading(true)
      setStreetViewShown(false)
    }
  }, [latLong])
  return (
    <div className="gameUI">
      <iframe className={`streetview ${!streetViewShown ? 'hidden' : ''} ${false ? 'multiplayer' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {

      }}></iframe>
      <div id="miniMap" onMouseEnter={() => {
              setMiniMapExpanded(true)
          }} onMouseLeave={() => {
              setMiniMapExpanded(false)
          }} className={`miniMap ${miniMapShown ? 'shown' : ''} ${miniMapExpanded ? 'mapFullscreen' : ''} ${(loading||!latLong)?'':'shown'}`}>

            { latLong && <MapWidget session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} height={"100%"} />}
            </div>
    </div>
  )
}