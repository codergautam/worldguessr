import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CircleMarker, Marker, Polyline, Tooltip, useMapEvents } from "react-leaflet";
import { useTranslation } from '@/components/useTranslations';
import { asset } from '@/lib/basePath';
import { getPinIcons } from '@/lib/markerIcons';
import 'leaflet/dist/leaflet.css';
import customPins from '../public/customPins.json' with { type: "module" };
import guestNameString from "@/serverUtils/guestNameFromString";
import CountryFlag from './utils/countryFlag';
const hintMul = 7500000 / 20000; //7500000 for all countries (20,000 km)

// Simple seeded random for stable hint offset per round
function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

// HintCircle component that scales with zoom
function HintCircle({ location, gameOptions, round }) {
  const [zoom, setZoom] = useState(2);

  const map = useMapEvents({
    zoom: () => setZoom(map.getZoom()),
  });

  // Scale hint circle with maxDist (75px base at 20000km world map)
  const maxDist = gameOptions?.maxDist ?? 20000;
  const ogRadius = 75 * (maxDist / 20000);
  const pixelRadius = ogRadius * Math.pow(2, zoom - 1);
  // Offset the center by 0 to pixelRadius in a random direction (sqrt for uniform area distribution)
  const seed = (round ?? 1) + Math.abs(location.lat * ogRadius + location.long * ogRadius);
  const offsetAngle = seededRandom(seed * 3) * 2 * Math.PI;
  const offsetAmount = Math.sqrt(seededRandom(seed * 7)) * pixelRadius;
  const offsetX = offsetAmount * Math.cos(offsetAngle);
  const offsetY = offsetAmount * Math.sin(offsetAngle);

  // Convert pixel offset back to lat/lng
  const pointC = map.latLngToContainerPoint(L.latLng(location.lat, location.long));
  const offsetPoint = L.point(pointC.x + offsetX, pointC.y + offsetY);
  const offsetCenter = map.containerPointToLatLng(offsetPoint);

  return (
    <CircleMarker
      center={offsetCenter}
      radius={pixelRadius}
      className="hintCircle"
    />
  );
}

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

function MapPlugin({ pinPoint, setPinPoint, answerShown, dest, gameOptions, ws, multiplayerState, playSound, countryGuessPin, setAnimationDone }) {
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
          currentWs.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false, round: currentMultiplayerState.gameData?.curRound }));
        }
        // play sound
        // playSound();
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
    if (!answerShown || !dest) return;
    setAnimationDone(false);
    // Keep map centered during the CSS fullscreen expansion (200ms)
    const expandInterval = setInterval(() => { try { map.invalidateSize(); } catch(e) {} }, 10);
    setTimeout(() => clearInterval(expandInterval), 250);
    let totalMs;
    if (pinPoint) {
      totalMs = 300 + 500; // 300ms delay + 0.5s fly
      setTimeout(() => {
        try {
          const bounds = L.latLngBounds([pinPoint, { lat: dest.lat, lng: dest.long }]).pad(0.5);
          map.flyToBounds(bounds, { duration: 0.5 });
        } catch(e) {}
      }, 300);
    } else if (countryGuessPin) {
      totalMs = 200 + 1200; // 200ms delay + 1.2s fly
      try { map.setView([20, 0], 2, { animate: false }); } catch(e) {}
      setTimeout(() => {
        try {
          const bounds = L.latLngBounds(
            [{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }, { lat: dest.lat, lng: dest.long }]
          ).pad(0.5);
          map.flyToBounds(bounds, { duration: 1.2 });
        } catch(e) {}
      }, 200);
    } else {
      totalMs = 200 + 1800; // 200ms delay + 1.8s fly
      try { map.setView([20, 0], 2, { animate: false }); } catch(e) {}
      setTimeout(() => {
        try {
          map.flyTo([dest.lat, dest.long], 5, { duration: 1.8 });
        } catch(e) {}
      }, 200);
    }
    const t = setTimeout(() => setAnimationDone(true), totalMs + 100);
    return () => clearTimeout(t);
  }, [answerShown]);

  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (!container) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
}

