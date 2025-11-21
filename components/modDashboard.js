import { useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import GameHistory from './gameHistory';
import HistoricalGameView from './historicalGameView';
import styles from '../styles/modDashboard.module.css';

export default function ModDashboard({ session }) {
  const { t: text } = useTranslation("common");
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'reports'
  const [usernameInput, setUsernameInput] = useState('');
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);

  // Reports state
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(null);
  const [reportsStats, setReportsStats] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('pending');

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

  // Fetch reports
  const fetchReports = async (status = 'pending') => {
    setReportsLoading(true);
    setReportsError(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/getReports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: session?.token?.secret,
          status: status === 'all' ? undefined : status,
          limit: 50,
          skip: 0
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data.reports);
        setReportsStats(data.stats);
      } else {
        const errorData = await response.json();
        setReportsError(errorData.message || 'Failed to fetch reports');
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      setReportsError('Network error occurred');
    } finally {
      setReportsLoading(false);
    }
  };

  // Load reports when switching to reports tab
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'reports' && reports.length === 0) {
      fetchReports(selectedStatus);
    }
  };

  // Handle status filter change
  const handleStatusFilterChange = (status) => {
    setSelectedStatus(status);
    fetchReports(status);
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
              <p>Search and review player game history and reports</p>
              <span className={styles.badge}>Staff Only</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabNavigation}>
            <button
              className={`${styles.tab} ${activeTab === 'users' ? styles.activeTab : ''}`}
              onClick={() => handleTabChange('users')}
            >
              👤 User Lookup
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'reports' ? styles.activeTab : ''}`}
              onClick={() => handleTabChange('reports')}
            >
              🚩 Reports
              {reportsStats?.pending > 0 && (
                <span className={styles.badge}>{reportsStats.pending}</span>
              )}
            </button>
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

          {/* User Lookup Tab */}
          {activeTab === 'users' && (
            <>
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
            </>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className={styles.reportsSection}>
              {/* Stats Summary */}
              {reportsStats && (
                <div className={styles.statsBar}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Total Reports</span>
                    <span className={styles.statValue}>{reportsStats.total}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Pending</span>
                    <span className={`${styles.statValue} ${styles.pending}`}>{reportsStats.pending}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Reviewed</span>
                    <span className={styles.statValue}>{reportsStats.reviewed}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Action Taken</span>
                    <span className={`${styles.statValue} ${styles.actionTaken}`}>{reportsStats.action_taken}</span>
                  </div>
                </div>
              )}

              {/* Status Filter */}
              <div className={styles.filterBar}>
                <label>Filter by status:</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => handleStatusFilterChange(e.target.value)}
                  className={styles.statusFilter}
                >
                  <option value="all">All Reports</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="action_taken">Action Taken</option>
                </select>
                <button onClick={() => fetchReports(selectedStatus)} className={styles.refreshBtn}>
                  🔄 Refresh
                </button>
              </div>

              {/* Reports List */}
              {reportsLoading ? (
                <div className={styles.loading}>Loading reports...</div>
              ) : reportsError ? (
                <div className={styles.error}>❌ {reportsError}</div>
              ) : reports.length === 0 ? (
                <div className={styles.noReports}>
                  <span style={{ fontSize: '48px', marginBottom: '16px' }}>📭</span>
                  <p>No reports found</p>
                </div>
              ) : (
                <div className={styles.reportsList}>
                  {reports.map((report) => (
                    <div key={report._id} className={styles.reportCard}>
                      <div className={styles.reportHeader}>
                        <div className={styles.reportMeta}>
                          <span className={`${styles.statusBadge} ${styles[report.status]}`}>
                            {report.status.replace('_', ' ')}
                          </span>
                          <span className={styles.reportDate}>
                            {new Date(report.createdAt).toLocaleDateString()} {new Date(report.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className={styles.reportId}>
                          ID: {report._id.slice(-8)}
                        </div>
                      </div>

                      <div className={styles.reportBody}>
                        <div className={styles.reportUsers}>
                          <div className={styles.userInfo}>
                            <strong>Reporter:</strong>
                            <span
                              className={styles.username}
                              onClick={() => {
                                setActiveTab('users');
                                handleUsernameLookup(report.reportedBy.username);
                              }}
                            >
                              {report.reportedBy.username}
                            </span>
                          </div>
                          <div className={styles.userInfo}>
                            <strong>Reported:</strong>
                            <span
                              className={styles.username}
                              onClick={() => {
                                setActiveTab('users');
                                handleUsernameLookup(report.reportedUser.username);
                              }}
                            >
                              {report.reportedUser.username}
                            </span>
                          </div>
                        </div>

                        <div className={styles.reportReason}>
                          <strong>Reason:</strong>
                          <span className={styles.reasonBadge}>
                            {report.reason.replace('_', ' ')}
                          </span>
                        </div>

                        <div className={styles.reportDescription}>
                          <strong>Description:</strong>
                          <p>{report.description}</p>
                        </div>

                        <div className={styles.reportGameInfo}>
                          <span><strong>Game ID:</strong> {report.gameId}</span>
                          <span><strong>Type:</strong> {report.gameType.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}