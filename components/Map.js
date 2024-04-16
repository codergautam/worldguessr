import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { Marker, Polyline, useMapEvents } from "react-leaflet";

// Dynamic import of react-leaflet components
const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  {
    ssr: false, // Disable server-side rendering for this component
  }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  {
    ssr: false,
  }
);

function MapPlugin({ pinPoint, setPinPoint, guessed }) {

  const map = useMapEvents({
    click(e) {
      if(guessed) return;
      console.log(e.latlng);
      setPinPoint(e.latlng);
    },
    drag() {
      console.log("Map is being dragged");
      // log zoom level and center
      console.log(map.getZoom());
      console.log(map.getCenter());
    }
  });


}

const MapComponent = ({ pinPoint, setPinPoint, guessed, location, setKm }) => {
  const mapRef = React.useRef(null);

  useEffect(() => {
    if (guessed) {
      setKm(Math.round(pinPoint.distanceTo({ lat: location.lat, lng: location.long }) / 1000));
    }
  }, [guessed, pinPoint, location]);

  return (
    <MapContainer
      center={[35, 2]}
      zoom={2}
      style={{ height: "90%", width: "100%", cursor: 'crosshair', userSelect: 'none' }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
      whenReady={() => {
        if (mapRef.current) {
          alert("Map is ready!");
          console.log(mapRef.current);
        }
      }}


    >
      <MapPlugin pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={guessed} />
      {/* place a pin */}
      {pinPoint && <Marker position={pinPoint} /> }
      { guessed && (
        <>
       <Marker position={{lat: location.lat, lng: location.long}} />
      <Polyline positions={[pinPoint, {lat: location.lat, lng: location.long}]} />
      {/* display distance */}
      {/* <p>{Math.round(pinPoint.distanceTo({lat: location.lat, lng: location.long}) / 1000)} km</p> */}
      </>
       ) }
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        noWrap={true}
        edgeBufferTiles={2}
      />
    </MapContainer>
  );
};

export default MapComponent;
