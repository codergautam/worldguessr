import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/components/useTranslations';
import { preloadPinImages } from '@/lib/markerIcons';
import styles from '../styles/gameHistory.module.css';

// loading with an error fallback: a failed chunk fetch (stale tab across a
// deploy, flaky network) otherwise renders null forever inside the opaque
// overlay below — a black screen with no exit and nothing in the console.
// Hardcoded English like SafeMapContainer's fallback: when chunks are
// unreachable, translations may be too.
const GameSummary = dynamic(() => import('./roundOverScreen'), {
  ssr: false,
  loading: ({ error }) => {
    if (!error) return null;
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'white'
      }}>
        <div>Failed to load the game viewer.</div>
        <button
          type="button"
          onClick={() => { try { window.location.reload(); } catch (_) {} }}
          style={{
            padding: '8px 18px',
            fontSize: 14,
            fontWeight: 600,
            color: '#1b2838',
            background: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          Reload
        </button>
      </div>
    );
  },
});

export default function HistoricalGameView({ game, session, onBack, options, onUsernameLookup }) {
  const { t: text } = useTranslation("common");
  const [fullGameData, setFullGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);

  // Ensure pin images are preloaded (may not have been called on non-home pages like /mod)
  useEffect(() => {
    preloadPinImages();
  }, []);

  // Handle entering animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsEntering(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Handle exit animation
  const handleBack = () => {
    setIsExiting(true);
    setTimeout(() => {
      onBack();
    }, 300); // Wait for exit animation to complete
  };

  // Auto-close when game starts
  useEffect(() => {
    const handleGameStarting = () => {
      handleBack();
    };

    window.addEventListener('gameStarting', handleGameStarting);
    return () => window.removeEventListener('gameStarting', handleGameStarting);
  }, []);


  useEffect(() => {
    const fetchFullGameData = async () => {
      if (typeof window === 'undefined' || !window.cConfig?.apiUrl) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(window.cConfig.apiUrl + '/api/gameDetails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: session?.token?.secret,
            gameId: game.gameId
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setFullGameData(data.game);
        } else {
          setError('Failed to load game details');
        }
      } catch (err) {
        setError('Error loading game details');
        console.error('Error fetching game details:', err);
      } finally {
        setLoading(false);
      }
    };

    // Check if game already has full data (from mod dashboard pre-fetch)
    if (game && game.rounds && game.players && options?.isModView) {
      setFullGameData(game);
      setLoading(false);
    } else if (typeof window !== 'undefined' && game && session?.token?.secret && window.cConfig?.apiUrl) {
      fetchFullGameData();
    }
  }, [game, session?.token?.secret]);

  if (loading) {
    return (
      <div className={styles.historicalGameLoading}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <h3>{text('loadingGameDetails')}</h3>
          <p>{text('pleaseWait')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.historicalGameError}>
        <div className={styles.errorContainer}>
          <h3>{text('errorLoadingGame')}</h3>
          <p>{error}</p>
          <button
            className={styles.backButton}
            onClick={onBack}
          >
            ← {text('backToHistory')}
          </button>
        </div>
      </div>
    );
  }

  if (!fullGameData) {
    return (
      <div className={styles.historicalGameError}>
        <div className={styles.errorContainer}>
          <h3>{text('gameNotFound')}</h3>
          <p>{text('gameNoLongerAvailable')}</p>
          <button
            className={styles.backButton}
            onClick={onBack}
          >
            ← {text('backToHistory')}
          </button>
        </div>
      </div>
    );
  }

  // Transform the historical game data to match the format expected by GameSummary
  const isModView = options?.isModView;
  const reportedUserId = options?.reportedUserId;
  const targetUserId = options?.targetUserId;

  const transformedHistory = fullGameData.rounds.map((round, index) => {
    // For mod view, if round.guess is null, try to use data from allGuesses
    let guessData = round.guess;

    if (!guessData && isModView && round.allGuesses && round.allGuesses.length > 0) {
      // For mod view, use target user's guess if available (from user lookup),
      // otherwise reported user's guess (from reports), otherwise first player's guess
      const targetUserGuess = targetUserId ?
        round.allGuesses.find(g => g.playerId === targetUserId) : null;
      const reportedUserGuess = reportedUserId ?
        round.allGuesses.find(g => g.playerId === reportedUserId) : null;
      const fallbackGuess = targetUserGuess || reportedUserGuess || round.allGuesses[0];

      guessData = {
        guessLat: fallbackGuess.guessLat,
        guessLong: fallbackGuess.guessLong,
        points: fallbackGuess.points,
        timeTaken: fallbackGuess.timeTaken,
        xpEarned: fallbackGuess.xpEarned || 0,
        usedHint: fallbackGuess.usedHint || false
      };
    }

    if (!guessData) {
      // User didn't participate in this round
      return null;
    }

    // For duels and multiplayer, include players data
    let players = {};
    if (round.allGuesses && round.allGuesses.length > 0) {
      round.allGuesses.forEach(guess => {
        players[guess.playerId] = {
          username: guess.username,
          points: guess.points,
          lat: guess.guessLat,
          long: guess.guessLong,
          timeTaken: guess.timeTaken
        };
      });
    }

    return {
      lat: round.location.lat,
      long: round.location.long,
      panoId: round.location.panoId, // Include panoId for Google Maps Street View
      guessLat: guessData.guessLat,
      guessLong: guessData.guessLong,
      points: guessData.points,
      timeTaken: guessData.timeTaken,
      xpEarned: guessData.xpEarned,
      usedHint: guessData.usedHint,
      players: players, // Include players data for duels/multiplayer
      // Per-round team scores (cumulative party team games; null on older
      // saves — the summary falls back to recomputing from player points)
      teamRoundScores: round.teamRoundScores ?? null,
      // 2v2 damage stamp + multiplier (null on pre-stamp saves — the summary
      // falls back to the raw gap, ×1)
      teamDamage: round.teamDamage ?? null,
      teamDamageMultiplier: round.teamDamageMultiplier ?? null
    };
  }).filter(round => round !== null); // Remove null entries

  const totalPoints = transformedHistory.reduce((sum, round) => sum + round.points, 0);
  const totalTime = transformedHistory.reduce((sum, round) => sum + round.timeTaken, 0);
  const maxPoints = fullGameData.result.maxPossiblePoints;

  // Team modes ('2v2' today; any future NvM party mode) are detected by the
  // saved per-player team assignments, not the gameType string, so new team
  // game types inherit the team presentation automatically.
  const isTeamGame = fullGameData.players?.some(p => p.team) || false;
  // Team games reuse the duel presentation (they ARE duels between two teams).
  const isDuel = fullGameData.gameType === 'ranked_duel' || isTeamGame;

  // Find the perspective player (the user whose view we're showing)
  // For mod view, use target user if available, otherwise reported user, otherwise first player
  const findPerspectivePlayer = () => {
    // For mod view, first try to use target user (from user lookup)
    if (isModView && targetUserId) {
      const player = fullGameData.players.find(p => p.accountId === targetUserId || p.playerId === targetUserId);
      if (player) return player;
    }

    // For mod view, try to use reported user (from reports)
    if (isModView && reportedUserId) {
      const player = fullGameData.players.find(p => p.accountId === reportedUserId || p.playerId === reportedUserId);
      if (player) return player;
    }

    // Try to match by currentUserId (for regular users viewing their own games)
    let player = fullGameData.players.find(p => p.accountId === fullGameData.currentUserId);
    if (player) return player;

    // Fallback to first player
    return fullGameData.players[0];
  };

  const perspectivePlayer = findPerspectivePlayer();

  // For duels, prepare the data structure
  let duelData = null;
  if (isDuel) {
    // Support both data structures: userPlayer (gameDetails API) and userStats (gameHistory API)
    // For mod view, use the perspective player if userPlayer is not available
    const playerData = fullGameData.userPlayer || fullGameData.userStats || perspectivePlayer;

    if (playerData) {
      const eloData = playerData.elo || {};
      duelData = {
        winner: playerData.finalRank === 1,
        draw: fullGameData.result?.isDraw || false,
        // Add opponent info if available (find player that isn't the perspective player)
        opponent: fullGameData.players?.find(p => p.accountId !== perspectivePlayer?.accountId && p.playerId !== perspectivePlayer?.playerId)
      };
      if (isTeamGame) {
        // Mirror the live duelEnd payload for team games — same wire names,
        // so roundOverScreen renders history identically to the live end
        // screen. No elo fields → the ELO block stays hidden by its
        // typeof-number guards, matching live (team games have no ELO).
        // Cumulative party team games (settings.teamGame) get teamGame:true
        // (totals presentation); the 2v2 HP model keeps team2v2 (hearts).
        const isCumulativeTeam = !!fullGameData.settings?.teamGame;
        if (isCumulativeTeam) {
          duelData.teamGame = true;
          duelData.teamScoring = fullGameData.settings?.teamScoring || 'closest';
        } else {
          duelData.team2v2 = true;
        }
        duelData.winningTeam = fullGameData.result?.winningTeam ?? null;
        duelData.draw = fullGameData.result?.isDraw || false;
        duelData.winner = !duelData.draw && duelData.winningTeam != null
          && duelData.winningTeam === (perspectivePlayer?.team ?? null);
        // Games saved before result.teamScores existed have a/b null — pass
        // null through so the summary hides the HP hearts instead of lying 0.
        const ts = fullGameData.result?.teamScores;
        duelData.teamScores = typeof ts?.a === 'number' && typeof ts?.b === 'number' ? ts : null;
      } else {
        duelData.oldElo = eloData.before || eloData.oldElo || 0;
        duelData.newElo = eloData.after || eloData.newElo || 0;
        duelData.eloDiff = eloData.change || 0;
      }
    }
  }

  // For multiplayer games, prepare the state
  let multiplayerState = null;
  if (fullGameData.gameType !== 'singleplayer' && fullGameData.gameType !== 'daily_challenge') {
    // Use the perspective player's ID
    const myPlayerId = perspectivePlayer?.playerId || perspectivePlayer?.accountId || fullGameData.currentUserId;

    multiplayerState = {
      gameData: {
        myId: myPlayerId, // Use the correct playerId that matches the game data
        players: fullGameData.players.map(player => ({
          id: player.playerId,
          username: player.username,
          // Real account id (null for bots/guests) — the report flow resolves
          // reportability through the roster, matching the live gameData shape.
          accountId: player.accountId ?? null,
          countryCode: player.countryCode ?? null,
          points: player.totalPoints,
          rank: player.finalRank,
          // Team assignment ('a' | 'b') — drives team pin colors and the
          // team round breakdown, exactly like the live gameData shape.
          team: player.team ?? null
        })),
        duel: isDuel,
        // Wire names kept in sync with the live gameData: team2v2 = 2v2 HP
        // model, teamGame = cumulative party team mode.
        team2v2: isTeamGame && !fullGameData.settings?.teamGame,
        teamGame: isTeamGame && !!fullGameData.settings?.teamGame,
        teamScoring: fullGameData.settings?.teamScoring || null,
        history: fullGameData.rounds.map(round => ({
          players: round.allGuesses.map(guess => ({
            id: guess.playerId,
            username: guess.username,
            points: guess.points,
            lat: guess.guessLat,
            lng: guess.guessLong,
            timeTaken: guess.timeTaken
          })),
          location: {
            lat: round.location.lat,
            lng: round.location.long,
            panoId: round.location.panoId // Include panoId for multiplayer games too
          }
        }))
      }
    };
  }

  const getClassName = () => {
    let className = styles.historicalGameView;
    if (isEntering) className += ` ${styles.entering}`;
    if (isExiting) className += ` ${styles.exiting}`;
    return className;
  };

  // Forfeit-before-round-1 games save with zero rounds (ws Game.js end()
  // deliberately drops the in-flight round), so gameDetails returns
  // rounds: []. GameSummary's empty-history state is a live-game placeholder
  // with no message and no buttons, which here reads as a black overlay with
  // no way out. Show a real message with an exit instead of mounting it.
  if (transformedHistory.length === 0) {
    return (
      <div className={getClassName()}>
        <div
          className={styles.errorContainer}
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <h3>{text('noRoundsPlayed')}</h3>
          <button className={styles.backButton} onClick={handleBack}>
            ← {text('backToHistory')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={getClassName()}>
      {/* Use the existing GameSummary component */}
      <GameSummary
        history={transformedHistory}
        points={totalPoints}
        time={totalTime}
        maxPoints={maxPoints}
        duel={isDuel}
        data={duelData}
        multiplayerState={multiplayerState}
        button1Press={handleBack}
        button1Text={text('backToHistory')}
        button2Press={null}
        button2Text=""
        hidden={false}
        session={session}
        gameId={game?.gameId || game?._id}
        options={{
          ...options,
          onUsernameLookup: onUsernameLookup,
          isModView: options?.isModView,
          reportedUserId: options?.reportedUserId,
          // Reporting is gated to this saved-game view (cooling-off ruling:
          // no report button on live end screens).
          isHistoryView: true
        }}
      />
    </div>
  );
}