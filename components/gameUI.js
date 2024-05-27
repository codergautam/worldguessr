import { useEffect, useState } from "react"
import findLatLongRandom from "./findLatLong";

export default function GameUI({ loading, setLoading }) {
  const [latLong, setLatLong] = useState({ lat: 0, long: 0 })
  const [streetViewShown, setStreetViewShown] = useState(false)

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
    <>
      <iframe className={`streetview ${!streetViewShown ? 'hidden' : ''} ${false ? 'multiplayer' : ''}`} src={`https://www.google.com/maps/embed/v1/streetview?location=${latLong.lat},${latLong.long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=90`} id="streetview" referrerPolicy='no-referrer-when-downgrade' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' onLoad={() => {

      }}></iframe>
    </>
  )
}