import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { Marker, Polyline, useMapEvents } from "react-leaflet";
import L from 'leaflet';
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

function MapPlugin({ pinPoint, setPinPoint, guessed, dest }) {
  const map = useMapEvents({
    click(e) {
      if(guessed) return;
      setPinPoint(e.latlng);
    },
  });

  useEffect(() => {
    // reset map to initial state center and zoom
    map.setView([35, 2], 2);
    
  }, [dest]);

  useEffect(() => {
    if (guessed) {

      // pan to the destination
      // invalidates the map

      // center at the destination

      map.invalidateSize();

      setTimeout(() => {
      map.flyTo({lat: dest.lat, lng: dest.long}, 5, {
        duration: 3,
      });
    }, 300);

    }
  }, [guessed]);
}

const MapComponent = ({ pinPoint, setPinPoint, guessed, location, setKm, height }) => {
  const destIcon = L.icon({
    iconUrl: '/dest.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

  const corner1 = L.latLng(-90, -180)
  const corner2 = L.latLng(90, 180)
const bounds = L.latLngBounds(corner1, corner2)

  useEffect(() => {
    if (guessed) {
      setKm(Math.round(pinPoint.distanceTo({ lat: location.lat, lng: location.long }) / 1000));
    }
  }, [guessed, pinPoint, location]);


  return (
    <MapContainer
      center={[35, 2]}
      zoom={2}
      style={{ height: height, width: "100%", cursor: 'crosshair', userSelect: 'none' }}
      maxBounds={bounds}
      maxBoundsViscosity={0.5}
    >

      <MapPlugin pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={guessed} dest={location} />
      {/* place a pin */}
      {pinPoint && <Marker position={pinPoint} /> }
      { guessed && location && (
        <>
       <Marker position={{lat: location.lat, lng: location.long}} icon={destIcon} />
      {/* draw a line */}
      {/* no polyline. use a different type of object */}
      {/* < Polyline positions={[pinPoint, {lat: location.lat, lng: location.long}]} /> */}
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
