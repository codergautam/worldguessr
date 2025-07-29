import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';
import GameSummary from './roundOverScreen';

export default function HistoricalGameView({ game, session, onBack }) {
  const { t: text } = useTranslation("common");
  const [fullGameData, setFullGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFullGameData = async () => {
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

    if (game && session?.token?.secret) {
      fetchFullGameData();
    }
  }, [game, session?.token?.secret]);

  if (loading) {
    return (
      <div className="historical-game-loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h3>{text('loadingGameDetails')}</h3>
          <p>{text('pleaseWait')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="historical-game-error">
        <div className="error-container">
          <h3>{text('errorLoadingGame')}</h3>
          <p>{error}</p>
          <button 
            className="back-button"
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
      <div className="historical-game-error">
        <div className="error-container">
          <h3>{text('gameNotFound')}</h3>
          <p>{text('gameNoLongerAvailable')}</p>
          <button 
            className="back-button"
            onClick={onBack}
          >
            ← {text('backToHistory')}
          </button>
        </div>
      </div>
    );
  }

  // Transform the historical game data to match the format expected by GameSummary
  const transformedHistory = fullGameData.rounds.map((round, index) => {
    if (!round.guess) {
      // User didn't participate in this round
      return null;
    }

    return {
      lat: round.location.lat,
      long: round.location.long,
      guessLat: round.guess.guessLat,
      guessLong: round.guess.guessLong,
      points: round.guess.points,
      timeTaken: round.guess.timeTaken,
      xpEarned: round.guess.xpEarned,
      usedHint: round.guess.usedHint
    };
  }).filter(round => round !== null); // Remove null entries

  const totalPoints = transformedHistory.reduce((sum, round) => sum + round.points, 0);
  const totalTime = transformedHistory.reduce((sum, round) => sum + round.timeTaken, 0);
  const maxPoints = fullGameData.result.maxPossiblePoints;

  // Determine if this is a duel
  const isDuel = fullGameData.gameType === 'ranked_duel';
  
  // For duels, prepare the data structure
  let duelData = null;
  if (isDuel && fullGameData.userPlayer) {
    duelData = {
      oldElo: fullGameData.userPlayer.elo.before,
      newElo: fullGameData.userPlayer.elo.after,
      eloDiff: fullGameData.userPlayer.elo.change,
      won: fullGameData.userPlayer.finalRank === 1,
      // Add opponent info if available
      opponent: fullGameData.players.find(p => p.accountId !== session?.token?.secret)
    };
  }

  // For multiplayer games, prepare the state
  let multiplayerState = null;
  if (fullGameData.gameType !== 'singleplayer') {
    multiplayerState = {
      gameData: {
        players: fullGameData.players.map(player => ({
          id: player.playerId,
          username: player.username,
          points: player.totalPoints,
          rank: player.finalRank
        })),
        duel: isDuel,
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
            lng: round.location.long
          }
        }))
      }
    };
  }

  return (
    <div className="historical-game-view">
      {/* Back button header */}
      <div className="historical-game-header">
        <button 
          className="back-button-header"
          onClick={onBack}
        >
          ← {text('backToHistory')}
        </button>
        <div className="game-info-header">
          <span className="game-type">{getGameTypeLabel(fullGameData.gameType)}</span>
          <span className="game-date">
            {new Date(fullGameData.endedAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Use the existing GameSummary component */}
      <GameSummary
        history={transformedHistory}
        points={totalPoints}
        time={totalTime}
        maxPoints={maxPoints}
        duel={isDuel}
        data={duelData}
        multiplayerState={multiplayerState}
        button1Press={onBack}
        button1Text={text('backToHistory')}
        button2Press={null}
        button2Text=""
        hidden={false}
      />
    </div>
  );

  function getGameTypeLabel(gameType) {
    const types = {
      'singleplayer': text('singleplayer'),
      'ranked_duel': text('rankedDuel'),
      'unranked_multiplayer': text('multiplayer'),
      'private_multiplayer': text('privateGame')
    };
    return types[gameType] || gameType;
  }
}