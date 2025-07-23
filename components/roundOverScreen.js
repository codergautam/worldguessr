import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { useTranslation } from '@/components/useTranslations';
import { FaTrophy, FaClock, FaStar } from "react-icons/fa";
import msToTime from "./msToTime";
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
    hidden,
    multiplayerState
}) => {
  const { t: text } = useTranslation("common");
  const [activeRound, setActiveRound] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const mapRef = useRef(null);
  const destIconRef = useRef(null);
  const srcIconRef = useRef(null);

  // Animation states for duel
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [animatedElo, setAnimatedElo] = useState(data?.oldElo || 0);
  const [stars, setStars] = useState([]);

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

  // Animation for points in regular games
  useEffect(() => {
    if (!duel && points) {
      let start = 0;
      const end = points;
      const duration = 1000;
      const stepTime = duration / Math.sqrt(end);

      const interval = setInterval(() => {
        start++;
        const increment = Math.pow(start, 2);
        if (increment < end) {
          setAnimatedPoints(increment);
        } else {
          setAnimatedPoints(end);
          clearInterval(interval);
        }
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [points, duel]);

  // Animation for elo in duels
  useEffect(() => {
    if (duel && data && typeof data.oldElo === "number" && typeof data.newElo === "number") {
      const { oldElo, newElo } = data;
      const duration = 1500;
      const steps = Math.abs(newElo - oldElo);
      const stepTime = steps > 0 ? duration / steps : 0;

      let currentElo = oldElo;
      const interval = setInterval(() => {
        currentElo += currentElo < newElo ? 1 : -1;
        setAnimatedElo(currentElo);
        if (currentElo === newElo) clearInterval(interval);
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [duel, data]);

  // Stars calculation for regular games
  useEffect(() => {
    if (!duel && points && maxPoints) {
      const percentage = (points / maxPoints) * 100;
      let newStars = [];

      const gold = "gold"; // Define gold color for stars
      const platinum = "/platinum_star.png"; // Define platinum star image
      const silver = "#CD7F32"; // Define silver color for stars
      const bronze = "#b6b2b2"; // Define bronze color for stars

      // zero to 30% - bronze star
      if (percentage <= 20) {
        newStars = [bronze];
      } else if (percentage <= 30) {
        newStars = [bronze, bronze];
      } else if (percentage <= 45) {
        newStars = [bronze, bronze, bronze];
      } else if (percentage <= 50) {
        newStars = [silver, silver, bronze];
      } else if (percentage <= 60) {
        newStars = [silver, silver, silver];
      } else if(percentage <= 62) {
        newStars = [gold, silver, silver];
      } else if (percentage <= 65) {
        newStars = [gold, gold, silver];
      } else if (percentage <= 79) {
        newStars = [gold, gold, gold];
      } else if (percentage <= 82) {
        newStars = [platinum, gold, gold];
      } else if (percentage <= 85) {
        newStars = [platinum, platinum, gold];
      } else if (percentage <= 100) {
        newStars = [platinum, platinum, platinum];
      }

      setStars(newStars);

    }
  }, [points, duel, maxPoints]);

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

  // Reusable points display component
  const renderPoints = (points) => (
    <span className="round-points">
      {points} {text("pts")}
    </span>
  );

  // Reusable leaderboard rendering function
  const renderLeaderboard = (showAll = false) => {
    if (!history[0]?.players) return null;
    
    const players = Object.entries(history[0].players)
      .map(([playerId, player]) => ({
        playerId,
        username: player.username,
        totalScore: history.reduce((total, round) => total + (round.players?.[playerId]?.points || 0), 0)
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const displayPlayers = showAll ? players : players.slice(0, 5);
    
    return displayPlayers.map((player, index) => {
      const isCurrentPlayer = player.playerId === multiplayerState?.gameData?.myId;
      return (
        <div 
          key={player.playerId} 
          className={`round-item round-animation ${isCurrentPlayer ? 'active' : ''}`}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="round-header">
            <span className="round-number">
              {index === 0 && <FaTrophy style={{ color: '#FFD700', marginRight: '8px', fontSize: '1.1rem' }} />}
              #{index + 1} {player.username} {isCurrentPlayer && `(${text("you")})`}
            </span>
            {renderPoints(player.totalScore)}
          </div>
        </div>
      );
    });
  };

  const getPointsColor = (points) => {
    if (points >= 3000) return '#4CAF50';
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

  // Helper function to get player colors for map markers
  const getPlayerColor = (playerId, isMyId) => {
    if (isMyId) return '#4CAF50'; // Green for current player
    const colors = ['#F44336', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4'];
    const hash = playerId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  // Helper function to calculate health damage for duels
  const calculateHealthDamage = (points, maxPoints = 5000) => {
    return maxPoints - points;
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

  useEffect(() => {
    if (mapReady && history.length > 0 && leafletReady) {
      console.log('Map ready, setting initial view...');
      setTimeout(() => {
        // Set initial extent only once, then allow free user interaction
        fitMapToBounds();
      }, 200);
    }
  }, [mapReady, leafletReady]); // Removed history dependency to prevent refitting on history changes

  const handleRoundClick = (index) => {
    console.log(`Round ${index + 1} clicked`);
    setActiveRound(index);

    // Check if mobile (screen width <= 1024px)
    const isMobile = window.innerWidth <= 1024;

    if (isMobile) {
      setMobileExpanded(!mobileExpanded);
    } else {
      focusOnRound(index);
    }
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

  // If no history provided, try to construct it from multiplayerState
  let gameHistory = history;
  if ((!history || history.length === 0) && multiplayerState?.gameData) {

    const { locations, players, finalPlayers, myId } = multiplayerState.gameData;

    if (locations && locations.length > 0) {
      gameHistory = locations.map((location, roundIndex) => {
        // Find my guess for this round
        const myPlayer = players?.find(p => p.id === myId);
        const myGuess = myPlayer?.guess;

        // Calculate points for my guess if available
        let myPoints = 0;
        if (myGuess && myGuess.length >= 2) {
          const distance = calculateDistance(location.lat, location.long, myGuess[0], myGuess[1]);
          // Use the same points calculation as the game
          const maxDist = multiplayerState.gameData.maxDist || 20000;
          myPoints = Math.max(0, Math.round(5000 * (1 - (distance / maxDist))));
        }

        // Create players object for this round
        const roundPlayers = {};
        players?.forEach(player => {
          if (player.guess && player.guess.length >= 2) {
            const playerDistance = calculateDistance(location.lat, location.long, player.guess[0], player.guess[1]);
            const maxDist = multiplayerState.gameData.maxDist || 20000;
            const playerPoints = Math.max(0, Math.round(5000 * (1 - (playerDistance / maxDist))));

            roundPlayers[player.id] = {
              username: player.username,
              lat: player.guess[0],
              long: player.guess[1],
              points: playerPoints
            };
          }
        });

        return {
          lat: location.lat,
          long: location.long,
          guessLat: myGuess?.[0],
          guessLong: myGuess?.[1],
          points: myPoints,
          players: roundPlayers,
          timeTaken: null // Not available in this data structure
        };
      });

    }
  }

  if(!gameHistory || gameHistory.length === 0) {
    return null;
  }

  // // If still no valid history data, show fallback
  // if (!gameHistory || gameHistory.length === 0) {
  //   return (
  //     <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>
  //       <div className="game-summary-container">
  //         <div style={{
  //           display: 'flex',
  //           flexDirection: 'column',
  //           justifyContent: 'center',
  //           alignItems: 'center',
  //           height: '100vh',
  //           color: 'white',
  //           fontSize: '1.5rem',
  //           padding: '2rem',
  //           textAlign: 'center'
  //         }}>
  //           <div>{text("gameComplete")}</div>
  //           <div style={{ fontSize: '1rem', marginTop: '1rem', opacity: 0.7 }}>
  //             {duel ? text("duelComplete") : text("gameComplete")}
  //           </div>
  //           {button1Text && (
  //             <button
  //               onClick={button1Press}
  //               style={{
  //                 marginTop: '2rem',
  //                 padding: '1rem 2rem',
  //                 fontSize: '1.2rem',
  //                 backgroundColor: '#4CAF50',
  //                 color: 'white',
  //                 border: 'none',
  //                 borderRadius: '8px',
  //                 cursor: 'pointer'
  //               }}
  //             >
  //               {button1Text}
  //             </button>
  //           )}
  //           {button2Text && (
  //             <button
  //               onClick={button2Press}
  //               style={{
  //                 marginTop: '1rem',
  //                 padding: '1rem 2rem',
  //                 fontSize: '1.2rem',
  //                 backgroundColor: '#666',
  //                 color: 'white',
  //                 border: 'none',
  //                 borderRadius: '8px',
  //                 cursor: 'pointer'
  //               }}
  //             >
  //               {button2Text}
  //             </button>
  //           )}
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  // Use the constructed or provided history
  history = gameHistory;

  // DUEL SCREEN IMPLEMENTATION
  if (duel && data) {
    const { winner, draw, oldElo, newElo } = data;
    const eloChange = newElo - oldElo;

    return (
      <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>
        <div className="game-summary-container">
          <div className="game-summary-map">
            <MapContainer
              center={[0, 0]}
              zoom={2}
              minZoom={1}
              maxZoom={18}
              worldCopyJump={false}
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

              {history.map((round, index) => (
                <React.Fragment key={index}>
                  {/* Target location */}
                  <Marker
                    position={[round.lat, round.long]}
                    icon={destIconRef.current}
                  >
                    <Popup>
                      <div>
                        <strong>{text("round")} {index + 1}</strong><br />
                        {text("actualLocation")}
                      </div>
                    </Popup>
                  </Marker>

                  {/* Current player's guess */}
                  {round.guessLat && round.guessLong && (
                    <>
                      <Marker
                        position={[round.guessLat, round.guessLong]}
                        icon={srcIconRef.current}
                      >
                        <Popup>
                          <div>
                            <strong>{text("yourGuess")}</strong><br />
                            {text("round")} {index + 1}<br />
                            {round.points} {text("points")}
                          </div>
                        </Popup>
                      </Marker>

                      <Polyline
                        positions={[[round.lat, round.long], [round.guessLat, round.guessLong]]}
                        color="#4CAF50"
                        weight={3}
                        opacity={0.7}
                      />
                    </>
                  )}

                  {/* Other players' guesses */}
                  {round.players && Object.entries(round.players).map(([playerId, player]) => {
                    if (player.lat && player.long && playerId !== multiplayerState?.gameData?.myId) {
                      const playerColor = getPlayerColor(playerId, false);
                      return (
                        <React.Fragment key={`${index}-${playerId}`}>
                          <Marker
                            position={[player.lat, player.long]}
                            icon={window.L.divIcon({
                              className: 'custom-marker',
                              html: `<div style="background-color: ${playerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
                              iconSize: [20, 20],
                              iconAnchor: [10, 10]
                            })}
                          >
                            <Popup>
                              <div>
                                <strong>{player.username || text("opponent")}</strong><br />
                                {text("round")} {index + 1}<br />
                                {player.points} {text("points")}
                              </div>
                            </Popup>
                          </Marker>

                          <Polyline
                            positions={[[round.lat, round.long], [player.lat, player.long]]}
                            color={playerColor}
                            weight={2}
                            opacity={0.5}
                          />
                        </React.Fragment>
                      );
                    }
                    return null;
                  })}
                </React.Fragment>
              ))}
            </MapContainer>
          </div>

          <div className={`game-summary-sidebar ${mobileExpanded ? 'mobile-expanded' : ''}`}>
            <div className="summary-header duel-header">
              <h1 className="summary-title">
                {draw ? text("draw") : winner ? text("victory") : text("defeat")}
              </h1>

              {typeof data.oldElo === "number" && typeof data.newElo === "number" && (
                <div className="elo-container">
                  <span className="elo-title">{text("elo")}:</span>
                  <div className="elo-display">
                    <span className="elo-value">{animatedElo}</span>
                    <span
                      className="elo-change"
                      style={{ color: eloChange >= 0 ? "green" : "red" }}
                    >
                      {eloChange > 0 ? `+${eloChange}` : eloChange}
                    </span>
                  </div>
                </div>
              )}

              {data.timeElapsed > 0 && (
                <div className="time-elapsed">
                  <FaClock /> {text("time")}: {msToTime(data.timeElapsed)}
                </div>
              )}

              <div className="summary-actions">
                <button
                  className="action-btn mobile-expand-btn"
                  onClick={() => setMobileExpanded(!mobileExpanded)}
                >
                  {mobileExpanded ? text("hideDetails") : text("viewDetails")}
                </button>

                {button1Text && (
                  <button className="action-btn primary" onClick={button1Press}>
                    {button1Text}
                  </button>
                )}
                {button2Text && (
                  <button className="action-btn secondary" onClick={button2Press}>
                    {button2Text}
                  </button>
                )}
              </div>
            </div>

            <div className={`rounds-container duel-rounds ${!mobileExpanded ? 'mobile-hidden' : ''}`}>
              {/* For ranked duels with 2 players */}
              {multiplayerState?.gameData?.duel && history.length > 0 && (
                <>
                  <h3>{text("roundDetails")}</h3>
                  {history.map((round, index) => {
                    const myId = multiplayerState?.gameData?.myId;
                    const myData = round.players?.[myId];
                    const opponentData = Object.entries(round.players || {}).find(([id]) => id !== myId)?.[1];
                    const myPoints = myData?.points || 0;
                    const opponentPoints = opponentData?.points || 0;
                    const myHealthDamage = calculateHealthDamage(myPoints);
                    const opponentHealthDamage = calculateHealthDamage(opponentPoints);

                    return (
                      <div
                        key={index}
                        className={`duel-round-item ${activeRound === index ? 'active' : ''}`}
                        onClick={() => handleRoundClick(index)}
                      >
                        <div className="round-header">
                          <span className="round-number">{text("round")} {index + 1}</span>
                        </div>

                        <div className="duel-round-details">
                          <div className="player-score">
                            <span className="player-name">{text("you")}</span>
                            <span className="score-points" style={{ color: getPointsColor(myPoints) }}>
                              {myPoints} {text("pts")}
                            </span>
                            <span className="health-damage">
                              -{myHealthDamage} ❤️
                            </span>
                          </div>

                          <div className="vs-divider">VS</div>

                          <div className="player-score">
                            <span className="player-name">{opponentData?.username || text("opponent")}</span>
                            <span className="score-points" style={{ color: getPointsColor(opponentPoints) }}>
                              {opponentPoints} {text("pts")}
                            </span>
                            <span className="health-damage">
                              -{opponentHealthDamage} ❤️
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* For private games and unranked multiplayer (including 10 player games) */}
              {(!multiplayerState?.gameData?.duel || Object.keys(history[0]?.players || {}).length > 2) && (
                <>
                  <h3>{text("finalScores")}</h3>
                  {renderLeaderboard(true)}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // REGULAR GAME SCREEN IMPLEMENTATION

  return (
    <div className="game-summary-container">
      <div className="game-summary-map">
        <MapContainer
          center={[0, 0]}
          zoom={2}
          minZoom={1}
          maxZoom={18}
          worldCopyJump={false}
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

                {/* Other players' guesses */}
                {round.players && Object.entries(round.players).map(([playerId, player]) => {
                  if (player.lat && player.long && playerId !== multiplayerState?.gameData?.myId) {
                    const playerColor = getPlayerColor(playerId, false);
                    return (
                      <React.Fragment key={`${index}-${playerId}`}>
                        <Marker
                          position={[player.lat, player.long]}
                          icon={window.L.divIcon({
                            className: 'custom-marker',
                            html: `<div style="background-color: ${playerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                          })}
                        >
                          <Popup>
                            <div>
                              <strong>{player.username || text("opponent")}</strong><br />
                              {text("round")} {index + 1}<br />
                              {player.points} {text("points")}
                            </div>
                          </Popup>
                        </Marker>

                        <Polyline
                          positions={[[round.lat, round.long], [player.lat, player.long]]}
                          color={playerColor}
                          weight={2}
                          opacity={0.5}
                        />
                      </React.Fragment>
                    );
                  }
                  return null;
                })}
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

        <div className={`game-summary-sidebar ${mobileExpanded ? 'mobile-expanded' : ''}`}>
          <div className="summary-header">
            <h1 className="summary-title">{text("gameComplete")}</h1>

            <div className="star-container">
              {stars.map((star, index) => (
                <div
                  key={index}
                  className="star"
                  style={{ animationDelay: `${index * 0.5}s` }}
                >
                  {typeof star === "string" && star.endsWith(".png") ? (
                    <img
                      src={star}
                      alt={`Star ${index}`}
                      style={{
                        width: "32px",
                        height: "32px",
                      }}
                    />
                  ) : (
                    <FaStar className="star" style={{ color: star }} />
                  )}
                </div>
              ))}
            </div>

            <div className="summary-score">{animatedPoints?.toFixed(0) || points}</div>
            <div className="summary-total">
              {text("outOf")} {maxPoints} {text("points")}
            </div>

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
          {/* Show leaderboard for multiplayer games */}
          {multiplayerState?.gameData && history[0]?.players && Object.keys(history[0].players).length > 1 && (
            <>
              <h3 style={{ padding: '12px 20px', color: 'white', marginBottom: '0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>{text("finalScores")}</h3>
              {renderLeaderboard(false)}
            </>
          )}

          {/* Show individual rounds only if not a multiplayer game with leaderboard */}
          {!(multiplayerState?.gameData && history[0]?.players && Object.keys(history[0].players).length > 1) && 
            history.map((round, index) => {
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
                  {renderPoints(round.points)}
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

                  {round.timeTaken && (
                    <div className="detail-row">
                      <span className="detail-label">
                        <span className="detail-icon">⏱️</span>
                        {text("timeTaken")}
                      </span>
                      <span className="time-value">{round.timeTaken}s</span>
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