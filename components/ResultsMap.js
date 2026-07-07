import React, { useEffect, useState, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { useTranslation } from '@/components/useTranslations';
import { getPinIcons } from '@/lib/markerIcons';
import { findDistance, pickBestTeamGuessIds } from './calcPoints';
import 'leaflet/dist/leaflet.css';
import SafeMapContainer from './SafeMapContainer';

// Reusable all-rounds results Leaflet map, lifted verbatim from the desktop
// MapContainer block in components/roundOverScreen.js so the mobile WebView
// (via /embed/results) reuses the exact web map. MapContainer/TileLayer touch
// window (Leaflet) → client-only, dynamically imported with ssr:false exactly
// like roundOverScreen.js. MapContainer is error-boundaried (SafeMapContainer)
// so a partial leaflet load can't white-screen the app.
const MapContainer = SafeMapContainer;
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);

// Lifted from roundOverScreen.js: stores the map ref, fires onMapReady, and
// reports user-initiated pan/zoom so callers can stop auto-fitting.
const MapEvents = ({ mapRef, onMapReady, onUserInteraction }) => {
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

  // Listen for user-initiated map interactions
  useEffect(() => {
    if (map && onUserInteraction) {
      const handleUserInteraction = () => {
        onUserInteraction();
      };

      // Listen for zoom and pan events initiated by user
      map.on('zoomstart', handleUserInteraction);
      map.on('movestart', handleUserInteraction);
      map.on('dragstart', handleUserInteraction);

      return () => {
        map.off('zoomstart', handleUserInteraction);
        map.off('movestart', handleUserInteraction);
        map.off('dragstart', handleUserInteraction);
      };
    }
  }, [map, onUserInteraction]);

  return null;
};

// --- Helpers lifted verbatim from roundOverScreen.js ---

