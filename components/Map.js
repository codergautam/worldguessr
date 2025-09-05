import React, { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Circle, Marker, Polyline, Tooltip, useMapEvents } from "react-leaflet";
import { useTranslation } from '@/components/useTranslations';
import 'leaflet/dist/leaflet.css';
import customPins from '../public/customPins.json' with { type: "module" };
import guestNameString from "@/serverUtils/guestNameFromString";

const hintMul = 5000000 / 20000; //5000000 for all countries (20,000 km)

// Dynamic import of react-leaflet components
const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  {
    ssr: false,
  }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  {
    ssr: false,
  }
);

// Normalize lines across wrap
function normalizeLine(start, end) {
  let s = { lat: start.lat, lng: start.lng };
  let e = { lat: end.lat, lng: end.lng };

  if (Math.abs(s.lng - e.lng) > 180) {
    if (s.lng > e.lng) {
      e.lng += 360;
    } else {
      s.lng += 360;
    }
  }
  return [s, e];
}

// Duplicate markers and lines across world wraps
function wrapPositions(latlng) {
  return [-1, 0, 1].map(k => ({ lat: latlng.lat, lng: latlng.lng + k * 360 }));
}

function wrapLines(start, end) {
  return [-1, 0, 1].map(k => normalizeLine(
    { lat: start.lat, lng: start.lng + k * 360 },
    { lat: end.lat, lng: end.lng + k * 360 }
  ));
}

function MapPlugin({ pinPoint, setPinPoint, answerShown, dest, gameOptions, ws, multiplayerState, playSound }) {
  const multiplayerStateRef = React.useRef(multiplayerState);
  const wsRef = React.useRef(ws);

  useEffect(() => {
    multiplayerStateRef.current = multiplayerState;
  }, [multiplayerState]);
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  const map = useMapEvents({
    click(e) {
      const currentMultiplayerState = multiplayerStateRef.current;
      const currentWs = wsRef.current;
      if (!answerShown && (!currentMultiplayerState?.inGame || (currentMultiplayerState?.inGame && !currentMultiplayerState?.gameData?.players.find(p => p.id === currentMultiplayerState?.gameData?.myId)?.final))) {
        setPinPoint(e.latlng);
        if (currentMultiplayerState?.inGame && currentMultiplayerState.gameData?.state === "guess" && currentWs) {
          const pinpointLatLong = [e.latlng.lat, e.latlng.lng];
          currentWs.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false }));
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
          map.setView([30, 0], 2);
        }
      } catch (e) {}
    }, 500);
  }, [gameOptions?.extent ? JSON.stringify(gameOptions.extent) : null, map, answerShown]);

  useEffect(() => {
    if (pinPoint) {
      setTimeout(() => {
        try {
          const bounds = L.latLngBounds([pinPoint, { lat: dest.lat, lng: dest.long }]).pad(0.5);
          map.flyToBounds(bounds, { duration: 0.5 });
        } catch (e) {}
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

const MapComponent = ({ shown, options, ws, session, pinPoint, setPinPoint, answerShown, location, setKm, multiplayerState, showHint, gameOptions }) => {
  const mapRef = React.useRef(null);
  const plopSound = React.useRef();

  const { t: text } = useTranslation("common");

  const icons = useMemo(() => ({
    dest: L.icon({ iconUrl: './dest.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    src: L.icon({ iconUrl: './src.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    src2: L.icon({ iconUrl: './src2.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    polandball: L.icon({ iconUrl: './polandball.png', iconSize: [50, 82], iconAnchor: [25, 41], popupAnchor: [1, 5] })
  }), []);

  useEffect(() => {
    if (answerShown && pinPoint && location) {
      let distanceInKm = pinPoint.distanceTo({ lat: location.lat, lng: location.long }) / 1000;
      if (distanceInKm > 100) distanceInKm = Math.round(distanceInKm);
      else if (distanceInKm > 10) distanceInKm = parseFloat(distanceInKm.toFixed(1));
      else distanceInKm = parseFloat(distanceInKm.toFixed(2));
      setKm(distanceInKm);
    }
  }, [answerShown, pinPoint, location]);

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      minZoom={2}
      maxBounds={[[-90, -360], [90, 360]]}      // lock map to world bounds
      maxBoundsViscosity={1.0}                   // prevent dragging outside
      style={{ height: "100%", width: "100%" }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
    >
      <div className='mapAttr'>
        <img width="60" src='https://lh3.googleusercontent.com/d_S5gxu_S1P6NR1gXeMthZeBzkrQMHdI5uvXrpn3nfJuXpCjlqhLQKH_hbOxTHxFhp5WugVOEcl4WDrv9rmKBDOMExhKU5KmmLFQVg' />
      </div>

      <MapPlugin playSound={() => { plopSound.current.play(); }} pinPoint={pinPoint} setPinPoint={setPinPoint} answerShown={answerShown} dest={location} gameOptions={gameOptions} ws={ws} multiplayerState={multiplayerState} />

      {location && answerShown && wrapPositions({ lat: location.lat, lng: location.long }).map((pos, idx) => (
        <Marker key={`dest-${idx}`} position={pos} icon={icons.dest} />
      ))}

      {pinPoint && (
        <>
          {wrapPositions(pinPoint).map((pos, idx) => (
            <Marker key={`mypin-${idx}`} position={pos} icon={customPins[session?.token?.username] === "polandball" ? icons.polandball : icons.src}>
              <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent>
                {text("yourGuess")}
              </Tooltip>
            </Marker>
          ))}

          {answerShown && location && wrapLines(pinPoint, { lat: location.lat, lng: location.long }).map((line, idx) => (
            <Polyline key={`mylink-${idx}`} positions={line} />
          ))}
        </>
      )}

      {multiplayerState?.inGame && answerShown && location && multiplayerState?.gameData?.players.map((player, index) => {
        if (player.id === multiplayerState?.gameData?.myId) return null;
        if (!player.guess) return null;

        const name = process.env.NEXT_PUBLIC_COOLMATH ? guestNameString(player.username) : player.username;
        const latLong = { lat: player.guess[0], lng: player.guess[1] };
        const tIcon = customPins[name] === "polandball" ? icons.polandball : icons.src2;

        return (
          <>
            {wrapPositions(latLong).map((pos, idx) => (
              <Marker key={`player-${index}-${idx}`} position={pos} icon={tIcon}>
                <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent>
                  <span style={{ color: "black" }}>{name}</span>
                </Tooltip>
              </Marker>
            ))}

            {wrapLines(latLong, { lat: location.lat, lng: location.long }).map((line, idx) => (
              <Polyline key={`pline-${index}-${idx}`} positions={line} color="green" />
            ))}
          </>
        );
      })}

      {showHint && location && (
        <Circle center={{ lat: location.lat, lng: location.long }} radius={hintMul * (gameOptions?.maxDist) ?? 0} />
      )}

      <TileLayer
        noWrap={false}
        continuousWorld={true}
        url={`https://mt{s}.google.com/vt/lyrs=${options?.mapType ?? 'm'}&x={x}&y={y}&z={z}&hl=${text("lang")}`}
        subdomains={['0', '1', '2', '3']}
        attribution='&copy; <a href="https://maps.google.com">Google</a>'
        maxZoom={22}
        zoomOffset={0}
      />

      <audio ref={plopSound} src="/plop.mp3" preload="auto"></audio>
    </MapContainer>
  );
};

export default MapComponent;