const MapComponent = ({ shown, options, ws, session, pinPoint, setPinPoint, answerShown, location, setKm, guessing, multiplayerSentGuess, multiplayerState, showHint, round, focused, gameOptions, countryGuessPin, hidePins }) => {
  const mapRef = React.useRef(null);
  const plopSound = React.useRef();
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [animationDone, setAnimationDone] = useState(true);

  const { t: text } = useTranslation("common");

  // Detect mobile/tablet devices
  useEffect(() => {
    const checkDevice = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 1024;
      setIsMobileOrTablet(isTouchDevice || isSmallScreen);
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // Use shared icon cache (created once, reused across all mounts)
  const sharedIcons = getPinIcons();
  const icons = {
    dest: sharedIcons?.destSmall,
    src: sharedIcons?.srcSmall,
    src2: sharedIcons?.src2Small,
    polandball: sharedIcons?.polandball,
  };


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
        <img width="60" src='https://lh3.googleusercontent.com/d_S5gxu_S1P6NR1gXeMthZeBzkrQMHdI5uvXrpn3nfJuXpCjlqhLQKH_hbOxTHxFhp5WugVOEcl4WDrv9rmKBDOMExhKU5KmmLFQVg' alt="Google" />
      </div>
      <MapPlugin playSound={
        () => {
          plopSound.current.play();
        }
      } pinPoint={pinPoint} setPinPoint={setPinPoint} answerShown={answerShown} dest={location} gameOptions={gameOptions} ws={ws} multiplayerState={multiplayerState} countryGuessPin={countryGuessPin} setAnimationDone={setAnimationDone} />
      {/* place a pin */}
      {location && answerShown && !hidePins && (
        <Marker position={{ lat: location.lat, lng: location.long }} icon={icons.dest} />
      )}
      {pinPoint && !hidePins && (
        <>
          <Marker position={pinPoint} icon={customPins[session?.token?.username] === "polandball" ? icons.polandball : icons.src} >
          <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent  position={{ lat: pinPoint.lat, lng: pinPoint.lng }}>

              {text("yourGuess")}
            </Tooltip>
          </Marker>


          {answerShown && location && (window.matchMedia("(min-width: 600px) and (pointer: fine)").matches || animationDone) && (
            < Polyline className={animationDone && !window.matchMedia("(min-width: 600px) and (pointer: fine)").matches ? "animatedLine" : ""} positions={[pinPoint, { lat: location.lat, lng: location.long }]} />
          )}
        </>
      )}

      {countryGuessPin && answerShown && !hidePins && location && (
        <>
          <Marker position={{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }} icon={customPins[session?.token?.username] === "polandball" ? icons.polandball : icons.src} >
            <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent position={{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }}>
              {text("yourGuess")}
            </Tooltip>
          </Marker>
          {(window.matchMedia("(min-width: 600px) and (pointer: fine)").matches || animationDone) && (
            <Polyline className={animationDone && !window.matchMedia("(min-width: 600px) and (pointer: fine)").matches ? "animatedLine" : ""} positions={[{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }, { lat: location.lat, lng: location.long }]} dashArray="8 8" />
          )}
        </>
      )}

      {multiplayerState?.inGame && answerShown && location && multiplayerState?.gameData?.players.map((player, index) => {
       if(player.id === multiplayerState?.gameData?.myId) return null;
        if(!player.guess) return null;


        const name = process.env.NEXT_PUBLIC_COOLMATH?guestNameString(player.username):player.username;
        const latLong = [player.guess[0], player.guess[1]];

        const tIcon = customPins[name]==="polandball" ? icons.polandball : icons.src2;

        return (
          <>
            <Marker key={(index*2)} position={{ lat: latLong[0], lng: latLong[1] }} icon={tIcon}>
            <Tooltip direction="top" offset={[0, -45]} opacity={1} permanent  position={{ lat: latLong[0], lng: latLong[1] }}>
              <span style={{color: "black", display: 'flex', alignItems: 'center', gap: '4px'}}>
                {name}
                {player.countryCode && <CountryFlag countryCode={player.countryCode} style={{ fontSize: '0.9em', marginRight: '0' }} />}
              </span>
            </Tooltip>
            </Marker>
            {(window.matchMedia("(min-width: 600px) and (pointer: fine)").matches || animationDone) && (
              <Polyline className={animationDone && !window.matchMedia("(min-width: 600px) and (pointer: fine)").matches ? "animatedLine" : ""} key={(index*2)+1} positions={[{ lat: latLong[0], lng: latLong[1] }, { lat: location.lat, lng: location.long }]} color="green" />
            )}


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
        <HintCircle location={location} gameOptions={gameOptions} round={round} />
      )}

      <TileLayer
        key={isMobileOrTablet ? 'mobile' : 'desktop'}
        noWrap={true}
        url={`https://mt{s}.google.com/vt/lyrs=${options?.mapType ?? 'm'}&x={x}&y={y}&z={z}&hl=${text("lang")}&scale=2`}
        subdomains={['0', '1', '2', '3']}
        attribution='&copy; <a href="https://maps.google.com">Google</a>'
        maxZoom={22}
        // tileSize={isMobileOrTablet ? 512 : 256}
        // zoomOffset={isMobileOrTablet ? -1 : 0}
        // detectRetina={true}
      />

    <audio ref={plopSound} src={asset("/plop.mp3")} preload="auto"></audio>

    </MapContainer>
  );
};

export default MapComponent;
