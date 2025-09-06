import React, { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Circle, Marker, Polyline, Tooltip, useMapEvents } from "react-leaflet";
import { useTranslation } from '@/components/useTranslations';
import 'leaflet/dist/leaflet.css';
import customPins from '../public/customPins.json'; // fixed import
import guestNameString from "@/serverUtils/guestNameFromString";

const hintMul = 5000000 / 20000; //5000000 for all countries (20,000 km)

// Dynamic import of react-leaflet components
const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);

// Returns the shortest difference from aLng to bLng in range (-180, 180]
function shortestLngDifference(aLng, bLng) {
  // compute difference normalized to (-180,180]
  let diff = ((bLng - aLng + 540) % 360) - 180;
  return diff;
}

// Return an adjusted pair [start, end] where end.lng is moved by +/-360
// so the longitude difference is the minimal arc
function adjustLngsToShortestArc(start, end) {
  const s = { lat: start.lat, lng: start.lng };
  const e = { lat: end.lat, lng: end.lng };

  const diff = shortestLngDifference(s.lng, e.lng);
  e.lng = s.lng + diff;
  return [s, e];
}

// Duplicate markers across wraps (useful for markers)
function wrapPositions(latlng) {
  return [-1, 0, 1].map(k => ({ lat: latlng.lat, lng: latlng.lng + k * 360 }));
}

// Produce 3 candidate lines already normalized so they don't cross the map midline
function wrapLines(start, end) {
  return [-1, 0, 1].map(k => {
    const s = { lat: start.lat, lng: start.lng + k * 360 };
    const e = { lat: end.lat, lng: end.lng + k * 360 };
    return adjustLngsToShortestArc(s, e);
  });
}

