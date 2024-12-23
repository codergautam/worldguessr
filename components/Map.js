import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { Circle, Marker, Polyline, Popup, Tooltip, useMapEvents } from "react-leaflet";
import { useTranslation } from '@/components/useTranslations';
import 'leaflet/dist/leaflet.css';
import customPins from '../public/customPins.json' with { type: "module" };
import guestNameString from "@/serverUtils/guestNameFromString";
const hintMul = 5000000 / 20000; //5000000 for all countries (20,000 km)

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

function MapPlugin({ pinPoint, setPinPoint, answerShown, dest, gameOptions, ws, multiplayerState, playSound }) {
  const multiplayerStateRef = React.useRef(multiplayerState);
  const wsRef = React.useRef(ws);

  // Update the ref whenever multiplayerState changes
  useEffect(() => {
    multiplayerStateRef.current = multiplayerState;
  }, [multiplayerState]);
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  const map = useMapEvents({
    click(e) {
      const currentMultiplayerState = multiplayerStateRef.current; // Use the ref here
      const currentWs = wsRef.current; // Use the ref here
      if (!answerShown && (!currentMultiplayerState?.inGame || (currentMultiplayerState?.inGame && !currentMultiplayerState?.gameData?.players.find(p => p.id === currentMultiplayerState?.gameData?.myId)?.final))) {
        setPinPoint(e.latlng);
        if (currentMultiplayerState?.inGame && currentMultiplayerState.gameData?.state === "guess" && currentWs) {
          const pinpointLatLong = [e.latlng.lat, e.latlng.lng];
          currentWs.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false }));
        }
        // play sound
        playSound();
        // if point is outside bounds, pan back
        const bounds = L.latLngBounds([-90, -180], [90, 180]);

        if(!bounds.contains(e.latlng)) {
        const center = e.target.panInsideBounds(bounds, { animate: true });
        }
      }
    },
  });

  useEffect(() => {
    let extent = gameOptions?.extent;
    if (!map || answerShown) return;

    setTimeout(() => {
      try {

      if (extent) {
        const bounds = L.latLngBounds([extent[1], extent[0]], [extent[3], extent[2]]);
        map.fitBounds(bounds);
      } else {
        // reset to default
        map.setView([30, 0], 2);
      }
    }catch(e) {}
    }, 500);
  }, [gameOptions?.extent ? JSON.stringify(gameOptions.extent) : null, map, answerShown]);

  useEffect(() => {
    if (pinPoint) {
      setTimeout(() => {
        try {
        const bounds = L.latLngBounds([pinPoint, { lat: dest.lat, lng: dest.long }]).pad(0.5);
        map.flyToBounds(bounds, { duration: 0.5 });
        } catch(e) {}
      }, 300);
    }
  }, [answerShown]);

  useEffect(() => {
    const i = setInterval(() => {
      map.invalidateSize();
    }, 5);
    return () => clearInterval(i);
  }, [map]);
}

