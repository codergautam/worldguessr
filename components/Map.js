import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { Marker, useMapEvents } from "react-leaflet";

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

function MapPlugin({ pinPoint, setPinPoint }) {

  const map = useMapEvents({
    click(e) {
      setPinPoint(e.latlng);
    },
  });


}

const MapComponent = ({ pinPoint, setPinPoint }) => {
  const mapRef = React.useRef(null);

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      style={{ height: "90%", width: "100%" }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
      whenReady={() => {
        if (mapRef.current) {
          alert("Map is ready!");
          console.log(mapRef.current);
        }
      }}


    >
      <MapPlugin pinPoint={pinPoint} setPinPoint={setPinPoint} />
      {/* place a pin */}
      {pinPoint && <Marker position={pinPoint} /> }
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  );
};

export default MapComponent;
