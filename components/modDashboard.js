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

  // Debug logging for staff check
  console.log('ModDashboard session:', session);
  console.log('Staff status:', session?.token?.staff);

  // Check if user is staff
  if (!session?.token?.staff) {
    console.log('User is not staff, showing access denied');
    return (
      <div className={styles.unauthorized}>
        <div className={styles.unauthorizedContent}>
          <span className={styles.unauthorizedIcon}>🔒</span>
          <h2>Access Denied</h2>
          <p>You need staff privileges to access the WorldGuessr mod dashboard.</p>
          <button
            className={styles.backBtn}
            onClick={() => window.location.href = '/'}
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  console.log('User is staff, rendering dashboard');

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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      lookupUser();
    }
  };

  const handleUsernameLookup = async (username) => {
    setSelectedGame(null);
    setUsernameInput(username);
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
          username: username.trim()
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

  return (
    <>
      {/* Game Analysis - Render outside main container when active */}
      {selectedGame && (
        <HistoricalGameView
          game={selectedGame}
          session={session}
          onBack={() => {
            setSelectedGame(null);
          }}
          onUsernameLookup={handleUsernameLookup}
        />
      )}

      {/* Main Dashboard */}
      {!selectedGame && (
        <div className={styles.modDashboard}>
          <div className={styles.header}>
            <div className={styles.worldGuessrLogo}>
              <div className={styles.logoIcon}>🌍</div>
              <h1>WorldGuessr Mod Dashboard</h1>
            </div>
            <div className={styles.subHeader}>
              <p>Search and review player game history</p>
              <span className={styles.badge}>Staff Only</span>
            </div>
          </div>
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
                {loading ? (
                  <>
                    <span className={styles.loading}></span>
                    Searching...
                  </>
                ) : (
                  <>
                    🔍 Search Player
                  </>
                )}
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
                <h3>Moderator Tools</h3>
                <ul>
                  <li>
                    <span>🔍</span>
                    <span>Enter a player's username to view their complete game history</span>
                  </li>
                  <li>
                    <span>📊</span>
                    <span>Click on any game to view detailed round-by-round analysis</span>
                  </li>
                  <li>
                    <span>🎯</span>
                    <span>Review player accuracy, streaks, and performance patterns</span>
                  </li>
                  <li>
                    <span>🌍</span>
                    <span>Analyze game locations and player behavior across different maps</span>
                  </li>
                  <li>
                    <span>⚡</span>
                    <span>Investigate suspicious gameplay and verify player statistics</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}