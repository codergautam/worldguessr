import React, { useEffect, useState, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { useTranslation } from '@/components/useTranslations';
import { FaTrophy, FaClock, FaStar, FaRuler, FaMapMarkerAlt, FaExternalLinkAlt, FaFlag } from "react-icons/fa";
import msToTime from "./msToTime";
import formatTime from "../utils/formatTime";
import { toast } from "react-toastify";
import 'leaflet/dist/leaflet.css';
import ReportModal from './reportModal';
import UsernameWithFlag from './utils/usernameWithFlag';
import CountryFlag from './utils/countryFlag';

const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);

// Component to handle map events and store map reference
const MapEvents = ({ mapRef, onMapReady, history, onUserInteraction }) => {
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
    multiplayerState,
    session,
    gameId,
    options
}) => {
  const { t: text } = useTranslation("common");
  const [activeRound, setActiveRound] = useState(null); // null = no round selected
  const [mapReady, setMapReady] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false); // Track if user has manually moved the map
  const [copiedGameId, setCopiedGameId] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const mapRef = useRef(null);
  const destIconRef = useRef(null);
  const srcIconRef = useRef(null);
  const src2IconRef = useRef(null); // Green icon for opponent markers
  const roundsContainerRef = useRef(null);

  // Animation states for duel
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [pointsAnimating, setPointsAnimating] = useState(false);
  const [animatedElo, setAnimatedElo] = useState(data?.oldElo || 0);
  const [stars, setStars] = useState([]);
  const [eloAnimationComplete, setEloAnimationComplete] = useState(false);

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

        src2IconRef.current = window.L.icon({
          iconUrl: './src2.png',
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

  // Enhanced smooth animation for points in regular games
  useEffect(() => {
    if (!duel && points) {
      const startValue = animatedPoints || 0;
      const endValue = points;
      const duration = 1200; // Slightly longer for more dramatic effect
      const startTime = Date.now();

      // Start the CSS animation
      setPointsAnimating(true);

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic: starts fast, slows down at end (no overshoot)
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentValue = startValue + (endValue - startValue) * easedProgress;
        setAnimatedPoints(Math.round(currentValue));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setAnimatedPoints(endValue);
          // End the CSS animation after a brief delay for the glow to fade
          setTimeout(() => setPointsAnimating(false), 300);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [points, duel]);

  // Animation for elo in duels
  useEffect(() => {
    if (duel && data && typeof data.oldElo === "number" && typeof data.newElo === "number" && !eloAnimationComplete) {
      const { oldElo, newElo } = data;
      const duration = 1500;
      const steps = Math.abs(newElo - oldElo);
      const stepTime = steps > 0 ? duration / steps : 0;

      let currentElo = oldElo;
      const interval = setInterval(() => {
        currentElo += currentElo < newElo ? 1 : -1;
        setAnimatedElo(currentElo);
        if (currentElo === newElo) {
          clearInterval(interval);
          setEloAnimationComplete(true); // Mark animation as complete
        }
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [duel, data?.oldElo, data?.newElo, eloAnimationComplete]); // Use specific properties instead of entire data object

  // Handle scroll to make header compact
  useEffect(() => {
    const handleScroll = () => {
      if (roundsContainerRef.current) {
        const scrollTop = roundsContainerRef.current.scrollTop;
        const shouldBeCompact = scrollTop > 20; // Threshold for compacting

        if (shouldBeCompact !== headerCompact) {
          setHeaderCompact(shouldBeCompact);
        }
      }
    };

    const roundsContainer = roundsContainerRef.current;
    if (roundsContainer) {
      roundsContainer.addEventListener('scroll', handleScroll);
      return () => roundsContainer.removeEventListener('scroll', handleScroll);
    }
  }, [headerCompact]);

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
    const isImperial = options?.units === "imperial";

    if (isImperial) {
      const miles = distance * 0.621371;
      if (miles < 0.1) {
        return `${Math.round(distance * 1000 * 3.28084)}ft`;
      } else if (miles < 10) {
        return `${miles.toFixed(1)}mi`;
      } else {
        return `${Math.round(miles)}mi`;
      }
    } else {
      if (distance < 1) {
        return `${Math.round(distance * 1000)}m`;
      } else if (distance < 10) {
        return `${distance.toFixed(1)}km`;
      } else {
        return `${Math.round(distance)}km`;
      }
    }
  };

  // Reusable points display component
  const renderPoints = (points) => (
    <span className="round-points" style={{ color: "white" }}>
      {points} {text("pts")}
    </span>
  );

  // Handle player selection
  const handlePlayerSelect = (playerId) => {
    if (selectedPlayer === playerId) {
      setSelectedPlayer(null); // Deselect if already selected
    } else {
      setSelectedPlayer(playerId);
    }
  };

  // Render player round distribution
  const renderPlayerRounds = (playerId) => {
    if (!playerId || !finalHistory[0]?.players?.[playerId]) return null;

    return (
      <div style={{marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px'}}>
        {finalHistory.map((round, index) => {
          const playerRound = round.players?.[playerId];
          if (!playerRound) return null;

          const distance = playerRound.lat && playerRound.long
            ? calculateDistance(round.lat, round.long, playerRound.lat, playerRound.long)
            : null;

          return (
            <div key={index} style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              marginBottom: '4px',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ color: 'white', fontSize: '0.9rem' }}>
                {text("roundNo", {r: index + 1})}
              </span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {distance && (
                  <span style={{ color: '#aaa', fontSize: '0.8rem' }}>
                    {formatDistance(distance)}
                  </span>
                )}
                <span style={{ color: 'white', fontWeight: 'bold' }}>
                  {playerRound.points || 0} {text("pts")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Get current user's rank
  const getCurrentUserRank = () => {
    if (!finalHistory.length || !multiplayerState?.gameData?.myId) return null;

    // Collect all unique players from all rounds
    const allPlayers = new Map();
    finalHistory.forEach(round => {
      if (round.players) {
        Object.entries(round.players).forEach(([playerId, player]) => {
          if (!allPlayers.has(playerId)) {
            allPlayers.set(playerId, { username: player.username, countryCode: player.countryCode });
          }
        });
      }
    });

    const players = Array.from(allPlayers.entries())
      .map(([playerId, playerData]) => ({
        playerId,
        username: playerData.username,
        countryCode: playerData.countryCode,
        totalScore: finalHistory.reduce((total, round) => total + (round.players?.[playerId]?.points || 0), 0)
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const currentUserIndex = players.findIndex(player => player.playerId === multiplayerState?.gameData?.myId);
    return currentUserIndex !== -1 ? { rank: currentUserIndex + 1, total: players.length } : null;
  };

  // Reusable leaderboard rendering function
  const renderLeaderboard = (showAll = false) => {
    if (!finalHistory.length) return null;

    // Collect all unique players from all rounds
    const allPlayers = new Map();
    finalHistory.forEach(round => {
      if (round.players) {
        Object.entries(round.players).forEach(([playerId, player]) => {
          if (!allPlayers.has(playerId)) {
            allPlayers.set(playerId, { username: player.username, countryCode: player.countryCode });
          }
        });
      }
    });

    const players = Array.from(allPlayers.entries())
      .map(([playerId, playerData]) => ({
        playerId,
        username: playerData.username,
        countryCode: playerData.countryCode,
        totalScore: finalHistory.reduce((total, round) => total + (round.players?.[playerId]?.points || 0), 0)
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const displayPlayers = showAll ? players : players.slice(0, 5);

    return displayPlayers.map((player, index) => {
      const isCurrentPlayer = player.playerId === multiplayerState?.gameData?.myId;
      const isSelected = selectedPlayer === player.playerId;
      const isReportedUser = options?.reportedUserId && player.playerId === options.reportedUserId;

      return (
        <React.Fragment key={player.playerId}>
          <div
            className={`round-item round-animation ${isSelected ? 'active' : ''}`}
            style={{
              animationDelay: `${index * 0.1}s`,
              cursor: 'pointer',
              ...(isReportedUser && { borderLeft: '3px solid #f44336' })
            }}
            onClick={() => handlePlayerSelect(player.playerId)}
          >
            <div className="round-header">
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '8px'
                }}>
                  {index === 0 && <FaTrophy style={{ color: '#FFD700', fontSize: '1.2rem', filter: 'drop-shadow(0 2px 4px rgba(255, 215, 0, 0.3))' }} />}
                  {index === 1 && <FaTrophy style={{ color: '#C0C0C0', fontSize: '1.1rem', filter: 'drop-shadow(0 2px 4px rgba(192, 192, 192, 0.3))' }} />}
                  {index === 2 && <FaTrophy style={{ color: '#CD7F32', fontSize: '1rem', filter: 'drop-shadow(0 2px 4px rgba(205, 127, 50, 0.3))' }} />}
                </div>
                <span className="round-number" style={isReportedUser ? { color: '#f44336', fontWeight: 'bold' } : {}}>
                  #{index + 1}{' '}
                  <UsernameWithFlag
                    username={player.username}
                    countryCode={player.countryCode}
                    isGuest={process.env.NEXT_PUBLIC_COOLMATH}
                  />
                  {isCurrentPlayer && !options?.isModView && <span style={{ color: '#888', fontStyle: 'italic', marginLeft: '4px' }}>({text("you")})</span>}
                  {isReportedUser && <span style={{ color: '#f44336', fontStyle: 'italic', marginLeft: '4px' }}>(reported)</span>}
                </span>
              </div>
              {renderPoints(player.totalScore)}
            </div>
          </div>
          {isSelected && renderPlayerRounds(player.playerId)}
        </React.Fragment>
      );
    });
  };

  const getPointsColor = (points) => {
    if (points >= 3000) return '#4CAF50';
    if (points >= 1500) return '#FFC107';
    return '#F44336';
  };

  const openInGoogleMaps = (lat, lng, panoId = null) => {
    let url;
    if (panoId) {
      url = `http://maps.google.com/maps?q=&layer=c&panoid=${panoId}&cbp=11,0,0,0,0`;
    } else {
      url = `http://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0`;
    }

    // Check if we're on CrazyGames or CoolMathGames platforms
    const isCrazyGames = typeof window !== 'undefined' && window.inCrazyGames;
    const isCoolMathGames = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COOLMATH === "true";

    if (isCrazyGames || isCoolMathGames) {
      // Copy URL to clipboard instead of opening
      navigator.clipboard.writeText(url).then(() => {
        toast.success(text("copiedToClipboard"));
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(text("copiedToClipboard"));
      });
    } else {
      window.open(url, '_blank');
    }
  };

  const copyGameId = () => {
    if (gameId) {
      navigator.clipboard.writeText(gameId).then(() => {
        setCopiedGameId(true);
        setTimeout(() => setCopiedGameId(false), 2000);
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = gameId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopiedGameId(true);
        setTimeout(() => setCopiedGameId(false), 2000);
      });
    }
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

  useEffect(() => {
    if (mapReady && finalHistory.length > 0 && leafletReady && !userHasInteracted) {
      setTimeout(() => {
        // Set initial extent only once, then allow free user interaction
        fitMapToBounds();
      }, 200);
    }
  }, [mapReady, leafletReady, userHasInteracted]); // Only fit bounds if user hasn't interacted

  const handleRoundClick = (index) => {
    setActiveRound(index);

    // Check if mobile (screen width <= 1024px)
    const isMobile = window.innerWidth <= 1024;

    if (isMobile) {
      setMobileExpanded(!mobileExpanded);
    } else {
      focusOnRound(index);
    }
  };

  // Memoize the transformation to prevent infinite re-renders
  const gameHistory = useMemo(() => {
    // If history is already provided and not empty, use it
    if (history && history.length > 0) {
      return history;
    }

    // If no history provided, try to construct it from multiplayerState
    if (multiplayerState?.gameData?.roundHistory) {
      const { roundHistory, myId, duel, public: isPublic } = multiplayerState.gameData;

      // Skip transformation for ranked duels to prevent showing extra rounds
      // when game ends early due to health loss
      const isRankedDuel = duel && !isPublic;
      if (isRankedDuel) {
        return [];
      }

      if (roundHistory && roundHistory.length > 0) {
        const transformed = roundHistory.map((roundData, roundIndex) => {
          const location = roundData.location;
          const myPlayerData = roundData.players[myId];

          return {
            lat: location.lat,
            long: location.long,
            guessLat: myPlayerData?.lat,
            guessLong: myPlayerData?.long,
            points: myPlayerData?.points || 0,
            players: roundData.players,
            timeTaken: null
          };
        });
        return transformed;
      }
    }

    return [];
  }, [history, multiplayerState?.gameData?.roundHistory, multiplayerState?.gameData?.myId, multiplayerState?.gameData?.duel, multiplayerState?.gameData?.public]);

  // Don't render until Leaflet is ready
  if (!leafletReady || !destIconRef.current || !srcIconRef.current || !src2IconRef.current) {
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
        </div>
      </div>
    );
  }

  if(!gameHistory || gameHistory.length === 0) {
    return (
      <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>
        <div className="game-summary-container">
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            color: 'white',
            fontSize: '1.5rem',
            padding: '2rem',
            textAlign: 'center'
          }}>
            {/* <div>No game history available</div>
            <div style={{ fontSize: '1rem', marginTop: '1rem', opacity: 0.7 }}>
              Debug: history={JSON.stringify(history)}, roundHistory length={multiplayerState?.gameData?.roundHistory?.length}
            </div> */}
          </div>
        </div>
      </div>
    );
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
  const finalHistory = gameHistory;

  // Helper function to open report modal
  const handleReportUser = (accountId, username) => {
    setReportTarget({ accountId, username });
    setReportModalOpen(true);
  };

  // DUEL SCREEN IMPLEMENTATION
  if (duel && data) {
    const { winner, draw, oldElo, newElo } = data;
    const eloChange = newElo - oldElo;

    // Get opponent information for ranked duels
    const getOpponentInfo = () => {
      const myId = multiplayerState?.gameData?.myId;

      // Try to get from roundHistory first (for ranked duels)
      if (multiplayerState?.gameData?.roundHistory?.length > 0) {
        const firstRound = multiplayerState.gameData.roundHistory[0];
        if (firstRound?.players) {
          const opponentEntries = Object.entries(firstRound.players).filter(([id]) => id !== myId);
          if (opponentEntries.length > 0) {
            const [opponentId, opponentData] = opponentEntries[0];
            return {
              accountId: opponentId,
              username: opponentData.username
            };
          }
        }
      }

      // Fallback to finalHistory
      if (finalHistory.length > 0) {
        const firstRound = finalHistory[0];
        if (firstRound?.players) {
          const opponentEntries = Object.entries(firstRound.players).filter(([id]) => id !== myId);
          if (opponentEntries.length > 0) {
            const [opponentId, opponentData] = opponentEntries[0];
            return {
              accountId: opponentId,
              username: opponentData.username
            };
          }
        }
      }

      return null;
    };

    const opponentInfo = getOpponentInfo();

    return (
      <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>
        {/* Report Modal */}
        {reportTarget && (
          <ReportModal
            isOpen={reportModalOpen}
            onClose={() => {
              setReportModalOpen(false);
              setReportTarget(null);
            }}
            reportedUser={reportTarget}
            gameId={gameId}
            gameType={multiplayerState?.gameData?.public ? 'unranked_multiplayer' : 'ranked_duel'}
            session={session}
          />
        )}

        <div className="game-summary-container">
          <div className="game-summary-map">
            <MapContainer
              center={[0, 0]}
              zoom={2}
              minZoom={1}
              maxZoom={18}
              worldCopyJump={false}
              zoomControl={typeof window !== 'undefined' && window.innerWidth > 1024}
              style={{ height: "100%", width: "100%" }}
            >
              <MapEvents
                mapRef={mapRef}
                onMapReady={setMapReady}
                history={finalHistory}
                onUserInteraction={() => setUserHasInteracted(true)}
              />

              <TileLayer
                url={`https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=${text("lang")}`}
              />

              {finalHistory.map((round, index) => {
                // For duels: show all destination pins when no round selected, or only selected round's destination when a round is selected
                // For other multiplayer: show all destination pins
                const isDuel = multiplayerState?.gameData?.duel;
                const shouldShowDestination = !isDuel || activeRound === null || activeRound === index;

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
                                onClick={() => openInGoogleMaps(round.lat, round.long, round.panoId)}
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
                    // For duels: show all player guesses when no round selected, or only selected round when a round is selected
                    // For other multiplayer: show all player's guesses
                    const isDuel = multiplayerState?.gameData?.duel;
                    const shouldShowPlayerGuess = !isDuel || activeRound === null || activeRound === index;

                    if (!shouldShowPlayerGuess) {
                      return null;
                    }

                    return (
                      <>
                        <Marker
                          position={[round.guessLat, round.guessLong]}
                          icon={srcIconRef.current}
                        >
                          <Popup>
                            <div>
                              <strong>{options?.isModView ? (round.players?.[multiplayerState?.gameData?.myId]?.username || text("player")) : text("yourGuess")}</strong><br />
                              {text("roundNo", { r: index + 1 })}<br />
                              {round.points} {text("points")}
                            </div>
                          </Popup>
                        </Marker>

                        <Polyline
                          positions={[[round.lat, round.long], [round.guessLat, round.guessLong]]}
                          color={getPointsColor(round.points)}
                          weight={3}
                          opacity={0.7}
                        />
                      </>
                    );
                  })()}

                  {/* Other players' guesses */}
                  {round.players && Object.entries(round.players).map(([playerId, player]) => {
                    if (player.lat && player.long && playerId !== multiplayerState?.gameData?.myId) {
                      // For duels: show all opponent guesses when no round selected, or only selected round when a round is selected
                      // For other multiplayer: show all opponent guesses
                      const isDuel = multiplayerState?.gameData?.duel;
                      const shouldShowOpponent = !isDuel || activeRound === null || activeRound === index;

                      if (!shouldShowOpponent) {
                        return null;
                      }

                      const playerColor = getPlayerColor(playerId, false);
                      const isPlayerReported = options?.reportedUserId && playerId === options.reportedUserId;
                      return (
                        <React.Fragment key={`${index}-${playerId}`}>
                          <Marker
                            position={[player.lat, player.long]}
                            icon={src2IconRef.current}
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
                                  {player.username || text("opponent")}{isPlayerReported && ' (reported)'}
                                </strong><br />
                                {text("roundNo", { r: index + 1 })}<br />
                                {player.points} {text("points")}
                              </div>
                            </Popup>
                          </Marker>

                          <Polyline
                            positions={[[round.lat, round.long], [player.lat, player.long]]}
                            color={getPointsColor(player.points)}
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
            <div className={`summary-header duel-header ${headerCompact && typeof window !== 'undefined' && window.innerWidth > 1024 ? 'compact' : ''}`}>
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

              {/* {gameId && (
                <div className="game-id-container" style={{
                  margin: '12px 0',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.9rem'
                }}>
                  <span style={{ color: 'white', marginRight: '8px' }}>ID: {gameId}</span>
                  <button
                    onClick={copyGameId}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      transition: 'all 0.2s'
                    }}
                    title="Copy Game ID"
                  >
                    {copiedGameId ? '✓' : '📋'}
                  </button>
                </div>
              )} */}

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

                {/* Report button for ranked duels - only show if logged in, in a ranked game, opponent exists, and not in mod view */}
                {!options?.isModView && (multiplayerState?.gameData?.public === false || (multiplayerState?.gameData?.duel && multiplayerState?.gameData?.public !== true)) && opponentInfo && session?.token?.secret && (
                  <button
                    className="action-btn report-btn"
                    onClick={() => handleReportUser(opponentInfo.accountId, opponentInfo.username)}
                    style={{
                      background: 'rgba(255, 69, 58, 0.2)',
                      border: '1px solid rgba(255, 69, 58, 0.4)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.9rem'
                    }}
                    title="Report player"
                  >
                    <FaFlag size={14} />
                    Report
                  </button>
                )}
              </div>
            </div>

            <div className={`rounds-container ${!mobileExpanded ? 'mobile-hidden' : ''}`} ref={roundsContainerRef}>
              {/* For ranked duels with 2 players */}
              {multiplayerState?.gameData?.duel && finalHistory.length > 0 && (
                <>
                  <h3 style={{ padding: '12px 20px', color: 'white', marginBottom: '0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>{text("roundDetails")}</h3>
                  {finalHistory.map((round, index) => {
                    const myId = multiplayerState?.gameData?.myId;
                    const myData = round.players?.[myId];

                    // Find opponent more robustly
                    const opponentEntries = Object.entries(round.players || {}).filter(([id]) => id !== myId);
                    const opponentId = opponentEntries.length > 0 ? opponentEntries[0][0] : null;
                    const opponentData = opponentEntries.length > 0 ? opponentEntries[0][1] : null;
                    const isOpponentReported = options?.reportedUserId && opponentId === options.reportedUserId;

                    const myPoints = myData?.points || 0;
                    const opponentPoints = opponentData?.points || 0;

                    // Only person who guessed lower gets damage (higher - lower)
                    let myHealthDamage = 0;
                    let opponentHealthDamage = 0;

                    if (myPoints < opponentPoints) {
                      myHealthDamage = opponentPoints - myPoints;
                    } else if (opponentPoints < myPoints) {
                      opponentHealthDamage = myPoints - opponentPoints;
                    }
                    // If points are equal, no damage to either player

                    return (
                      <div
                        key={index}
                        className={`round-item round-animation ${activeRound === index ? 'active' : ''}`}
                        style={{ animationDelay: `${index * 0.1}s` }}
                        onClick={() => handleRoundClick(index)}
                      >
                        <div className="round-header">
                          <span className="round-number">{text("roundNo", { r: index + 1 })}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {round.timeTaken && (myData?.timeTaken || round.timeTaken) > 0 && (
                              <span className="round-points" style={{ color: 'white' }}>
                                ⏱️ {formatTime(myData?.timeTaken || round.timeTaken)}
                              </span>
                            )}
                            {typeof window !== 'undefined' && window.innerWidth > 1024 && round.lat && round.long && (
                              <button
                                className="gmaps-icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openInGoogleMaps(round.lat, round.long, round.panoId);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  padding: '2px',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '20px',
                                  height: '20px',
                                  transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                title={text("openInMaps")}
                              >
                                📍
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="round-details">
                          <div className="duel-round-details" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div className="player-score" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                              <span className="player-name" style={{ fontSize: '0.9em', opacity: '0.8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {options?.isModView ? (myData?.username || text("player1")) : text("you")}
                                {myData?.countryCode && <CountryFlag countryCode={myData.countryCode} style={{ fontSize: '1em', marginRight: '2px' }} />}
                              </span>
                              <span className="score-points" style={{ color: getPointsColor(myPoints), fontWeight: 'bold' }}>
                                {myPoints} {text("pts")}
                              </span>
                              {myHealthDamage > 0 && (
                                <span className="health-damage" style={{ color: '#ff6b6b', fontSize: '0.85em' }}>
                                  -{myHealthDamage} ❤️
                                </span>
                              )}
                            </div>

                            {!mobileExpanded && (
                              <div className="vs-divider" style={{
                                padding: '0 16px',
                                fontWeight: 'bold',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontSize: '0.9em'
                              }}>VS</div>
                            )}

                            <div className="player-score" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                              <span
                                className="player-name"
                                style={{
                                  fontSize: '0.9em',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}

                              >
                                {opponentData?.username || text("opponent")}
                                {opponentData?.countryCode && <CountryFlag countryCode={opponentData.countryCode} style={{ fontSize: '1em', marginRight: '2px' }} />}
                                {isOpponentReported && ' (reported)'}
                              </span>
                              <span className="score-points" style={{ color: getPointsColor(opponentPoints), fontWeight: 'bold' }}>
                                {opponentPoints} {text("pts")}
                              </span>
                              {opponentHealthDamage > 0 && (
                                <span className="health-damage" style={{ color: '#ff6b6b', fontSize: '0.85em' }}>
                                  -{opponentHealthDamage} ❤️
                                </span>
                              )}
                            </div>
                          </div>

                          {(round.distance || round.timeTaken) && (
                            <>
                              {round.distance && round.distance > 0 && (
                                <div className="detail-row">
                                  <span className="detail-label">
                                    <span className="detail-icon">📏</span>
                                    {text("distance")}
                                  </span>
                                  <span className="distance-value">{formatDistance(round.distance)}</span>
                                </div>
                              )}

                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* For private games and unranked multiplayer (including 10 player games) */}
              {(!multiplayerState?.gameData?.duel || finalHistory.length > 0) && (
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
    <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>

    <div className={`game-summary-container `}>
      <div className="game-summary-map">
        <MapContainer
          center={[0, 0]}
          zoom={2}
          minZoom={1}
          maxZoom={18}
          worldCopyJump={false}
          zoomControl={typeof window !== 'undefined' && window.innerWidth > 1024}
          style={{ height: "100%", width: "100%" }}
        >
          <MapEvents
            mapRef={mapRef}
            onMapReady={setMapReady}
            history={history}
            onUserInteraction={() => setUserHasInteracted(true)}
          />

          <TileLayer
            url={`https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=${text("lang")}`}
          />

          {finalHistory.map((round, index) => {
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
                      {/* Only show points in single player games */}
                      {(!multiplayerState?.gameData || !finalHistory[0]?.players || Object.keys(finalHistory[0].players).length <= 1) && (
                        <div className="popup-points" style={{ color: getPointsColor(round.points) }}>
                          {round.points} {text("points")}
                        </div>
                      )}
                      {/* Only show distance in single player games */}
                      {distance && (!multiplayerState?.gameData || !finalHistory[0]?.players || Object.keys(finalHistory[0].players).length <= 1) && (
                        <div className="popup-distance">
                          {text("distance")}: {formatDistance(distance)}
                        </div>
                      )}
                      <div className="popup-actions">
                        <button
                          className="popup-btn gmaps"
                          onClick={() => openInGoogleMaps(round.lat, round.long, round.panoId)}
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
                          <div className="popup-round">{text("roundNumber", {number: index + 1})} - {options?.isModView ? (multiplayerState?.gameData?.players?.find(p => p.id === multiplayerState?.gameData?.myId)?.username || text("player")) : text("yourGuess")}</div>
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
                    // For unranked duels (public games), hide opponent pins unless a specific player is selected
                    if (multiplayerState?.gameData?.public) {
                      // If no player is selected, hide all opponent pins
                      if (!selectedPlayer) {
                        return null;
                      }
                      // If a player is selected but this isn't that player, hide this pin
                      if (playerId !== selectedPlayer) {
                        return null;
                      }
                    } else {
                      // For private games, normal player selection logic
                      if (selectedPlayer && playerId !== selectedPlayer) {
                        return null;
                      }
                    }

                    const playerColor = getPlayerColor(playerId, false);
                    const isPlayerReported = options?.reportedUserId && playerId === options.reportedUserId;
                    return (
                      <React.Fragment key={`${index}-${playerId}`}>
                        <Marker
                          position={[player.lat, player.long]}
                          icon={src2IconRef.current}
                        >
                          <Popup>
                            <div>
                              <strong
                                style={{
                                  cursor:  'default',
                                  textDecoration:  'none',
                                  color: 'inherit'
                                }}
                              >
                                {player.username || text("opponent")}{isPlayerReported && ' (reported)'}
                              </strong><br />
                              {text("roundNo", { r: index + 1 })}<br />
                              {player.points} {text("points")}
                            </div>
                          </Popup>
                        </Marker>

                        <Polyline
                          positions={[[round.lat, round.long], [player.lat, player.long]]}
                          color={getPointsColor(player.points)}
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
          <div
            className={`summary-header ${headerCompact && typeof window !== 'undefined' && window.innerWidth > 1024 ? 'compact' : ''}`}
            style={{
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              ...(mobileExpanded && typeof window !== 'undefined' && window.innerWidth <= 1024 ? {
                padding: '8px 16px',
                minHeight: 'auto',
                transform: 'scale(0.95)'
              } : {
                paddingTop: window.innerWidth < 1024 ? '15px' : '60px' // Ensure top padding is persistent on desktop
              })
            }}
          >

            <div
              className="star-container"
              style={{
                transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                ...(mobileExpanded && typeof window !== 'undefined' && window.innerWidth <= 1024 ? {
                  margin: '4px 0',
                  transform: 'scale(0.7) translateY(-4px)',
                  opacity: 0.9
                } : {})
              }}
            >
              {stars.map((star, index) => (
                <div
                  key={index}
                  className="star"
                  style={{
                    animationDelay: `${index * 0.5}s`,
                    transition: 'transform 0.3s ease-out'
                  }}
                >
                  {typeof star === "string" && star.endsWith(".png") ? (
                    <img
                      src={star}
                      alt={`Star ${index}`}
                      style={{
                        width: "32px",
                        height: "32px",
                        transition: 'all 0.3s ease-out'
                      }}
                    />
                  ) : (
                    <FaStar className="star" style={{
                      color: star,
                      transition: 'all 0.3s ease-out'
                    }} />
                  )}
                </div>
              ))}
            </div>

            {/* Display rank for multiplayer non-duel games */}
            {multiplayerState?.gameData && !multiplayerState?.gameData?.duel && finalHistory[0]?.players && Object.keys(finalHistory[0].players).length > 1 && (() => {
              const rankInfo = getCurrentUserRank();
              return rankInfo && (
                <div
                  style={{
                    color: 'white',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    margin: '8px 0',
                    opacity: 0.9,
                    transition: 'all 0.3s ease-out',
                    ...(mobileExpanded && typeof window !== 'undefined' && window.innerWidth <= 1024 ? {
                      fontSize: '1rem',
                      margin: '4px 0',
                      transform: 'scale(0.9)'
                    } : {})
                  }}
                >
                  {text("rank")} {rankInfo.rank}/{rankInfo.total}
                </div>
              );
            })()}

            <div
              className={`summary-score points-display ${pointsAnimating ? 'animating' : ''}`}
              style={{
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                ...(mobileExpanded && typeof window !== 'undefined' && window.innerWidth <= 1024 ? {
                  fontSize: '1.5rem',
                  margin: '2px 0',
                  transform: 'scale(0.9) translateY(-2px)'
                } : {})
              }}
            >
              {animatedPoints?.toFixed(0) || points}
            </div>
            <div
              className="summary-total"
              style={{
                transition: 'all 0.3s ease-out',
                ...(mobileExpanded && typeof window !== 'undefined' && window.innerWidth <= 1024 ? {
                  fontSize: '0.8rem',
                  margin: '2px 0',
                  opacity: 0.8,
                  transform: 'translateY(-1px)'
                } : {})
              }}
            >
              {text("outOf")} {maxPoints} {text("points")}
            </div>

            {/* {gameId && (
              <div className="game-id-container" style={{
                margin: '12px 0',
                padding: '8px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.9rem'
              }}>
                <span style={{ color: 'white', marginRight: '8px' }}>ID: {gameId}</span>
                <button
                  onClick={copyGameId}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    transition: 'all 0.2s'
                  }}
                  title="Copy Game ID"
                >
                  {copiedGameId ? '✓' : '📋'}
                </button>
              </div>
            )} */}

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

        <div className={`rounds-container ${!mobileExpanded ? 'mobile-hidden' : ''}`} ref={roundsContainerRef}>
          {/* Show leaderboard for multiplayer games */}
          {multiplayerState?.gameData && finalHistory[0]?.players && Object.keys(finalHistory[0].players).length > 1 && (
            <>
              <h3 style={{ padding: '12px 20px', color: 'white', marginBottom: '0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>{text("finalScores")}</h3>
              {renderLeaderboard(true)}
            </>
          )}

          {!multiplayerState?.gameData && finalHistory && finalHistory.length > 0 && (
            <>
              <h3 style={{ padding: '12px 20px', color: 'white', marginBottom: '0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>{text("roundDetails")}</h3>
              {finalHistory.map((round, index) => {
                const distance = round.guessLat && round.guessLong
                  ? calculateDistance(round.lat, round.long, round.guessLat, round.guessLong)
                  : null;

                const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;

                const handleTileClick = () => {
                  // Always just focus on the round in the map, don't auto-open Google Maps
                  handleRoundClick(index);
                };

                return (
                  <div
                    key={index}
                    className={`round-item round-animation ${activeRound === index ? 'active' : ''}`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                    onClick={handleTileClick}
                  >
                    <div className="round-header">
                      <span className="round-number">{text("roundNo", { r: index + 1 })}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className="round-points"
                          style={{ color: 'white' }}
                        >
                          {round.points} {text("pts")}
                        </span>
                        {!isMobile && (
                          <button
                            className="gmaps-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openInGoogleMaps(round.lat, round.long, round.panoId);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '12px',
                              padding: '2px',
                              borderRadius: '3px',
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '20px',
                              height: '20px',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                            title={text("openInMaps")}
                          >
                            📍
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="round-details">
                      {distance && distance > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">
                            <span className="detail-icon">📏</span>
                            {text("distance")}
                          </span>
                          <span className="distance-value">{formatDistance(distance)}</span>
                        </div>
                      )}
                      {round.timeTaken && round.timeTaken > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">
                            <span className="detail-icon">⏱️</span>
                            {text("timeTaken")}
                          </span>
                          <span className="time-value">{formatTime(round.timeTaken)}</span>
                        </div>
                      )}
{(() => {
                        if (!session?.token?.secret || !round.xpEarned || round.xpEarned <= 0) return null;
                        return (
                          <div className="detail-row">
                            <span className="detail-label">
                              <span className="detail-icon">⭐</span>
                              XP
                            </span>
                            <span className="xp-value">+{round.xpEarned}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};

export default GameSummary;