const MapComponent = ({ shown, options, ws, session, pinPoint, setPinPoint, answerShown, location, setKm, guessing, multiplayerSentGuess, multiplayerState, showHint, round, focused, gameOptions }) => {
  const mapRef = React.useRef(null);
  const plopSound = React.useRef();

  const { t: text } = useTranslation("common");
  const destIcon = L.icon({
    iconUrl: './dest.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
  const srcIcon = L.icon({
    iconUrl: './src.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
  const src2Icon = L.icon({
    iconUrl: './src2.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
  const polandballIcon = L.icon({
    iconUrl: './polandball.png',
    iconSize: [50, 82],
    iconAnchor: [25, 41],
    popupAnchor: [1, 5],
  });


  useEffect(() => {
    if (answerShown && pinPoint && location) {
      // setKm(Math.round(

      let distanceInKm =pinPoint.distanceTo({ lat: location.lat, lng: location.long }) / 1000;
      if (distanceInKm > 100) distanceInKm = Math.round(distanceInKm);
      else if (distanceInKm > 10) distanceInKm = parseFloat(distanceInKm.toFixed(1));
      else distanceInKm = parseFloat(distanceInKm.toFixed(2));
      setKm(distanceInKm);
    }
  }, [answerShown, pinPoint, location]);

  const corner1 = L.latLng(-90 * 2, -180 * 2)
  const corner2 = L.latLng(90 * 2, 180 * 2)
  const bounds = L.latLngBounds(corner1, corner2)

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      minZoom={2}
      style={{ height: "100%", width: "100%" }}
      whenCreated={mapInstance => {
        mapRef.current = mapInstance;
      }}
    >

      <div className='mapAttr'>
        <img width="60" src='https://lh3.googleusercontent.com/d_S5gxu_S1P6NR1gXeMthZeBzkrQMHdI5uvXrpn3nfJuXpCjlqhLQKH_hbOxTHxFhp5WugVOEcl4WDrv9rmKBDOMExhKU5KmmLFQVg' />
      </div>
      <MapPlugin playSound={
        () => {
          plopSound.current.play();
        }
      } pinPoint={pinPoint} setPinPoint={setPinPoint} answerShown={answerShown} dest={location} gameOptions={gameOptions} ws={ws} multiplayerState={multiplayerState} />
      {/* place a pin */}
      {location && answerShown && (
        <Marker position={{ lat: location.lat, lng: location.long }} icon={destIcon} />
      )}
      {pinPoint && (
        <>
          <Marker position={pinPoint} icon={customPins[session?.token?.username] === "polandball" ? polandballIcon : srcIcon} >
          <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent  position={{ lat: pinPoint.lat, lng: pinPoint.lng }}>

              {text("yourGuess")}
            </Tooltip>
          </Marker>


          {answerShown && location && (
            < Polyline positions={[pinPoint, { lat: location.lat, lng: location.long }]} />
          )}
        </>
      )}

      {multiplayerState?.inGame && answerShown && location && multiplayerState?.gameData?.players.map((player, index) => {
       if(player.id === multiplayerState?.gameData?.myId) return null;
        if(!player.guess) return null;


        const name = process.env.NEXT_PUBLIC_COOLMATH?guestNameString(player.username):player.username;
        const latLong = [player.guess[0], player.guess[1]];

        const tIcon = customPins[name]==="polandball" ? polandballIcon : src2Icon;

        return (
          <>
            <Marker key={(index*2)} position={{ lat: latLong[0], lng: latLong[1] }} icon={tIcon}>
            <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent  position={{ lat: latLong[0], lng: latLong[1] }}>
              <span style={{color: "black"}}>{name}</span>
            </Tooltip>
            </Marker>
            <Polyline key={(index*2)+1} positions={[{ lat: latLong[0], lng: latLong[1] }, { lat: location.lat, lng: location.long }]} color="green" />


          </>
        )
      })}

      {/* /*   function drawHint(initialMap, location, randomOffset) {
    // create a circle overlay 10000km radius from location

    let lat = location.lat;
    let long = location.long
    let center = fromLonLat([long, lat]);
    center = [center[0] + randomOffset[0], center[1] + randomOffset[1]];
    // move it a bit randomly so it's not exactly on the location but location is inside the circle
    const circle = new Feature(new Circle(center, hintMul * (gameOptions?.maxDist ?? 0)));
    vectorSource.current.addFeature(circle);

    const circleLayer = new VectorLayer({
      source: new VectorSource({
        features: [circle]
      }),
      style: new Style({
        stroke: new Stroke({
          color: '#f00',
          width: 2
        })
      })
    });
    initialMap.addLayer(circleLayer);
  } */}

      {showHint && location && (
        <Circle center={{ lat: location.lat, lng: location.long }} radius={hintMul * (gameOptions?.maxDist) ?? 0} />
      )}

      <TileLayer
        noWrap={true}
        url={`https://mt2.google.com/vt/lyrs=${options?.mapType ?? 'm'}&x={x}&y={y}&z={z}&hl=${text("lang")}`}
      />

    <audio ref={plopSound} src="/plop.mp3" preload="auto"></audio>

    </MapContainer>
  );
};

export default MapComponent;
