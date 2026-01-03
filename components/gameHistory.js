import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';
import formatTime from '../utils/formatTime';
import styles from '../styles/gameHistory.module.css';
import Link from 'next/link';
import CountryFlag from './utils/countryFlag';

export default function GameHistory({ session, onGameClick, targetUserSecret = null, targetUserData = null }) {
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
    if(typeof window === 'undefined' || !session?.token?.secret || !window.cConfig?.apiUrl) return;
    setLoading(true);
    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/gameHistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: targetUserSecret || session?.token?.secret,
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
    if (typeof window !== 'undefined' && session?.token?.secret && window.cConfig?.apiUrl) {
      fetchGames(1);
    }
  }, [session?.token?.secret, targetUserSecret]);

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
    // Handle country codes (2-letter uppercase codes)
    if (location && location.length === 2 && location === location.toUpperCase()) {
      // This could be enhanced to return actual country names
      return location;
    }
    // For community maps and other custom locations, return the name as-is
    return location || text('unknown');
  };


  if (loading) {
    return (
      <div className={styles.gameHistoryLoading}>
        <div className={styles.loadingSpinner}></div>
        <p>{text('loadingGameHistory')}</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className={styles.gameHistoryEmpty}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🎮</span>
          <h3>{text('noGamesPlayed')}</h3>
          <p>{text('startPlayingToSeeHistory')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.gameHistory}>
      <div className={styles.gameHistoryHeader}>
        <h3>
          {targetUserData ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Game History for{' '}
              {targetUserData.countryCode && <CountryFlag countryCode={targetUserData.countryCode} style={{ fontSize: '0.9em' }} />}
              {targetUserData.username}
            </span>
          ) : text('gameHistory')}
        </h3>
        {targetUserData && (
          <div className="mod-user-info" style={{
            fontSize: '0.9rem',
            color: '#666',
            marginTop: '5px',
            display: 'flex',
            gap: '15px',
            flexWrap: 'wrap'
          }}>
            <span>Total XP: {targetUserData.totalXp?.toLocaleString()}</span>
            <span>Elo: {targetUserData.elo}</span>
            <span>Games: {targetUserData.totalGamesPlayed}</span>
            <span>Joined: {new Date(targetUserData.created_at).toLocaleDateString()}</span>
            {targetUserData.banned && <span style={{color: '#f44336', fontWeight: 'bold'}}>BANNED</span>}
            {targetUserData.staff && <span style={{color: '#2196f3', fontWeight: 'bold'}}>STAFF</span>}
            {targetUserData.supporter && <span style={{color: '#ff9800', fontWeight: 'bold'}}>SUPPORTER</span>}
          </div>
        )}
        <span className={styles.totalGames}>
          {text('totalGames', { count: pagination.totalGames })}
        </span>
      </div>

      <div className={styles.gamesList}>
        {games.map((game) => {
          const gameTypeInfo = getGameTypeDisplay(game.gameType);

          return (
            <div
              key={game.gameId}
              className={styles.gameItem}
              onClick={() => onGameClick(game)}
            >
              <div className={styles.gameHeader}>
                <div className={styles.gameType}>
                  <span
                    className={styles.gameTypeIcon}
                    style={{ color: gameTypeInfo.color }}
                  >
                    {gameTypeInfo.icon}
                  </span>
                  <span className={styles.gameTypeLabel}>{gameTypeInfo.label}</span>
                </div>
                <div className={styles.gameDate}>
                  {formatDate(game.endedAt)}
                </div>
              </div>

              <div className={styles.gameStats}>
                {game.gameType === 'ranked_duel' ? (
                  <>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>{text('result')}</span>
                      <span className={styles.statValue} style={{
                        color: (game.userStats?.finalRank === 1 || game.userPlayer?.finalRank === 1) ? '#4CAF50' : '#F44336'
                      }}>
                        {(game.userStats?.finalRank === 1 || game.userPlayer?.finalRank === 1) ? text('victory') : text('defeat')}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>{text('elo')}</span>
                      <span className={styles.statValue} style={{
                        color: (game.userStats?.elo?.change >= 0 || game.userPlayer?.elo?.change >= 0) ? '#4CAF50' : '#F44336'
                      }}>
                        {((game.userStats?.elo?.change || game.userPlayer?.elo?.change) > 0) ? '+' : ''}{(game.userStats?.elo?.change || game.userPlayer?.elo?.change) ?? 0}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>{text('opponent')}</span>
                      <span className={styles.statValue} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {game.opponent?.username ? (
                          <>
                            {game.opponent.countryCode && <CountryFlag countryCode={game.opponent.countryCode} style={{ fontSize: '0.9em' }} />}
                            <Link
                              href={`/user?u=${encodeURIComponent(game.opponent.username)}`}
                              onClick={(e) => e.stopPropagation()}
                              target="_blank"
                              style={{ color: 'cyan', textDecoration: 'underline', cursor: 'pointer' }}
                            >
                              {game.opponent.username}
                            </Link>
                          </>
                        ) : (
                          text('unknown')
                        )}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>{text('duration')}</span>
                      <span className={styles.statValue}>
                        {formatTime(game.totalDuration)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>{text('points')}</span>
                    <span className={styles.statValue}>
                      {game.userStats.totalPoints.toLocaleString()}
                      <span className={styles.statPercentage}>
                        / {game.result.maxPossiblePoints.toLocaleString()}
                      </span>
                    </span>
                  </div>
                )}

                {game.userStats.totalXp > 0 && (
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>XP</span>
                    <span className={styles.statValue}>{game.userStats.totalXp}</span>
                  </div>
                )}

                {game.gameType !== 'ranked_duel' && (
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>{text('duration')}</span>
                    <span className={styles.statValue}>
                      {formatTime(game.totalDuration)}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.gameDetails}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{text('map')}</span>
                  <span className={styles.detailValue}>
                    {getLocationDisplay(game.settings.location)}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{text('rounds')}</span>
                  <span className={styles.detailValue}>{game.roundsPlayed}</span>
                </div>

                {game.multiplayer && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{text('players')}</span>
                    <span className={styles.detailValue}>{game.multiplayer.playerCount}</span>
                  </div>
                )}

              </div>

              <div className={styles.gameArrow}>→</div>
            </div>
          );
        })}
      </div>

      {pagination.totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.paginationBtn}
            disabled={!pagination.hasPrevPage}
            onClick={() => fetchGames(pagination.currentPage - 1)}
          >
            ← {text('previous')}
          </button>

          <span className={styles.paginationInfo}>
            {text('pageOf', {
              current: pagination.currentPage,
              total: pagination.totalPages
            })}
          </span>

          <button
            className={styles.paginationBtn}
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