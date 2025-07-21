import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { useTranslation } from '@/components/useTranslations';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);

// Component to handle map events and store map reference
const MapEvents = ({ mapRef, onMapReady, history }) => {
  const map = useMap();

  useEffect(() => {
    if (map && !mapRef.current) {
      mapRef.current = map;
      onMapReady(true);

      // Force resize after creation
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }
  }, [map, mapRef, onMapReady]);

  return null;
};

const GameSummary = ({
    history,
    points,
    time,
    maxPoints,
    button1Press,
    button1Text,
    button2Press,
    button2Text,
    duel,
    data,
    hidden
}) => {
  const { t: text } = useTranslation("common");
  const [activeRound, setActiveRound] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const mapRef = useRef(null);
  const destIconRef = useRef(null);
  const srcIconRef = useRef(null);

  // Initialize Leaflet icons when available
  useEffect(() => {
    const checkLeaflet = () => {
      if (typeof window !== 'undefined' && window.L) {
        destIconRef.current = window.L.icon({
          iconUrl: './dest.png',
          iconSize: [30, 49],
          iconAnchor: [15, 49],
          popupAnchor: [1, -34],
        });

        srcIconRef.current = window.L.icon({
          iconUrl: './src.png',
          iconSize: [30, 49],
          iconAnchor: [15, 49],
          popupAnchor: [1, -34],
        });

        setLeafletReady(true);
      } else {
        // Retry if Leaflet isn't loaded yet
        setTimeout(checkLeaflet, 100);
      }
    };

    checkLeaflet();
  }, []);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const formatDistance = (distance) => {
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    } else if (distance < 10) {
      return `${distance.toFixed(1)}km`;
    } else {
      return `${Math.round(distance)}km`;
    }
  };

  const getPointsColor = (points) => {
    if (points >= 3500) return '#4CAF50';
    if (points >= 1500) return '#FFC107';
    return '#F44336';
  };

  const openInGoogleMaps = (lat, lng) => {
    const url = `https://www.google.com/maps/@${lat},${lng},15z`;
    window.open(url, '_blank');
  };

  const getOptimalZoom = (distance) => {
    if (distance < 1) return 15;
    if (distance < 5) return 13;
    if (distance < 25) return 11;
    if (distance < 100) return 9;
    if (distance < 500) return 7;
    if (distance < 2000) return 5;
    return 3;
  };

  const fitMapToBounds = () => {
    if (!mapRef.current || !history.length || !window.L) {
      console.log('fitMapToBounds early return:', {
        mapRef: !!mapRef.current,
        historyLength: history.length,
        leaflet: !!window.L
      });
      return;
    }

    const map = mapRef.current;
    const bounds = window.L.latLngBounds();

    history.forEach(round => {
      bounds.extend([round.lat, round.long]);
      if (round.guessLat && round.guessLong) {
        bounds.extend([round.guessLat, round.guessLong]);
      }
    });

    try {
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
    } catch (error) {
      console.error('Error fitting map to bounds:', error);
    }
  };

  const focusOnRound = (roundIndex) => {
    console.log('focusOnRound called:', {
      mapRef: !!mapRef.current,
      history: history.length,
      roundIndex,
      leaflet: !!window.L
    });

    if (!mapRef.current || !history[roundIndex] || !window.L) {
      console.log('focusOnRound early return');
      return;
    }

    const round = history[roundIndex];
    const map = mapRef.current;

    console.log(`Focusing on round ${roundIndex + 1}:`, round);

    if (round.guessLat && round.guessLong) {
      const distance = calculateDistance(round.lat, round.long, round.guessLat, round.guessLong);
      const optimalZoom = getOptimalZoom(distance);

      const bounds = window.L.latLngBounds([
        [round.lat, round.long],
        [round.guessLat, round.guessLong]
      ]);

         map.flyToBounds(bounds, {
      padding: [50, 50],
      maxZoom: optimalZoom,
      duration: 1.5, // Animation duration in seconds
      easeLinearity: 0.25 // Controls the animation easing (0-1, lower = more easing)
    });
  } else {
    // Use flyTo for smooth animation to single point
    map.flyTo([round.lat, round.long], 10, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }
  };

  useEffect(() => {
    if (mapReady && history.length > 0 && leafletReady) {
      console.log('Map ready, fitting bounds...');
      setTimeout(() => {
        fitMapToBounds();
      }, 200);
    }
  }, [mapReady, history, leafletReady]);

  const handleRoundClick = (index) => {
    console.log(`Round ${index + 1} clicked`);
    setActiveRound(index);

    // Add a small delay to ensure the click visual feedback happens first
    setTimeout(() => {
      focusOnRound(index);
    }, 100);
  };

  // Don't render until Leaflet is ready
  if (!leafletReady || !destIconRef.current || !srcIconRef.current) {
    return (
      <div className="game-summary-container">
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          color: 'white',
          fontSize: '1.5rem'
        }}>
          {text("loadingMap")}
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return null;
  }

  return (
    <div className="game-summary-container">
      <div className="game-summary-map">
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: "100%", width: "100%" }}
        >
          <MapEvents
            mapRef={mapRef}
            onMapReady={setMapReady}
            history={history}
          />

          <TileLayer
            url={`https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=${text("lang")}`}
          />

          {history.map((round, index) => {
            const distance = round.guessLat && round.guessLong
              ? calculateDistance(round.lat, round.long, round.guessLat, round.guessLong)
              : null;

            return (
              <React.Fragment key={index}>
                {/* Actual location marker */}
                <Marker
                  position={[round.lat, round.long]}
                  icon={destIconRef.current}
                >
                  <Popup className="map-marker-popup">
                    <div className="popup-content">
                      <div className="popup-round">{text("roundNumber", {number: index + 1})} - {text("actualLocation")}</div>
                      <div className="popup-points" style={{ color: getPointsColor(round.points) }}>
                        {round.points} {text("points")}
                      </div>
                      {distance && (
                        <div className="popup-distance">
                          {text("distance")}: {formatDistance(distance)}
                        </div>
                      )}
                      <div className="popup-actions">
                        <button
                          className="popup-btn gmaps"
                          onClick={() => openInGoogleMaps(round.lat, round.long)}
                        >
                          📍 {text("openInMaps")}
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>

                {/* Guess location marker and line */}
                {round.guessLat && round.guessLong && (
                  <>
                    <Marker
                      position={[round.guessLat, round.guessLong]}
                      icon={srcIconRef.current}
                    >
                      <Popup className="map-marker-popup">
                        <div className="popup-content">
                          <div className="popup-round">{text("roundNumber", {number: index + 1})} - {text("yourGuess")}</div>
                          <div className="popup-points" style={{ color: getPointsColor(round.points) }}>
                            {round.points} {text("points")}
                          </div>
                          <div className="popup-distance">
                            {text("distance")}: {formatDistance(distance)}
                          </div>
                        </div>
                      </Popup>
                    </Marker>

                    <Polyline
                      positions={[
                        [round.lat, round.long],
                        [round.guessLat, round.guessLong]
                      ]}
                      color={getPointsColor(round.points)}
                      weight={3}
                      opacity={activeRound === index ? 1 : 0.6}
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

      <div className={`game-summary-sidebar ${mobileExpanded ? 'mobile-expanded' : ''}`}>
        <div className="summary-header">
          <h1 className="summary-title">{text("gameComplete")}</h1>
          <div className="summary-score">{points}</div>
          <div className="summary-total">
            {text("outOf")} {history.length * 5000} {text("points")}</div>

          <div className="summary-actions">
            <button 
              className="action-btn mobile-expand-btn" 
              onClick={() => setMobileExpanded(!mobileExpanded)}
            >
              {mobileExpanded ? text("hideDetails") : text("viewDetails")}
            </button>
            
            {button1Text && (
            <button className="action-btn primary" onClick={button1Press}>
                {button1Text || 'Play Again'}
            </button>
            )}
            {button2Text && (
            <button className="action-btn secondary" onClick={button2Press}>
                {button2Text || 'Close'}
            </button>
            )}
          </div>
        </div>

        <div className={`rounds-container ${!mobileExpanded ? 'mobile-hidden' : ''}`}>
          {history.map((round, index) => {
            const distance = round.guessLat && round.guessLong
              ? calculateDistance(round.lat, round.long, round.guessLat, round.guessLong)
              : null;

            return (
              <div
                key={index}
                className={`round-item round-animation ${activeRound === index ? 'active' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
                onClick={() => handleRoundClick(index)}
              >
                <div className="round-header">
                  <span className="round-number">{text("roundNumber", {number: index + 1})}</span>
                  <span
                    className="round-points"
                    style={{ color: getPointsColor(round.points) }}
                  >
                    {round.points} {text("pts")}
                  </span>
                </div>

                <div className="round-details">
                  {distance && (
                    <div className="detail-row">
                      <span className="detail-label">
                        <span className="detail-icon">📏</span>
                        {text("distance")}
                      </span>
                      <span className="distance-value">{formatDistance(distance)}</span>
                    </div>
                  )}


                  <div className="location-info">
                    {/* <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.8rem' }}>
                      Click to focus on map
                    </span> */}
                    <button
                      className="gmaps-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInGoogleMaps(round.lat, round.long);
                      }}
                    >
                      📍 {text("openInMaps")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GameSummary;