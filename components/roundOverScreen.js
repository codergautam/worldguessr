import React, { useEffect, useState, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import { useTranslation } from '@/components/useTranslations';
import { asset } from '@/lib/basePath';
import { getPinIcons } from '@/lib/markerIcons';
import { findDistance, pickBestTeamGuessIds } from './calcPoints';
import { FaTrophy, FaClock, FaStar, FaRuler, FaMapMarkerAlt, FaExternalLinkAlt, FaFlag, FaCrown } from "react-icons/fa";
import msToTime from "./msToTime";
import formatTime from "../utils/formatTime";
import { toast } from "react-toastify";
import 'leaflet/dist/leaflet.css';
import ReportModal from './reportModal';
import UsernameWithFlag from './utils/usernameWithFlag';
import CountryFlag from './utils/countryFlag';
import generateShareText from './utils/generateShareText';
import sendEvent from './utils/sendEvent';
import SafeMapContainer from './SafeMapContainer';

// Error-boundaried MapContainer (see SafeMapContainer): a partial leaflet load
// throws "a.Map is not a constructor" during commit; without the boundary it
// white-screens the whole app.
const MapContainer = SafeMapContainer;
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);

// Component to handle map events and store map reference
const MapEvents = ({ mapRef, onMapReady, history, onUserInteraction }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    // Always stamp the latest map: GameSummary renders two MapContainer
    // variants (duel/regular) sharing one ref, so a remount must re-claim it.
    mapRef.current = map;
    onMapReady(true);

    // Force resize after creation
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(resizeTimer);
      // Leaflet's remove() deletes _mapPane; flyTo/fitBounds on a removed map
      // throws. Drop the ref unless a newer map already claimed it.
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
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
    options,
    // Matchmade team duels only (passed by the LIVE mounts, never history):
    // { playAgain, back } ws-send closures for the post-game consensus
    // requeue. When set, these replace button1 on the team end screen.
    teamActions = null
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
  // Team-game report flow: candidate list for the modal's picker step
  // (everyone except self). Mutually exclusive with reportTarget (1v1 path).
  const [reportCandidates, setReportCandidates] = useState(null);
  const mapRef = useRef(null);
  const destIconRef = useRef(null);
  const srcIconRef = useRef(null);
  const src2IconRef = useRef(null);
  const srcBigIconRef = useRef(null);
  const src2BigIconRef = useRef(null);
  const roundsContainerRef = useRef(null);

  // Animation states for duel
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [pointsAnimating, setPointsAnimating] = useState(false);
  const [animatedElo, setAnimatedElo] = useState(data?.oldElo || 0);
  const [stars, setStars] = useState([]);
  const [eloAnimationComplete, setEloAnimationComplete] = useState(false);



  // Initialize Leaflet icons from shared cache (icons created once globally)
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

  // Enhanced smooth animation for points in regular games
  useEffect(() => {
    if (!duel && points) {
      const startValue = animatedPoints || 0;
      const endValue = points;
      const duration = 1200; // Slightly longer for more dramatic effect
      const startTime = Date.now();
      let animationFrameId = null;
      let timeoutId = null;
      let cancelled = false;

      // Start the CSS animation
      setPointsAnimating(true);

      const animate = () => {
        if (cancelled) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic: starts fast, slows down at end (no overshoot)
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentValue = startValue + (endValue - startValue) * easedProgress;
        setAnimatedPoints(Math.round(currentValue));

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(animate);
        } else {
          setAnimatedPoints(endValue);
          // End the CSS animation after a brief delay for the glow to fade
          timeoutId = setTimeout(() => setPointsAnimating(false), 300);
        }
      };

      animationFrameId = requestAnimationFrame(animate);

      // Cleanup: cancel animation and timeout if points changes or component unmounts
      return () => {
        cancelled = true;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (timeoutId) clearTimeout(timeoutId);
      };
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
      const platinum = asset("/platinum_star.png"); // Define platinum star image
      const silver = "#CD7F32"; // Define silver color for stars
      const bronze = "#b6b2b2"; // Define bronze color for stars

      // zero to 30% - bronze star
      if (percentage <= 20) {
        newStars = [bronze];
      } else if (percentage <= 40) {
        newStars = [bronze, bronze];
      }  else if (percentage <= 50) {
        newStars = [bronze, bronze, bronze];
      } else if (percentage <= 65) {
        newStars = [silver, silver, silver];
      } else if (percentage <= 85) {
        newStars = [gold, gold, gold];
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

    const renderPlayerRow = (player, index) => {
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
    };

    // Team games: group the final scores by team, keeping each player's
    // GLOBAL rank number (and trophies) from the overall sort. 2v2 uses the
    // your/enemy framing; cumulative parties keep stable Team 1/Team 2
    // identities (matching the lobby columns and the in-game scorebar).
    if (isTeamGame) {
      const enemyTeam = myTeam === 'a' ? 'b' : 'a';
      const rankOf = new Map(players.map((p, i) => [p.playerId, i]));
      const sectionHeader = (label, team) => (
        <h4 key={`hdr-${label}`} style={{
          padding: '10px 20px 2px',
          margin: 0,
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.85rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {!data?.draw && data?.winningTeam === team && <FaCrown className="game-summary-team-crown" aria-hidden />}
          {label}
        </h4>
      );
      const rowsFor = (team) => players
        .filter(p => teamOf[p.playerId] === team)
        .map(p => renderPlayerRow(p, rankOf.get(p.playerId)));
      // Players with no known team (shouldn't happen, but never drop anyone).
      const unknownRows = players
        .filter(p => teamOf[p.playerId] !== 'a' && teamOf[p.playerId] !== 'b')
        .map(p => renderPlayerRow(p, rankOf.get(p.playerId)));
      const sections = isCumulativeTeam
        ? [['a', `${text("team1")}${myTeam === 'a' ? ` · ${text("yourTeamTag")}` : ''}`],
           ['b', `${text("team2")}${myTeam === 'b' ? ` · ${text("yourTeamTag")}` : ''}`]]
        : [[myTeam, text("yourTeam")], [enemyTeam, text("enemyTeam")]];
      return (
        <>
          {sections.map(([team, label]) => (
            <React.Fragment key={team}>
              {sectionHeader(label, team)}
              {rowsFor(team)}
            </React.Fragment>
          ))}
          {unknownRows}
        </>
      );
    }

    const displayPlayers = showAll ? players : players.slice(0, 5);
    return displayPlayers.map(renderPlayerRow);
  };

  const getPointsColor = (points) => {
    if (points >= 3000) return '#4CAF50';
    if (points >= 1500) return '#FFC107';
    return '#F44336';
  };

  const openInGoogleMaps = (lat, lng, panoId = null) => {
    let url;
    if (typeof lat === 'number' && typeof lng === 'number') {
      url = `http://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0`;
    } else if (panoId) {
      url = `http://maps.google.com/maps?q=&layer=c&panoid=${panoId}&cbp=11,0,0,0,0`;
    } else {
      return;
    }

    // Check if we're on an embedded portal that can't open external links
    const isCrazyGames = typeof window !== 'undefined' && window.inCrazyGames;
    const isCoolMathGames = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COOLMATH === "true";
    const isGameDistribution = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true";
    const isPoki = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_POKI === "true";

    if (isCrazyGames || isCoolMathGames || isGameDistribution || isPoki) {
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
      // The timer MUST be cleaned up: armed once with no cancel, it kept
      // firing an animated fitBounds AFTER the user clicked a round in the
      // 200ms window, yanking the camera off their round-focus flight.
      // (userHasInteracted flips on movestart, which re-runs this effect and
      // cancels via the cleanup below.)
      const id = setTimeout(() => {
        // Set initial extent only once, then allow free user interaction
        fitMapToBounds();
      }, 200);
      return () => clearTimeout(id);
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

    // If no history provided, try to construct it from multiplayerState.
    // roundHistory only ever contains rounds that fully resolved (the server
    // drops the in-flight round on forfeit ends), so private duels/team games
    // transform it the same way public matchmade ones do. The old `duel && !public` skip here
    // silently emptied the whole end screen (no pins, no breakdown) for
    // private party duels and party team games.
    if (multiplayerState?.gameData?.roundHistory) {
      const { roundHistory, myId } = multiplayerState.gameData;

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
            // Server-computed per-round team scores (cumulative parties) —
            // must survive the transform for the round breakdown.
            teamRoundScores: roundData.teamRoundScores ?? null,
            // 2v2 stamp: HP actually applied + multiplier used (Game.js
            // saveRoundToHistory); null on rounds from a pre-stamp server.
            teamDamage: roundData.teamDamage ?? null,
            teamDamageMultiplier: roundData.teamDamageMultiplier ?? null,
            timeTaken: null
          };
        });
        return transformed;
      }
    }

    return [];
  }, [history, multiplayerState?.gameData?.roundHistory, multiplayerState?.gameData?.myId]);

  // Alias used by the map helpers (fitMapToBounds/focusOnRound) and the map-fit
  // effect below. It MUST be declared here — before the early returns and before
  // those closures could ever run — so it is always initialized on every render
  // that commits. Previously it lived after the early returns (empty history /
  // Leaflet not ready); on a bail-out render the `const` stayed in its temporal
  // dead zone, and when React later flushed the passive map-fit effect it read
  // `finalHistory.length` and threw "Cannot access 'finalHistory' before
  // initialization", which Next.js surfaced as a fatal client-side crash.
  const finalHistory = gameHistory;

  // ── Team context (2v2 today; any NvM two-team mode). Used by the map pin
  // colors, header summary, round breakdown, final-scores grouping, and
  // report buttons — declared at component scope (like finalHistory above) so
  // the leaderboard helpers defined earlier can close over it. `teamOf` is
  // keyed by player id and built from gameData.players, which both the live
  // game and the history transform (historicalGameView) populate with `team`.
  // Size-agnostic: always exactly two teams 'a'/'b', any number of players.
  // Cumulative-points party team mode (teamGame) vs the 2v2 HP model
  // (team2v2). Both are "team games" for grouping/pin purposes; only the
  // score presentation differs (totals vs damage hearts).
  const isCumulativeTeam = !!(data?.teamGame || multiplayerState?.gameData?.teamGame);
  // Fallback matches the server default ('closest', Game.js constructor) —
  // practically unreachable since every payload carries the field.
  const teamScoring = data?.teamScoring || multiplayerState?.gameData?.teamScoring || 'closest';
  const isTeamGame = !!(data?.team2v2 || multiplayerState?.gameData?.team2v2 || isCumulativeTeam);
  // Prefer the duelEnd roster snapshot: the live gameData.players array
  // SHRINKS as opponents hit Play Again on the finished game ('player remove'
  // broadcasts), which stripped teammates of their team here — flipping their
  // pins/groupings to enemy. The snapshot is frozen at game end and includes
  // mid-game leavers. Fallback covers history views and old-server payloads.
  const gamePlayers = (Array.isArray(data?.players) && data.players.length > 0)
    ? data.players
    : (multiplayerState?.gameData?.players || []);
  const teamOf = {};
  gamePlayers.forEach(p => { teamOf[p.id] = p.team; });
  // No 'a' default on lookup miss: that silently INVERTS the Victory/Defeat
  // headline and every pin color for a team-b player whose id hasn't landed
  // in the roster yet. Null = neutral until the roster resolves.
  const myTeam = isTeamGame
    ? (teamOf[multiplayerState?.gameData?.myId] ?? null)
    : null;
  const isMyTeammate = (playerId) =>
    isTeamGame && myTeam != null && teamOf[playerId] === myTeam;

  // Per-round best (closest) guesser of EACH team — that pin renders with the
  // enlarged icon so the guess that actually counted pops out of the cluster.
  // Points-first, exact point ties (capped 5000s / same rounded score between
  // close teammates) broken by raw distance — only ONE pin per team enlarges
  // and draws its line (same rule as Map.js reveal / ResultsMap).
  const bestTeamGuesserIds = (round) => {
    if (!isTeamGame) return null;
    // Average-mode team parties: every guess counts equally, so there is no
    // "guess that counted" to pop — no enlarged pins. (Mirrors the round
    // breakdown, which hides the best-guesser name in this mode too.)
    if (isCumulativeTeam && teamScoring === 'average') return null;
    const entries = Object.entries(round.players || {}).map(([id, p]) => ({
      id,
      team: teamOf[id],
      pts: p?.points || 0,
      dist: (round.lat != null && p?.lat != null)
        ? findDistance(round.lat, round.long, p.lat, p.long)
        : Infinity,
    }));
    return pickBestTeamGuessIds(entries);
  };

  // Compute the map's initial bounds from round locations + guesses up front
  // so MapContainer mounts already fitted to them. Passing `bounds` to a v4
  // MapContainer runs fitBounds at map creation, so the very first tile fetch
  // hits the correct area — no split-second [0,0] / zoom 2 world-map flash
  // before the fitMapToBounds effect snaps it later.
  const initialBounds = useMemo(() => {
    if (typeof window === 'undefined' || !window.L || !gameHistory?.length) {
      return null;
    }
    const b = window.L.latLngBounds();
    gameHistory.forEach((round) => {
      if (round.lat != null && round.long != null) b.extend([round.lat, round.long]);
      if (round.guessLat != null && round.guessLong != null) b.extend([round.guessLat, round.guessLong]);
      if (round.players) {
        Object.values(round.players).forEach((p) => {
          if (p.lat != null && p.long != null) b.extend([p.lat, p.long]);
        });
      }
    });
    return b.isValid() ? b : null;
  }, [gameHistory, leafletReady]);

  // Don't render until Leaflet is ready. Must keep the .round-over-screen
  // wrapper: it carries the opaque backdrop, and without it this placeholder
  // is a transparent div in document flow — the pano flashes through until
  // Leaflet resolves.
  if (!leafletReady || !destIconRef.current || !srcIconRef.current || !src2IconRef.current) {
    return (
      <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>
        <div className="game-summary-container">
        </div>
      </div>
    );
  }

  // Zero-rounds duel ends still get the full verdict card: a round-1 forfeit
  // (opponent quits, 30s purge fires before any round resolves) ends the game
  // with an EMPTY roundHistory, and this early return used to swallow the
  // whole end screen — the 0.9-alpha .round-over-screen backdrop rendered
  // with nothing inside, leaving a black click-eating veil over the pano
  // (no Victory/ELO/buttons; live twin of the July 14 history-view bug).
  // The duel branch below degrades fine without rounds (empty world map).
  if((!gameHistory || gameHistory.length === 0) && !(duel && data)) {
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
          </div>
        </div>
      </div>
    );
  }

  // Helper function to open report modal
  const handleReportUser = (accountId, username) => {
    setReportTarget({ accountId, username });
    setReportModalOpen(true);
  };

  // DUEL SCREEN IMPLEMENTATION
  if (duel && data) {
    // Cumulative team parties: trust the server's per-player verdict when the
    // live duelEnd carried one; derive from winningTeam vs my team only for
    // the client-side fallback payload (reconnect into end), which has none.
    const winner = isCumulativeTeam
      ? (typeof data.winner === 'boolean'
        ? data.winner
        : (!data.draw && data.winningTeam != null && data.winningTeam === myTeam))
      : data.winner;
    const draw = isCumulativeTeam ? !!data.draw : data.draw;
    const { oldElo, newElo } = data;
    const eloChange = newElo - oldElo;

    // Opponent(s): every player NOT on my team (teams), or the single other
    // player (1v1). Collected from round data so mid-game leavers still count.
    // (Team context — isTeamGame/teamOf/myTeam/isMyTeammate — is declared at
    // component scope, above the early returns.)
    const getOpponents = () => {
      const myId = multiplayerState?.gameData?.myId;
      const roster = multiplayerState?.gameData?.players || [];
      const firstRound = multiplayerState?.gameData?.roundHistory?.[0] || finalHistory[0];
      if (!firstRound?.players) return [];
      return Object.entries(firstRound.players)
        .filter(([id]) => id !== myId && !isMyTeammate(id))
        // Reporting needs the real ACCOUNT id, but round keys are per-game
        // ids (live: socket uuid; history: accountId-or-socket), so resolve
        // through the roster. null accountId (bot/guest/opponent already
        // gone) makes ReportModal fake the submission instead of erroring.
        .map(([id, p]) => ({
          accountId: roster.find(r => r.id === id)?.accountId ?? null,
          username: p.username
        }));
    };

    const opponents = getOpponents();
    // Prefer the explicit opponent stamp on `data` — the history view (the
    // only surface that renders the report button) fills it from the saved
    // game doc; live duelEnd stamps the same shape.
    const reportOpponent = (data?.opponent?.username != null || data?.opponent?.accountId != null)
      ? { accountId: data.opponent.accountId ?? null, username: data.opponent.username }
      : opponents[0];

    // Matchmade 2v2 reporting (cumulative team parties deliberately stay
    // report-free): everyone except self is a candidate — teammate included,
    // and BOTH opponents selectable in one pass (co-cheating duo case).
    // Only rendered in the history view; candidates come from `data.players`
    // (saved doc roster) or the gameData roster. null accountId (bot/guest)
    // candidates fake-submit in the modal.
    const isMatchmade2v2 = !!(data?.team2v2 || multiplayerState?.gameData?.team2v2) && !isCumulativeTeam;
    const teamReportCandidates = (() => {
      if (!isMatchmade2v2) return [];
      const gd = multiplayerState?.gameData;
      const src = (Array.isArray(data?.players) && data.players.length ? data.players : gd?.players) || [];
      const mine = src.find(p => p.id === gd?.myId)?.team ?? myTeam;
      return src
        .filter(p => p.id !== gd?.myId)
        .map(p => ({
          accountId: p.accountId ?? null,
          username: p.username,
          relationshipLabel: p.team ? (p.team === mine ? text('yourTeam') : text('enemyTeam')) : null
        }));
    })();

    return (
      <div className={`round-over-screen ${hidden ? 'hidden' : ''}`}>
        {/* Report Modal */}
        {(reportTarget || reportCandidates) && (
          <ReportModal
            isOpen={reportModalOpen}
            onClose={() => {
              setReportModalOpen(false);
              setReportTarget(null);
              setReportCandidates(null);
            }}
            reportedUser={reportTarget}
            candidates={reportCandidates}
            gameId={gameId}
            // The duel end screen only hosts 1v1 duels (ranked matchmade +
            // private) and matchmade 2v2 — unranked games render the
            // non-duel summary, which has no report button by design. The
            // old public→'unranked_multiplayer' expr mislabeled live ranked
            // reports (matchmade duels are public:true).
            gameType={reportCandidates ? '2v2' : 'ranked_duel'}
            session={session}
          />
        )}

        <div className="game-summary-container">
          <div className="game-summary-map">
            <MapContainer
              {...(initialBounds
                ? { bounds: initialBounds, boundsOptions: { padding: [20, 20] } }
                : { center: [0, 0], zoom: 2 })}
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
                url={`https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=${text("lang")}&scale=2`}
                subdomains={['0', '1', '2', '3']}
                maxZoom={22}
              />

              {finalHistory.map((round, index) => {
                // Everything in this branch is a duel-style presentation
                // (1v1, 2v2, party team duel), so a selected round always
                // filters the map to just that round's pins. NOTE: gating on
                // gameData.duel here would break party team games — their
                // server flag is duel=false.
                const inActiveRound = activeRound === null || activeRound === index;
                // A selected leaderboard player filters guesses to theirs +
                // yours, matching the regular-game screen's behavior.
                const showsPlayer = (playerId) => !selectedPlayer || playerId === selectedPlayer;
                // Team games: each team's closest guesser gets the enlarged pin.
                const bestIds = bestTeamGuesserIds(round);

                return (
                  <React.Fragment key={index}>
                    {/* Target location */}
                    {inActiveRound && (
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

                  {/* Current player's guess — stays visible alongside a
                      selected player for direct comparison */}
                  {round.guessLat && round.guessLong && (() => {
                    if (!inActiveRound) {
                      return null;
                    }

                    return (
                      <>
                        <Marker
                          position={[round.guessLat, round.guessLong]}
                          icon={bestIds?.has(multiplayerState?.gameData?.myId) ? srcBigIconRef.current : srcIconRef.current}
                        >
                          {/* Team games: teammates share identical pins, so a
                              focused round shows permanent name labels (same
                              affordance as the Map.js round reveal) instead of
                              relying on click-popups to tell guesses apart. */}
                          {isTeamGame && activeRound === index && (
                            <Tooltip
                              direction="top"
                              offset={[0, bestIds?.has(multiplayerState?.gameData?.myId) ? -55 : -45]}
                              opacity={1}
                              permanent
                            >
                              <span style={{ color: 'black' }}>
                                {options?.isModView ? (round.players?.[multiplayerState?.gameData?.myId]?.username || text("player")) : text("yourGuess")}
                              </span>
                            </Tooltip>
                          )}
                          <Popup>
                            <div>
                              <strong>{options?.isModView ? (round.players?.[multiplayerState?.gameData?.myId]?.username || text("player")) : text("yourGuess")}</strong><br />
                              {text("roundNo", { r: index + 1 })}<br />
                              {round.points} {text("points")}
                            </div>
                          </Popup>
                        </Marker>

                        {/* Best-guess team modes (2v2 / closest-scoring
                            parties): only the counted guess draws a line to
                            the target — non-best pins stay, lines go, so the
                            map isn't a tangle. bestIds is null otherwise
                            (1v1, average parties) → every guess keeps its
                            line. */}
                        {(!bestIds || bestIds.has(multiplayerState?.gameData?.myId)) && (
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
                    if (player.lat && player.long && playerId !== multiplayerState?.gameData?.myId) {
                      if (!inActiveRound || !showsPlayer(playerId)) {
                        return null;
                      }

                      const isPlayerReported = options?.reportedUserId && playerId === options.reportedUserId;
                      return (
                        <React.Fragment key={`${index}-${playerId}`}>
                          {/* Team games: teammates share YOUR (blue src) pin,
                              enemies get the green src2 pin — the map reads as
                              team-vs-team, not you-vs-everyone. Each team's
                              closest guesser renders enlarged. */}
                          <Marker
                            position={[player.lat, player.long]}
                            icon={isMyTeammate(playerId)
                              ? (bestIds?.has(playerId) ? srcBigIconRef.current : srcIconRef.current)
                              : (bestIds?.has(playerId) ? src2BigIconRef.current : src2IconRef.current)}
                          >
                            {isTeamGame && activeRound === index && (
                              <Tooltip
                                direction="top"
                                offset={[0, bestIds?.has(playerId) ? -55 : -45]}
                                opacity={1}
                                permanent
                              >
                                <span style={{ color: 'black' }}>
                                  {player.username || text("opponent")}
                                </span>
                              </Tooltip>
                            )}
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
          </div>

          <div className={`game-summary-sidebar ${mobileExpanded ? 'mobile-expanded' : ''}`}>
            <div className={`summary-header duel-header ${headerCompact && typeof window !== 'undefined' && window.innerWidth > 1024 ? 'compact' : ''}`}>
              <h1 className="summary-title">
                {draw ? text("draw") : winner ? text("victory") : text("defeat")}
              </h1>

              {/* Cumulative team parties: final team totals under the verdict */}
              {isCumulativeTeam && data.teamScores && (
                <div className="team-final-scoreline">
                  {[['a', 'team1'], ['b', 'team2']].map(([teamKey, labelKey], i) => (
                    <React.Fragment key={teamKey}>
                      {i === 1 && <span className="team-final-scoreline__dash">—</span>}
                      <span className={`team-final-scoreline__side ${myTeam === teamKey ? 'team-final-scoreline__side--mine' : ''} ${!draw && data.winningTeam === teamKey ? 'team-final-scoreline__side--won' : ''}`}>
                        <span className="team-final-scoreline__label">
                          {!draw && data.winningTeam === teamKey && <FaCrown className="game-summary-team-crown" aria-hidden />}
                          {text(labelKey)}
                        </span>
                        <span className="team-final-scoreline__pts">{(data.teamScores[teamKey] ?? 0).toLocaleString()}</span>
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

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

                {/* Matchmade team duels: Play Again needs every living
                    teammate's ack (live "n/m" counter, server-driven). Back
                    exits to a staging lobby WITHOUT queueing — visible to
                    auto-paired members (dissolves the pairing), the chosen
                    duo's host (takes the whole team back), and anyone whose
                    teammate already left. Chosen-duo guests only get Play
                    Again. Replaces button1; the mount passes button2Text=null
                    (no in-card Home) — the navbar back button is the
                    straight-to-home exit on team2v2 end screens. */}
                {teamActions && isTeamGame && !isCumulativeTeam ? (() => {
                  const myId = multiplayerState?.gameData?.myId;
                  const pa = multiplayerState?.gameData?.playAgain2v2;
                  const needed = pa?.needed ?? 2;
                  const ackedIds = pa?.ackedIds || [];
                  const myAcked = myId != null && ackedIds.includes(myId);
                  const soloRequeue = needed <= 1;
                  const playAgainWillExit = soloRequeue || (!myAcked && ackedIds.length + 1 >= needed);
                  const backVisible = data?.autoPaired === true
                    || (data?.teamHostId != null && data.teamHostId === myId)
                    || soloRequeue;
                  return (
                    <>
                      <button
                        className="action-btn primary"
                        disabled={myAcked && !soloRequeue}
                        style={myAcked && !soloRequeue ? { opacity: 0.65, cursor: 'default' } : undefined}
                        onClick={() => { if (!myAcked || soloRequeue) teamActions.playAgain({ willExit: playAgainWillExit }); }}
                      >
                        {text("playAgain")}{soloRequeue ? '' : ` (${ackedIds.length}/${needed})`}
                      </button>
                      {backVisible && (
                        <button className="action-btn secondary" onClick={teamActions.back}>
                          {text("back")}
                        </button>
                      )}
                    </>
                  );
                })() : (
                  button1Text && (
                    <button className="action-btn primary" onClick={button1Press}>
                      {button1Text}
                    </button>
                  )
                )}
                {button2Text && (
                  <button className="action-btn secondary" onClick={button2Press}>
                    {button2Text}
                  </button>
                )}

                {/* Report button — HISTORY VIEW ONLY, deliberately: the
                    detour through the game-history tab is a cooling-off step
                    so a fresh loss can't be rage-reported from the live end
                    screen. 1v1 duels get the direct flow, matchmade 2v2 the
                    multi-select picker (everyone except self). Cumulative
                    team parties stay report-free by ruling. Hidden in mod
                    view. */}
                {options?.isHistoryView && !options?.isModView
                  && ((!isTeamGame && multiplayerState?.gameData?.duel && reportOpponent)
                      || (isMatchmade2v2 && teamReportCandidates.length > 0))
                  && session?.token?.secret && (
                  <button
                    className="action-btn report-btn"
                    onClick={() => {
                      if (isMatchmade2v2) {
                        setReportCandidates(teamReportCandidates);
                        setReportModalOpen(true);
                      } else {
                        handleReportUser(reportOpponent.accountId, reportOpponent.username);
                      }
                    }}
                    style={{
                      background: 'rgba(255, 69, 58, 0.2)',
                      border: '1px solid rgba(255, 69, 58, 0.4)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.9rem'
                    }}
                    title={text("reportPlayer")}
                  >
                    <FaFlag size={14} />
                    {text("report")}
                  </button>
                )}
              </div>
            </div>

            <div className={`rounds-container ${!mobileExpanded ? 'mobile-hidden' : ''}`} ref={roundsContainerRef}>
              {/* Team round breakdown: team best (drives the HP damage) plus
                  every member's own guess — grouped your-team vs enemy, any
                  team size. Round rows keep the 1v1 affordances (map focus on
                  click, time, open-in-maps). */}
              {isTeamGame && finalHistory.length > 0 && (() => {
                const enemyTeam = myTeam === 'a' ? 'b' : 'a';
                const membersOf = (team) => gamePlayers.filter(p => teamOf[p.id] === team);
                const myId = multiplayerState?.gameData?.myId;

                // Cumulative parties: the round's team score comes from the
                // server (roundHistory.teamRoundScores) — 'average' is not
                // reconstructable client-side (denominator = roster at scoring
                // time). Fallbacks: best-of for 'closest', an approximate mean
                // over the recorded round players for 'average'.
                const cumulativeRoundScore = (round, team, computedBest) => {
                  const stored = round.teamRoundScores?.[team];
                  if (typeof stored === 'number') return stored;
                  if (teamScoring !== 'average') return computedBest;
                  const members = Object.entries(round.players || {}).filter(([id]) => teamOf[id] === team);
                  if (!members.length) return 0;
                  return Math.round(members.reduce((sum, [, p]) => sum + (p?.points || 0), 0) / members.length);
                };

                // Team column: the team's counting score, plus the best
                // guesser's name where a single guess counted (closest/2v2 —
                // under 'average' no one guess "won" the round, so no name).
                // 2v2 keeps its damage hearts; cumulative shows +pts instead.
                // Per-player detail lives behind the Final Scores rows
                // (click to expand + map filter), not here.
                const renderTeamColumn = (round, team, label, best, dmg) => {
                  const namesBest = !(isCumulativeTeam && teamScoring === 'average');
                  const bestPlayer = namesBest && best > 0
                    ? membersOf(team).find(p => (round.players?.[p.id]?.points || 0) === best)
                    : null;
                  // Prefer the server-stamped per-team round score (now stamped
                  // for 2v2 too, not just cumulative parties); fall back to the
                  // cumulative helper / computed best for pre-stamp rounds.
                  const stampedScore = round.teamRoundScores?.[team];
                  const displayScore = typeof stampedScore === 'number'
                    ? stampedScore
                    : (isCumulativeTeam ? cumulativeRoundScore(round, team, best) : best);
                  // Unstamped rounds (pre-stamp server/saves) were 1x, so the
                  // fallback is 1 — and ×1 means "no multiplier": the tag and
                  // tooltip only render when a real multiplier shaped the
                  // damage (per-round stamps may also legitimately be 1).
                  const dmgMult = round.teamDamageMultiplier ?? 1;
                  const showMult = !isCumulativeTeam && dmgMult !== 1;
                  return (
                    <div className="player-score" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <span className="player-name" style={{ fontSize: '0.9em', opacity: '0.8' }}>{label}</span>
                      {bestPlayer && (
                        <span style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.65)', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {bestPlayer.username}
                          </span>
                          {bestPlayer.countryCode && <CountryFlag countryCode={bestPlayer.countryCode} style={{ fontSize: '1em' }} />}
                          {bestPlayer.id === myId && !options?.isModView && <span style={{ fontStyle: 'italic', opacity: 0.7 }}>({text("you")})</span>}
                        </span>
                      )}
                      <span className="score-points" style={{ color: getPointsColor(displayScore), fontWeight: 'bold' }}>
                        {isCumulativeTeam ? text("teamRoundPoints", { pts: displayScore }) : `${displayScore} ${text("pts")}`}
                      </span>
                      {/* Damage already includes the multiplier; the ×n tag
                          mentions it (server-stamped per round, ×1 fallback
                          for pre-stamp rounds). */}
                      {!isCumulativeTeam && dmg > 0 && (
                        <span className="health-damage" style={{ color: '#ff6b6b', fontSize: '0.85em' }}
                          title={showMult ? text("teamDamageMultiplierHint", { mult: dmgMult }) : undefined}>
                          -{dmg} ❤️{showMult && <span style={{ opacity: 0.6, fontSize: '0.9em' }}> ×{dmgMult}</span>}
                        </span>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    <h3 style={{ padding: '12px 20px', color: 'white', marginBottom: '0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>{text("roundDetails")}</h3>
                    {finalHistory.map((round, index) => {
                      let myBest = 0, enemyBest = 0;
                      Object.entries(round.players || {}).forEach(([id, pdata]) => {
                        const pts = pdata?.points || 0;
                        if (teamOf[id] === myTeam) myBest = Math.max(myBest, pts);
                        else if (teamOf[id] === enemyTeam) enemyBest = Math.max(enemyBest, pts);
                      });
                      // 2v2 hearts show the HP actually applied. The server
                      // stamps damage + multiplier per round (Game.js
                      // saveRoundToHistory) — the formula lives THERE alone,
                      // never here. Unstamped rounds (pre-stamp servers and
                      // old saves) applied NO multiplier, so the fallback is
                      // the raw gap. Cumulative parties render +pts instead
                      // of hearts, so dmg never shows there.
                      const stampedDmg = typeof round.teamDamage === 'number' ? round.teamDamage : null;
                      const dmgOf = (gap) => stampedDmg ?? gap;
                      const myDmg = myBest < enemyBest ? dmgOf(enemyBest - myBest) : 0;
                      const enemyDmg = enemyBest < myBest ? dmgOf(myBest - enemyBest) : 0;
                      const myTime = round.players?.[myId]?.timeTaken;
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
                              {myTime > 0 && (
                                <span className="round-points" style={{ color: 'white' }}>
                                  ⏱️ {formatTime(myTime)}
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
                            {/* Cumulative parties keep stable Team 1/Team 2 identities (matching
                                the lobby, scorebar and Final Scores); 2v2 keeps your/enemy. */}
                            <div className="duel-round-details" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                              {isCumulativeTeam ? (
                                <>
                                  {renderTeamColumn(round, 'a', `${text("team1")}${myTeam === 'a' ? ` (${text("you")})` : ''}`, myTeam === 'a' ? myBest : enemyBest, 0)}
                                  {/* Hidden when expanded on mobile — mirrors the 1v1 breakdown's space-saving rule. */}
                                  {!mobileExpanded && <div className="vs-divider" style={{ padding: '0 16px', fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9em', alignSelf: 'center' }}>{text("vs")}</div>}
                                  {renderTeamColumn(round, 'b', `${text("team2")}${myTeam === 'b' ? ` (${text("you")})` : ''}`, myTeam === 'b' ? myBest : enemyBest, 0)}
                                </>
                              ) : (
                                <>
                                  {renderTeamColumn(round, myTeam, text("yourTeam"), myBest, myDmg)}
                                  {!mobileExpanded && <div className="vs-divider" style={{ padding: '0 16px', fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9em', alignSelf: 'center' }}>{text("vs")}</div>}
                                  {renderTeamColumn(round, enemyTeam, text("enemyTeam"), enemyBest, enemyDmg)}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              {/* For ranked duels with 2 players */}
              {multiplayerState?.gameData?.duel && !isTeamGame && finalHistory.length > 0 && (
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
                              }}>{text("versus")}</div>
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
          {...(initialBounds
            ? { bounds: initialBounds, boundsOptions: { padding: [20, 20] } }
            : { center: [0, 0], zoom: 2 })}
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
            url={`https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=${text("lang")}&scale=2`}
            subdomains={['0', '1', '2', '3']}
            maxZoom={22}
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
                      <div className="popup-round">{text("roundNumber", {round: index + 1})} - {text("actualLocation")}</div>
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
                          <div className="popup-round">{text("roundNumber", {round: index + 1})} - {options?.isModView ? (multiplayerState?.gameData?.players?.find(p => p.id === multiplayerState?.gameData?.myId)?.username || text("player")) : text("yourGuess")}</div>
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