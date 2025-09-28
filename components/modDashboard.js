import { useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import GameHistory from './gameHistory';
import HistoricalGameView from './historicalGameView';
import styles from '../styles/modDashboard.module.css';

export default function ModDashboard({ session }) {
  const { t: text } = useTranslation("common");
  const [usernameInput, setUsernameInput] = useState('');
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);

  // Check if user is staff
  if (!session?.token?.staff) {
    return (
      <div className={styles.unauthorized}>
        <div className={styles.unauthorizedContent}>
          <span className={styles.unauthorizedIcon}>🔒</span>
          <h2>Access Denied</h2>
          <p>You need staff privileges to access the mod dashboard.</p>
        </div>
      </div>
    );
  }

  const lookupUser = async () => {
    if (!usernameInput.trim()) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError(null);
    setTargetUser(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/userLookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: session?.token?.secret,
          username: usernameInput.trim()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTargetUser(data.targetUser);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'User not found');
      }
    } catch (error) {
      console.error('Error looking up user:', error);
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGameClick = (game) => {
    setSelectedGame(game);
  };

  const handleBackToHistory = () => {
    setSelectedGame(null);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      lookupUser();
    }
  };

  return (
    <div className={styles.modDashboard}>
      <div className={styles.header}>
        <h1>🛡️ Moderator Dashboard</h1>
        <p>Search and review player game history</p>
      </div>

      {!selectedGame ? (
        <>
          <div className={styles.searchSection}>
            <div className={styles.searchBox}>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter username to lookup..."
                className={styles.usernameInput}
                disabled={loading}
              />
              <button
                onClick={lookupUser}
                disabled={loading || !usernameInput.trim()}
                className={styles.searchBtn}
              >
                {loading ? '🔍 Searching...' : '🔍 Search'}
              </button>
            </div>

            {error && (
              <div className={styles.errorMessage}>
                ❌ {error}
              </div>
            )}
          </div>

          {targetUser ? (
            <div className={styles.gameHistorySection}>
              <GameHistory
                session={session}
                targetUserSecret={targetUser.secret}
                targetUserData={targetUser}
                onGameClick={handleGameClick}
              />
            </div>
          ) : (
            <div className={styles.instructionsSection}>
              <div className={styles.instructions}>
                <h3>💡 How to use the Mod Dashboard</h3>
                <ul>
                  <li>🔍 Enter a player's username to view their game history</li>
                  <li>📊 Click on any game to view detailed round-by-round analysis</li>
                  <li>🔒 Only staff members can access this dashboard</li>
                  <li>📋 Review player stats, game performance, and patterns</li>
                </ul>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.gameAnalysisSection}>
          <button
            onClick={handleBackToHistory}
            className={styles.backBtn}
          >
            ← Back to {targetUser?.username}'s History
          </button>

          <HistoricalGameView
            session={session}
            gameData={selectedGame}
            shown={true}
            setShown={handleBackToHistory}
          />
        </div>
      )}
    </div>
  );
}