function MapPlugin({ pinPoint, setPinPoint, answerShown, dest, gameOptions, ws, multiplayerState, playSound }) {
  const multiplayerStateRef = React.useRef(multiplayerState);
  const wsRef = React.useRef(ws);

  useEffect(() => { multiplayerStateRef.current = multiplayerState; }, [multiplayerState]);
  useEffect(() => { wsRef.current = ws; }, [ws]);

  const map = useMapEvents({
    click(e) {
      const currentMultiplayerState = multiplayerStateRef.current;
      const currentWs = wsRef.current;
      const isPlayerAllowedToPlace = !answerShown &&
        (!currentMultiplayerState?.inGame ||
          (currentMultiplayerState?.inGame &&
            !currentMultiplayerState?.gameData?.players.find(p => p.id === currentMultiplayerState?.gameData?.myId)?.final));

      if (!map || !isPlayerAllowedToPlace) return;

      setPinPoint(e.latlng);
      if (currentMultiplayerState?.inGame && currentMultiplayerState.gameData?.state === "guess" && currentWs) {
        const pinpointLatLong = [e.latlng.lat, e.latlng.lng];
        currentWs.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false }));
      }
    },
  });

  // initial extent / view
  useEffect(() => {
    if (!map || answerShown) return;

    const t = setTimeout(() => {
      try {
        const extent = gameOptions?.extent;
        if (extent) {
          // extent format assumed: [minLng, minLat, maxLng, maxLat] as in your code
          const bounds = L.latLngBounds([extent[1], extent[0]], [extent[3], extent[2]]);
          map.fitBounds(bounds);
        } else {
          map.setView([30, 0], 2);
        }
      } catch (e) {
        // keep silent but could console.error(e)
        // console.error(e);
      }
    }, 500);

    return () => clearTimeout(t);
  }, [map, gameOptions?.extent ? JSON.stringify(gameOptions.extent) : null, answerShown]);

  // When the round ends / answerShown, fly to bounds that include the guess and the answer.
  useEffect(() => {
    // only run when answerShown true and both pinPoint and dest exist
    if (!map || !answerShown || !pinPoint || !dest) return;

    const t = setTimeout(() => {
      try {
        // Adjust longitudes so they are on the shortest arc
        const [sAdj, eAdj] = adjustLngsToShortestArc(
          { lat: pinPoint.lat, lng: pinPoint.lng },
          { lat: dest.lat, lng: dest.long ?? dest.lng } // tolerate both 'long' and 'lng'
        );

        // Build bounds from the two adjusted points
        const south = Math.min(sAdj.lat, eAdj.lat);
        const north = Math.max(sAdj.lat, eAdj.lat);
        const west = Math.min(sAdj.lng, eAdj.lng);
        const east = Math.max(sAdj.lng, eAdj.lng);

        const bounds = L.latLngBounds([south, west], [north, east]).pad(0.5);
        map.flyToBounds(bounds, { duration: 0.8 });
      } catch (e) {
        // console.error(e);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [map, answerShown, pinPoint, dest]);

  // reduce the frequency of invalidateSize; 5ms is far too aggressive
  useEffect(() => {
    if (!map) return;
    const i = setInterval(() => { map.invalidateSize(); }, 500); // 500ms
    return () => clearInterval(i);
  }, [map]);

  // This plugin does not render any DOM
  return null;
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
      // pinPoint may be a Leaflet LatLng or plain object
      const toLatLng = (x) => (x && typeof x.distanceTo === 'function') ? x : L.latLng(x.lat, x.lng ?? x.long);
      const p = toLatLng(pinPoint);
      const l = L.latLng(location.lat, location.long ?? location.lng);

      let distanceInKm = p.distanceTo(l) / 1000;
      if (distanceInKm > 100) distanceInKm = Math.round(distanceInKm);
      else if (distanceInKm > 10) distanceInKm = parseFloat(distanceInKm.toFixed(1));
      else distanceInKm = parseFloat(distanceInKm.toFixed(2));
      setKm(distanceInKm);
    }
  }, [answerShown, pinPoint, location, setKm]);

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      minZoom={2}
      maxBounds={[[-90, -360], [90, 360]]}
      maxBoundsViscosity={1.0}
      style={{ height: "100%", width: "100%" }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
    >
      <div className='mapAttr'>
        <img width="60" src='https://lh3.googleusercontent.com/d_S5gxu_S1P6NR1gXeMthZeBzkrQMHdI5uvXrpn3nfJuXpCjlqhLQKH_hbOxTHxFhp5WugVOEcl4WDrv9rmKBDOMExhKU5KmmLFQVg' />
      </div>

      <MapPlugin
        playSound={() => { plopSound.current?.play(); }}
        pinPoint={pinPoint}
        setPinPoint={setPinPoint}
        answerShown={answerShown}
        dest={location}
        gameOptions={gameOptions}
        ws={ws}
        multiplayerState={multiplayerState}
      />

      {location && answerShown && wrapPositions({ lat: location.lat, lng: location.long ?? location.lng }).map((pos, idx) => (
        <Marker key={`dest-${idx}`} position={pos} icon={icons.dest} />
      ))}

      {pinPoint && (
        <>
          {wrapPositions({ lat: pinPoint.lat ?? pinPoint.lat, lng: pinPoint.lng ?? pinPoint.lng ?? pinPoint.long }).map((pos, idx) => (
            <Marker key={`mypin-${idx}`} position={pos} icon={customPins[session?.token?.username] === "polandball" ? icons.polandball : icons.src}>
              <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent>
                {text("yourGuess")}
              </Tooltip>
            </Marker>
          ))}

          {answerShown && location && wrapLines(
            { lat: pinPoint.lat, lng: pinPoint.lng ?? pinPoint.long },
            { lat: location.lat, lng: location.long ?? location.lng }
          ).map((line, idx) => (
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
          <React.Fragment key={`player-frag-${index}`}>
            {wrapPositions(latLong).map((pos, idx) => (
              <Marker key={`player-${index}-${idx}`} position={pos} icon={tIcon}>
                <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent>
                  <span style={{ color: "black" }}>{name}</span>
                </Tooltip>
              </Marker>
            ))}

            {wrapLines(latLong, { lat: location.lat, lng: location.long ?? location.lng }).map((line, idx) => (
              <Polyline key={`pline-${index}-${idx}`} positions={line} />
            ))}
          </React.Fragment>
        );
      })}

      {showHint && location && (
        <Circle center={{ lat: location.lat, lng: location.long ?? location.lng }} radius={hintMul * (gameOptions?.maxDist ?? 0)} />
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
