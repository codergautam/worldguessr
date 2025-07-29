import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';
import formatTime from '../utils/formatTime';

export default function GameHistory({ session, onGameClick }) {
  const { t: text } = useTranslation("common");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalGames: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const fetchGames = async (page = 1) => {
    setLoading(true);
    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/gameHistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          secret: session?.token?.secret,
          page,
          limit: 10
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setGames(data.games);
        setPagination(data.pagination);
      } else {
        console.error('Failed to fetch game history');
        setGames([]);
      }
    } catch (error) {
      console.error('Error fetching game history:', error);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token?.secret) {
      fetchGames(1);
    }
  }, [session?.token?.secret]);

  const getGameTypeDisplay = (gameType) => {
    const types = {
      'singleplayer': { label: text('singleplayer'), icon: '👤', color: '#4CAF50' },
      'ranked_duel': { label: text('rankedDuel'), icon: '⚔️', color: '#FF5722' },
      'unranked_multiplayer': { label: text('multiplayer'), icon: '👥', color: '#2196F3' },
      'private_multiplayer': { label: text('privateGame'), icon: '🔒', color: '#9C27B0' }
    };
    return types[gameType] || { label: gameType, icon: '🎮', color: '#757575' };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return text('justNow');
    if (diffMinutes < 60) return text('minutesAgo', { minutes: diffMinutes });
    if (diffHours < 24) return text('hoursAgo', { hours: diffHours });
    if (diffDays < 7) return text('daysAgo', { days: diffDays });
    
    return date.toLocaleDateString();
  };

  const getLocationDisplay = (location) => {
    if (location === 'all') return text('worldwide');
    // You can expand this to handle country codes and custom maps
    return location;
  };

  if (loading) {
    return (
      <div className="game-history-loading">
        <div className="loading-spinner"></div>
        <p>{text('loadingGameHistory')}</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="game-history-empty">
        <div className="empty-state">
          <span className="empty-icon">🎮</span>
          <h3>{text('noGamesPlayed')}</h3>
          <p>{text('startPlayingToSeeHistory')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-history">
      <div className="game-history-header">
        <h3>{text('gameHistory')}</h3>
        <span className="total-games">
          {text('totalGames', { count: pagination.totalGames })}
        </span>
      </div>

      <div className="games-list">
        {games.map((game) => {
          const gameTypeInfo = getGameTypeDisplay(game.gameType);
          const pointsPercentage = Math.round(
            (game.userStats.totalPoints / game.result.maxPossiblePoints) * 100
          );

          return (
            <div 
              key={game.gameId} 
              className="game-item"
              onClick={() => onGameClick(game)}
            >
              <div className="game-header">
                <div className="game-type">
                  <span 
                    className="game-type-icon"
                    style={{ color: gameTypeInfo.color }}
                  >
                    {gameTypeInfo.icon}
                  </span>
                  <span className="game-type-label">{gameTypeInfo.label}</span>
                </div>
                <div className="game-date">
                  {formatDate(game.endedAt)}
                </div>
              </div>

              <div className="game-stats">
                <div className="stat-item">
                  <span className="stat-label">{text('points')}</span>
                  <span className="stat-value">
                    {game.userStats.totalPoints.toLocaleString()}
                    <span className="stat-percentage">
                      ({pointsPercentage}%)
                    </span>
                  </span>
                </div>

                {game.userStats.totalXp > 0 && (
                  <div className="stat-item">
                    <span className="stat-label">XP</span>
                    <span className="stat-value">{game.userStats.totalXp}</span>
                  </div>
                )}

                <div className="stat-item">
                  <span className="stat-label">{text('duration')}</span>
                  <span className="stat-value">
                    {formatTime(game.totalDuration)}
                  </span>
                </div>
              </div>

              <div className="game-details">
                <div className="detail-item">
                  <span className="detail-label">{text('location')}</span>
                  <span className="detail-value">
                    {getLocationDisplay(game.settings.location)}
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">{text('rounds')}</span>
                  <span className="detail-value">{game.roundsPlayed}</span>
                </div>

                {game.multiplayer && (
                  <div className="detail-item">
                    <span className="detail-label">{text('players')}</span>
                    <span className="detail-value">{game.multiplayer.playerCount}</span>
                  </div>
                )}

                {game.userStats.finalRank > 1 && (
                  <div className="detail-item">
                    <span className="detail-label">{text('rank')}</span>
                    <span className="detail-value">#{game.userStats.finalRank}</span>
                  </div>
                )}
              </div>

              <div className="game-arrow">→</div>
            </div>
          );
        })}
      </div>

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={!pagination.hasPrevPage}
            onClick={() => fetchGames(pagination.currentPage - 1)}
          >
            ← {text('previous')}
          </button>

          <span className="pagination-info">
            {text('pageOf', { 
              current: pagination.currentPage, 
              total: pagination.totalPages 
            })}
          </span>

          <button
            className="pagination-btn"
            disabled={!pagination.hasNextPage}
            onClick={() => fetchGames(pagination.currentPage + 1)}
          >
            {text('next')} →
          </button>
        </div>
      )}
    </div>
  );
}