const getPointsColor = (points) => {
  if (points >= 3000) return '#4CAF50';
  if (points >= 1500) return '#FFC107';
  return '#F44336';
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

// Green for the current player, deterministic palette for everyone else.
const getPlayerColor = (playerId, isMyId) => {
  if (isMyId) return '#4CAF50';
  const colors = ['#F44336', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4'];
  const hash = playerId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return colors[Math.abs(hash) % colors.length];
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function ResultsMap({
  rounds,
  activeRound = null,
  myId = null,
  // Highlighted player from the Final Scores list. When set, only that player's
  // guesses render (the current player's always do, separately), so the two can
  // be compared; selecting yourself matches no opponent, hiding them all. Unset
  // (web / no selection) → no filtering, original behavior.
  selectedPlayer = null,
  isDuel = false,
  // Team games: map of playerId -> 'a' | 'b'. Teammates render with the blue
  // (your) pin, enemies green, and each team's closest guesser per round gets
  // the enlarged pin AND is the only one whose guess→dest line draws (best-
  // guess modes only — don't pass teams for average-scoring parties). null →
  // solo/1v1 behavior unchanged.
  teams = null,
  isCountryGuesser = false,
  lang = 'en',
  mapType = 'm',
  onUserInteraction,
  onOpenMaps,
}) {
  const { t: text } = useTranslation();

  const [leafletReady, setLeafletReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const mapRef = useRef(null);
  const destIconRef = useRef(null);
  const srcIconRef = useRef(null);
  const src2IconRef = useRef(null);
  const srcBigIconRef = useRef(null);
  const src2BigIconRef = useRef(null);

  const finalHistory = useMemo(() => (Array.isArray(rounds) ? rounds : []), [rounds]);

  // Team context (see `teams` prop). Same semantics as roundOverScreen.
  const myTeam = teams && myId != null ? teams[myId] : null;
  const isMyTeammate = (playerId) => myTeam != null && teams?.[playerId] === myTeam;
  // Points-first, exact point ties broken by raw distance — only ONE pin per
  // team enlarges + draws its line (mirrors roundOverScreen's
  // bestTeamGuesserIds and the Map.js live reveal).
  const bestTeamGuesserIds = (round) => {
    if (!teams) return null;
    const entries = [];
    const consider = (id, pts, lat, lng) => {
      const team = teams[id];
      if (!team) return;
      entries.push({
        id, team, pts,
        dist: (round.lat != null && lat != null)
          ? findDistance(round.lat, round.long, lat, lng)
          : Infinity,
      });
    };
    Object.entries(round.players || {}).forEach(([id, p]) => consider(id, p?.points || 0, p?.lat, p?.long));
    if (myId != null) consider(myId, round.points || 0, round.guessLat, round.guessLong);
    return pickBestTeamGuessIds(entries);
  };

  // Initialize Leaflet icons from shared cache (icons created once globally).
  // Lifted from roundOverScreen.js.
  useEffect(() => {
    const checkLeaflet = () => {
      const icons = getPinIcons();
      if (icons) {
        destIconRef.current = icons.dest;
        srcIconRef.current = icons.src;
        src2IconRef.current = icons.src2;
        srcBigIconRef.current = icons.srcBig;
        src2BigIconRef.current = icons.src2Big;
        setLeafletReady(true);
      } else {
        setTimeout(checkLeaflet, 100);
      }
    };

    checkLeaflet();
  }, []);

  // Open external maps via the host (mobile hands it to the OS); fall back to
  // window.open when no onOpenMaps is provided (plain web / iframe use).
  const openMaps = (lat, lng, panoId = null) => {
    if (typeof onOpenMaps === 'function') {
      onOpenMaps({ lat, lng, panoId });
      return;
    }
    const url = panoId
      ? `http://maps.google.com/maps?q=&layer=c&panoid=${panoId}&cbp=11,0,0,0,0`
      : `http://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0`;
    if (typeof window !== 'undefined') window.open(url, '_blank');
  };

  const handleUserInteraction = () => {
    setUserHasInteracted(true);
    if (typeof onUserInteraction === 'function') onUserInteraction();
  };

  // Fit the map to every round location + every guess. Lifted from roundOverScreen.js.
  const fitMapToBounds = () => {
    if (!mapRef.current || !finalHistory.length || !window.L) {
      return;
    }

    const map = mapRef.current;
    const bounds = window.L.latLngBounds();

    finalHistory.forEach(round => {
      bounds.extend([round.lat, round.long]);
      if (round.guessLat && round.guessLong) {
        bounds.extend([round.guessLat, round.guessLong]);
      }
      // Add other players' guesses if available
      if (round.players) {
        Object.values(round.players).forEach(player => {
          if (player.lat && player.long) {
            bounds.extend([player.lat, player.long]);
          }
        });
      }
    });

    try {
      if (bounds.isValid()) {
        // Fit bounds once initially, then allow free user interaction
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    } catch (error) {
      console.error('Error fitting map to bounds:', error);
    }
  };

  // Fly to a single round (guess + actual + opponents). Lifted from roundOverScreen.js.
  const focusOnRound = (roundIndex) => {
    if (!mapRef.current || !finalHistory[roundIndex] || !window.L) {
      return;
    }

    const round = finalHistory[roundIndex];
    const map = mapRef.current;

    if (round.guessLat && round.guessLong) {
      const distance = calculateDistance(round.lat, round.long, round.guessLat, round.guessLong);
      const optimalZoom = getOptimalZoom(distance);

      const bounds = window.L.latLngBounds([
        [round.lat, round.long],
        [round.guessLat, round.guessLong]
      ]);

      // Add other players' guesses to bounds if available
      if (round.players) {
        Object.values(round.players).forEach(player => {
          if (player.lat && player.long) {
            bounds.extend([player.lat, player.long]);
          }
        });
      }

      // Use flyToBounds but don't lock the extent - user can freely pan/zoom after
      map.flyToBounds(bounds, {
        padding: [50, 50],
        maxZoom: optimalZoom,
        duration: 1.5,
        easeLinearity: 0.25
      });
    } else {
      // Just center on the target location without locking
      map.flyTo([round.lat, round.long], 10, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  };

  // Camera control: focus the active round, or fit all when none. Fit on first
  // ready too. Stops auto-fitting once the user pans (same as roundOverScreen,
  // but only for the fit-all case so explicit round taps always animate).
  useEffect(() => {
    if (!mapReady || !leafletReady || !finalHistory.length) return;
    if (typeof activeRound === 'number') {
      const id = setTimeout(() => focusOnRound(activeRound), 50);
      return () => clearTimeout(id);
    }
    if (!userHasInteracted) {
      const id = setTimeout(() => fitMapToBounds(), 200);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, leafletReady, activeRound, userHasInteracted]);

  // Compute the map's initial bounds up front so MapContainer mounts already
  // fitted — no [0,0]/zoom-2 world-map flash. Lifted from roundOverScreen.js.
  const initialBounds = useMemo(() => {
    if (typeof window === 'undefined' || !window.L || !finalHistory?.length) {
      return null;
    }
    const b = window.L.latLngBounds();
    finalHistory.forEach((round) => {
      if (round.lat != null && round.long != null) b.extend([round.lat, round.long]);
      if (round.guessLat != null && round.guessLong != null) b.extend([round.guessLat, round.guessLong]);
      if (round.players) {
        Object.values(round.players).forEach((p) => {
          if (p.lat != null && p.long != null) b.extend([p.lat, p.long]);
        });
      }
    });
    return b.isValid() ? b : null;
  }, [finalHistory, leafletReady]);

  // Don't render until Leaflet + icons are ready (mirrors roundOverScreen.js).
  if (!leafletReady || !destIconRef.current || !srcIconRef.current || !src2IconRef.current) {
    return null;
  }

  return (
    <MapContainer
      {...(initialBounds
        ? { bounds: initialBounds, boundsOptions: { padding: [20, 20] } }
        : { center: [0, 0], zoom: 2 })}
      minZoom={1}
      maxZoom={18}
      worldCopyJump={false}
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      <MapEvents
        mapRef={mapRef}
        onMapReady={setMapReady}
        onUserInteraction={handleUserInteraction}
      />

      <TileLayer
        url={`https://mt{s}.google.com/vt/lyrs=${mapType || 'm'}&x={x}&y={y}&z={z}&hl=${lang}&scale=2`}
        subdomains={['0', '1', '2', '3']}
        maxZoom={22}
      />

      {finalHistory.map((round, index) => {
        // Show every round's destination by default; once a round is highlighted,
        // collapse to only that round so the map isn't a tangle of pins and lines.
        const shouldShowDestination = activeRound === null || activeRound === index;
        // Team games: each team's closest guesser gets the enlarged pin.
        const bestIds = bestTeamGuesserIds(round);

        return (
          <React.Fragment key={index}>
            {/* Target location */}
            {shouldShowDestination && (
              <Marker
                position={[round.lat, round.long]}
                icon={destIconRef.current}
              >
                <Popup>
                  <div>
                    <strong>{text("roundNo", { r: index + 1 })}</strong><br />
                    {text("actualLocation")}
                    <div style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => openMaps(round.lat, round.long, round.panoId)}
                        style={{
                          background: '#4285f4',
                          color: 'white',
                          border: 'none',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        🗺️ {text("openInMaps")}
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Current player's guess */}
            {round.guessLat && round.guessLong && (() => {
              const shouldShowPlayerGuess = activeRound === null || activeRound === index;

              if (!shouldShowPlayerGuess) {
                return null;
              }

              return (
                <>
                  <Marker
                    position={[round.guessLat, round.guessLong]}
                    icon={bestIds?.has(myId) ? srcBigIconRef.current : srcIconRef.current}
                  >
                    <Popup>
                      <div>
                        <strong>{text("yourGuess")}</strong><br />
                        {text("roundNo", { r: index + 1 })}<br />
                        {round.points} {text("points")}
                      </div>
                    </Popup>
                  </Marker>

                  {/* Team games: only the counted (best) guess draws a line
                      — mirrors roundOverScreen. bestIds null → all lines. */}
                  {(!bestIds || bestIds.has(myId)) && (
                    <Polyline
                      positions={[[round.lat, round.long], [round.guessLat, round.guessLong]]}
                      color={getPointsColor(round.points)}
                      weight={3}
                      opacity={0.7}
                    />
                  )}
                </>
              );
            })()}

            {/* Other players' guesses */}
            {round.players && Object.entries(round.players).map(([playerId, player]) => {
              if (player.lat && player.long && playerId !== myId) {
                const shouldShowOpponent =
                  (activeRound === null || activeRound === index) &&
                  (!selectedPlayer || selectedPlayer === playerId);

                if (!shouldShowOpponent) {
                  return null;
                }

                return (
                  <React.Fragment key={`${index}-${playerId}`}>
                    {/* Teammates blue (your pin), enemies green; each team's
                        closest guesser enlarged. */}
                    <Marker
                      position={[player.lat, player.long]}
                      icon={isMyTeammate(playerId)
                        ? (bestIds?.has(playerId) ? srcBigIconRef.current : srcIconRef.current)
                        : (bestIds?.has(playerId) ? src2BigIconRef.current : src2IconRef.current)}
                    >
                      <Popup>
                        <div>
                          <strong
                            style={{
                              cursor: 'default',
                              textDecoration: 'none',
                              color: 'inherit'
                            }}
                          >
                            {player.username || text("opponent")}
                          </strong><br />
                          {text("roundNo", { r: index + 1 })}<br />
                          {player.points} {text("points")}
                        </div>
                      </Popup>
                    </Marker>

                    {(!bestIds || bestIds.has(playerId)) && (
                      <Polyline
                        positions={[[round.lat, round.long], [player.lat, player.long]]}
                        color={getPointsColor(player.points)}
                        weight={2}
                        opacity={0.5}
                      />
                    )}
                  </React.Fragment>
                );
              }
              return null;
            })}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}
