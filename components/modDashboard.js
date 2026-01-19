import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';
import GameHistory from './gameHistory';
import HistoricalGameView from './historicalGameView';
import ReportActionButtons from './ReportActionButtons';
import styles from '../styles/modDashboard.module.css';

export default function ModDashboard({ session }) {
  const { t: text } = useTranslation("common");
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'reports', 'nameReview'
  const [usernameInput, setUsernameInput] = useState('');
  const [targetUser, setTargetUser] = useState(null);
  const [userHistory, setUserHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);

  // Reports state
  const [groupedReports, setGroupedReports] = useState([]);
  const [flatReports, setFlatReports] = useState([]);
  const [isGrouped, setIsGrouped] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(null);
  const [reportsStats, setReportsStats] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('pending');
  const [selectedReason, setSelectedReason] = useState('all'); // 'all', 'cheating', 'inappropriate_username', 'other'
  const [gameLoading, setGameLoading] = useState(false);
  const [reportedUserId, setReportedUserId] = useState(null);
  const [reportsPagination, setReportsPagination] = useState({ page: 1, totalPages: 1, totalCount: 0, hasMore: false });

  // User history reports pagination
  const [userReportsPage, setUserReportsPage] = useState(1);
  const USER_REPORTS_PER_PAGE = 10;

  // Action modal state
  const [actionModal, setActionModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tempBanDuration, setTempBanDuration] = useState('7');
  const [actionReason, setActionReason] = useState(''); // Internal reason - NEVER shown to user
  const [actionPublicNote, setActionPublicNote] = useState(''); // Public note - shown to user
  const [skipEloRefund, setSkipEloRefund] = useState(false); // Option to skip ELO refund on permanent bans

  // Name review queue state
  const [nameRequests, setNameRequests] = useState([]);
  const [nameReviewStats, setNameReviewStats] = useState(null);
  const [nameReviewLoading, setNameReviewLoading] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState({}); // Object to track reasons by request ID

  // Focused report state (for viewing specific reports)
  const [focusedReport, setFocusedReport] = useState(null);
  
  // Highlighted report state (for briefly highlighting a report in the list)
  const [highlightedReportId, setHighlightedReportId] = useState(null);
  const [highlightedUserId, setHighlightedUserId] = useState(null);

  // Delete user state
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Multiple matches state (for ban evader detection)
  const [multipleMatches, setMultipleMatches] = useState(null);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsModerators, setAuditLogsModerators] = useState([]);
  const [auditLogsStats, setAuditLogsStats] = useState(null);
  const [auditLogsFilter, setAuditLogsFilter] = useState({ moderatorId: 'all', actionType: 'all' });
  const [auditLogsPagination, setAuditLogsPagination] = useState({ page: 1, totalPages: 1, totalCount: 0 });

  // Clear messages after delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Clear highlight after delay
  useEffect(() => {
    if (highlightedReportId || highlightedUserId) {
      const timer = setTimeout(() => {
        setHighlightedReportId(null);
        setHighlightedUserId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedReportId, highlightedUserId]);

  // View a specific report in the reports tab
  const viewReportInTab = async (report, keepModalOpen = true) => {
    if (keepModalOpen) {
      setFocusedReport(report);
    }
    setActiveTab('reports');
    
    // Set highlight for the report/user group
    setHighlightedReportId(report._id);
    setHighlightedUserId(report.reportedUser?.accountId);
    
    // Set status filter to match the report's status or 'all' to ensure it's visible
    const status = report.status === 'pending' ? 'pending' : 'all';
    setSelectedStatus(status);
    setSelectedReason('all'); // Reset reason filter when viewing a specific report
    
    // Fetch reports - the highlight will show if report is on page 1
    // For pending (grouped), we highlight the user group
    // For historical (flat), we'd need to find the right page
    await fetchReports(status, 'all', 1);
    
    // Scroll to highlighted element after a short delay
    setTimeout(() => {
      const highlightedEl = document.querySelector('[data-highlighted="true"]');
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Check if user is staff - must be after all hooks
  if (!session?.token?.staff) {
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

  const lookupUser = async () => {
    if (!usernameInput.trim()) {
      setError('Please enter a username');
      return;
    }

    // Switch to Users tab when searching
    setActiveTab('users');
    setSelectedGame(null);
    setLoading(true);
    setError(null);
    setTargetUser(null);
    setUserHistory(null);
    setMultipleMatches(null);

    try {
      const response = await fetch(window.cConfig?.apiUrl + '/api/mod/userLookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          username: usernameInput.trim(),
          includeHistory: true
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check if multiple matches were found (ban evader detection)
        if (data.multipleMatches) {
          setMultipleMatches(data);
          setError(null);
        } else {
          setTargetUser(data.targetUser);
          setUserHistory(data.history);
          setUserReportsPage(1); // Reset reports pagination

          // Show notice if found by past name
          if (data.foundByPastName) {
            setSuccessMessage(`Found user by past name "${data.searchedName}" → Current name: "${data.targetUser.username}"`);
          }
        }
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

  const fetchGameById = async (gameId, targetUserId = null, reportedAccountId = null) => {
    if (!gameId) return;

    setGameLoading(true);
    setError(null);
    setReportedUserId(reportedAccountId);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/gameDetails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          gameId: gameId,
          targetUserId: targetUserId
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedGame({ gameId: data.game.gameId, ...data.game });
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch game details');
      }
    } catch (error) {
      console.error('Error fetching game:', error);
      setError('Failed to fetch game details');
    } finally {
      setGameLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      lookupUser();
    }
  };

  const handleUsernameLookup = async (username) => {
    setSelectedGame(null);
    setUsernameInput(username);
    setActiveTab('users');
    setLoading(true);
    setError(null);
    setTargetUser(null);
    setUserHistory(null);
    setMultipleMatches(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/userLookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          username: username.trim(),
          includeHistory: true
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check if multiple matches were found
        if (data.multipleMatches) {
          setMultipleMatches(data);
          setError(null);
        } else {
          setTargetUser(data.targetUser);
          setUserHistory(data.history);
          setUserReportsPage(1); // Reset reports pagination
          // Update input if user was found by past name
          if (data.foundByPastName) {
            setUsernameInput(data.targetUser.username);
            setSuccessMessage(`Found user by past name "${data.searchedName}" → Current name: "${data.targetUser.username}"`);
          }
        }
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

  // Lookup user by accountId - more reliable, won't break after name changes
  const handleUserLookupById = async (accountId, displayName = null) => {
    setSelectedGame(null);
    if (displayName) setUsernameInput(displayName);
    setActiveTab('users');
    setLoading(true);
    setError(null);
    setTargetUser(null);
    setUserHistory(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/userLookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          accountId: accountId
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTargetUser(data.targetUser);
        setUserHistory(data.history);
        setUsernameInput(data.targetUser.username);
        setUserReportsPage(1); // Reset reports pagination
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
  const fetchReports = async (status = 'pending', reason = 'all', page = 1) => {
    setReportsLoading(true);
    setReportsError(null);

    const limit = 20;
    const skip = (page - 1) * limit;

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/getReports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          status: status === 'all' ? undefined : status,
          reason: reason === 'all' ? undefined : reason,
          showAll: status === 'all',
          limit,
          skip
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Ensure pendingByReason exists for backward compatibility with old server
        if (data.stats && !data.stats.pendingByReason) {
          data.stats.pendingByReason = {
            cheating: 0,
            inappropriate_username: 0,
            other: 0
          };
        }
        setReportsStats(data.stats);
        setIsGrouped(data.isGrouped);

        if (data.isGrouped) {
          setGroupedReports(data.groupedReports || []);
          setFlatReports([]);
        } else {
          setFlatReports(data.reports || []);
          setGroupedReports([]);
        }

        // Update pagination
        const totalCount = data.pagination?.total || 0;
        const totalPages = Math.ceil(totalCount / limit) || 1;
        setReportsPagination({
          page,
          totalPages,
          totalCount,
          hasMore: data.pagination?.hasMore || false
        });
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

  // Fetch name review queue
  const fetchNameReviewQueue = async () => {
    setNameReviewLoading(true);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/nameReviewQueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          limit: 50
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNameRequests(data.requests || []);
        setNameReviewStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching name review queue:', error);
    } finally {
      setNameReviewLoading(false);
    }
  };

  // Fetch audit logs
  const fetchAuditLogs = async (page = 1, filterOverrides = {}) => {
    setAuditLogsLoading(true);
    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/auditLogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session.token.secret,
          moderatorId: filterOverrides.moderatorId ?? auditLogsFilter.moderatorId,
          actionType: filterOverrides.actionType ?? auditLogsFilter.actionType,
          page,
          limit: 50
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setAuditLogs(data.logs);
      setAuditLogsModerators(data.moderators);
      setAuditLogsStats(data.stats);
      setAuditLogsPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'reports' && groupedReports.length === 0 && flatReports.length === 0) {
      fetchReports(selectedStatus, selectedReason);
    }
    if (tab === 'nameReview' && nameRequests.length === 0) {
      fetchNameReviewQueue();
    }
    if (tab === 'auditLogs' && auditLogs.length === 0) {
      fetchAuditLogs();
    }
  };

  const handleStatusFilterChange = (status) => {
    setSelectedStatus(status);
    // Reset reason filter when changing status (reason filter only applies to pending)
    if (status !== 'pending') {
      setSelectedReason('all');
    }
    fetchReports(status, status === 'pending' ? selectedReason : 'all', 1);
  };

  const handleReasonFilterChange = (reason) => {
    setSelectedReason(reason);
    fetchReports(selectedStatus, reason, 1);
  };

  const handleReportsPageChange = (newPage) => {
    fetchReports(selectedStatus, selectedReason, newPage);
  };

  // Handler for ReportActionButtons component
  const handleReportAction = (actionType, user, reportIds, options = {}) => {
    setActionModal({
      type: actionType,
      targetUser: user,
      reportIds: options.reportIds || reportIds,
      hasInappropriateUsername: options.hasInappropriateUsername || false
    });
  };

  // Take moderation action
  const takeAction = async (action, targetUserId, reportIds = []) => {
    if (!actionReason.trim()) {
      setError('Please provide a reason for this action');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const body = {
        secret: session?.token?.secret,
        action: action,
        targetUserId: targetUserId,
        reportIds: reportIds,
        reason: actionReason.trim(), // Internal reason
        publicNote: actionPublicNote.trim() // Shown to user
      };

      // Add duration for temp bans
      if (action === 'ban_temporary') {
        const days = parseInt(tempBanDuration);
        body.duration = days * 24 * 60 * 60 * 1000; // Convert to ms
        body.durationString = `${days} day${days !== 1 ? 's' : ''}`;
      }

      // Add skipEloRefund flag for permanent bans
      if (action === 'ban_permanent') {
        body.skipEloRefund = skipEloRefund;
      }

      const response = await fetch(window.cConfig.apiUrl + '/api/mod/takeAction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(data.message);
        setActionModal(null);
        setActionReason('');
        setActionPublicNote('');
        setSkipEloRefund(false);
        fetchReports(selectedStatus, selectedReason, reportsPagination.page); // Refresh reports
        // Also refresh user data if we're currently in user lookup tab
        if (targetUser && activeTab === 'users') {
          lookupUser();
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to take action');
      }
    } catch (error) {
      console.error('Error taking action:', error);
      setError('Network error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete user permanently
  const deleteUser = async () => {
    if (!deleteModal) return;

    if (deleteConfirmUsername.toLowerCase() !== deleteModal.username.toLowerCase()) {
      setError(`Username confirmation does not match. Type "${deleteModal.username}" to confirm.`);
      return;
    }

    if (!deleteReason.trim() || deleteReason.trim().length < 10) {
      setError('Please provide a reason (minimum 10 characters)');
      return;
    }

    setDeleteLoading(true);
    setError(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/deleteUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          targetUserId: deleteModal.id,
          confirmUsername: deleteConfirmUsername,
          reason: deleteReason.trim()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(data.message);
        setDeleteModal(null);
        setDeleteConfirmUsername('');
        setDeleteReason('');
        setTargetUser(null);
        setUserHistory(null);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Network error occurred');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Unban user
  const unbanUser = async (userId) => {
    if (!actionReason.trim()) {
      setError('Please provide a reason for unbanning');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/takeAction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          action: 'unban',
          targetUserId: userId,
          reason: actionReason.trim(), // Internal reason
          publicNote: actionPublicNote.trim() // Shown to user (usually empty for unbans)
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(data.message);
        setActionModal(null);
        setActionReason('');
        setActionPublicNote('');
        setSkipEloRefund(false);
        // Refresh user data
        lookupUser();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to unban user');
      }
    } catch (error) {
      console.error('Error unbanning user:', error);
      setError('Network error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  // Review name change
  const reviewNameChange = async (requestId, action) => {
    const rejectionReason = rejectionReasons[requestId] || '';

    if (action === 'reject' && !rejectionReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/mod/reviewNameChange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          requestId: requestId,
          action: action,
          rejectionReason: action === 'reject' ? rejectionReason.trim() : undefined
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(data.message);
        // Clear the rejection reason for this specific request
        setRejectionReasons(prev => {
          const updated = { ...prev };
          delete updated[requestId];
          return updated;
        });
        fetchNameReviewQueue(); // Refresh queue
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to review name change');
      }
    } catch (error) {
      console.error('Error reviewing name change:', error);
      setError('Network error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  // Render reporter stats badge
  const renderReporterStats = (stats, status) => {
    if (!stats) return null;
    const total = (stats.helpfulReports || 0) + (stats.unhelpfulReports || 0);

    const badges = [];

    // Add ban history badge if reporter has been banned before
    if (status?.hasBanHistory) {
      badges.push(
        <span key="ban-history" className={styles.reporterBanHistory}>
          banned
        </span>
      );
    }

    // Add reporter stats badge
    if (total === 0) {
      badges.push(<span key="new-reporter" className={styles.reporterStatsNew}>new reporter</span>);
    } else {
      const helpfulPercent = total > 0 ? Math.round((stats.helpfulReports / total) * 100) : 0;
      const isGoodReporter = helpfulPercent >= 50;
      badges.push(
        <span key="stats" className={`${styles.reporterStats} ${isGoodReporter ? styles.goodReporter : styles.badReporter}`}>
          ✓{stats.helpfulReports || 0} ✗{stats.unhelpfulReports || 0}
        </span>
      );
    }

    return <>{badges}</>;
  };

  // Render user moderation status badges (ban, temp ban, force name change)
  const renderUserStatusBadges = (status) => {
    if (!status) return null;
    const badges = [];

    if (status.pendingNameChange) {
      badges.push(
        <span key="namechange" className={styles.statusBadgeWarning} title="Pending name change">
          ✏️ Name Change
        </span>
      );
    }

    if (status.banned) {
      if (status.banType === 'temporary' && status.banExpiresAt) {
        const expiresDate = new Date(status.banExpiresAt);
        const now = new Date();
        const daysLeft = Math.ceil((expiresDate - now) / (1000 * 60 * 60 * 24));
        badges.push(
          <span key="tempban" className={styles.statusBadgeTempBan} title={`Temp ban expires: ${expiresDate.toLocaleDateString()}`}>
            ⏱️ {daysLeft}d left
          </span>
        );
      } else {
        badges.push(
          <span key="permban" className={styles.statusBadgeBanned} title="Permanently banned">
            ⛔ Banned
          </span>
        );
      }
    }

    return badges.length > 0 ? <span className={styles.userStatusBadges}>{badges}</span> : null;
  };

  // Render action modal
  const renderActionModal = () => {
    if (!actionModal) return null;

    const { type, targetUser, reportIds, hasInappropriateUsername } = actionModal;

    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h3>
              {type === 'mark_resolved' && '✅ Mark Resolved'}
              {type === 'ignore' && '🚫 Ignore Reports'}
              {type === 'ban_permanent' && '⛔ Permanent Ban'}
              {type === 'ban_temporary' && '⏱️ Temporary Ban'}
              {type === 'force_name_change' && '✏️ Force Name Change'}
              {type === 'unban' && '✅ Unban User'}
            </h3>
            <button className={styles.modalClose} onClick={() => {
              setActionModal(null);
              setSkipEloRefund(false);
            }}>×</button>
          </div>

          <div className={styles.modalBody}>
            <p><strong>Target User:</strong> {targetUser.username}</p>

            {type === 'ban_temporary' && (
              <div className={styles.formGroup}>
                <label>Ban Duration (days):</label>
                <select
                  value={tempBanDuration}
                  onChange={(e) => setTempBanDuration(e.target.value)}
                  className={styles.select}
                >
                  <option value="1">1 day</option>
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            )}

            {type === 'ban_permanent' && (
              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={skipEloRefund}
                    onChange={(e) => setSkipEloRefund(e.target.checked)}
                    style={{ marginRight: '8px', cursor: 'pointer' }}
                  />
                  Skip ELO refund (do not refund ELO to opponents)
                </label>
                <small style={{ color: '#6e7681', marginTop: '4px', display: 'block' }}>
                  By default, opponents who lost ELO to this user will be refunded. Check this to skip the refund.
                </small>
              </div>
            )}

            <div className={styles.formGroup}>
              <label>🔒 Internal Reason (required, NOT shown to user):</label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Internal reason for mod records only..."
                className={styles.textarea}
                rows={3}
              />
              <small style={{ color: '#6e7681', marginTop: '4px', display: 'block' }}>
                This is for mod records only. User will never see this.
              </small>
            </div>

            {/* Only show public note for ban/force name change actions - not for unban, ignore, or resolve */}
            {!['unban', 'ignore', 'mark_resolved'].includes(type) && (
              <div className={styles.formGroup}>
                <label>📢 Public Note (optional, SHOWN to user on their ban/name change banner):</label>
                <textarea
                  value={actionPublicNote}
                  onChange={(e) => setActionPublicNote(e.target.value)}
                  placeholder="Message shown to the user (e.g., 'Inappropriate behavior in multiplayer')..."
                  className={styles.textarea}
                  rows={2}
                />
                <small style={{ color: '#d29922', marginTop: '4px', display: 'block' }}>
                  ⚠️ This message WILL be displayed to the user. Keep it professional.
                </small>
              </div>
            )}

            {type === 'mark_resolved' && (
              <p className={styles.info}>
                ℹ️ This will mark the report(s) as resolved without taking punitive action on the user.
                The reporter will receive credit for a helpful report.
              </p>
            )}

            {type === 'ignore' && (
              <p className={styles.warning}>
                ⚠️ This will mark the report(s) as ignored and increment the reporter&apos;s unhelpful report count.
              </p>
            )}

            {type === 'force_name_change' && !hasInappropriateUsername && (
              <p className={styles.warning}>
                ⚠️ Force name change is typically only used for inappropriate username reports.
              </p>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button
              className={styles.cancelBtn}
              onClick={() => {
                setActionModal(null);
                setSkipEloRefund(false);
              }}
              disabled={actionLoading}
            >
              Cancel
            </button>
            <button
              className={`${styles.actionBtn} ${styles[type.replace('_', '')]}`}
              onClick={() => {
                if (type === 'unban') {
                  unbanUser(targetUser.id);
                } else {
                  takeAction(type, targetUser.id, reportIds);
                }
              }}
              disabled={actionLoading || !actionReason.trim()}
            >
              {actionLoading ? 'Processing...' : 'Confirm Action'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render user history section
  const renderUserHistory = () => {
    if (!userHistory) return null;

    const hasAnyHistory =
      (userHistory.banHistory && userHistory.banHistory.length > 0) ||
      (userHistory.usernameHistory && userHistory.usernameHistory.length > 0) ||
      (userHistory.eloRefunds && userHistory.eloRefunds.length > 0) ||
      (userHistory.reportsAgainst && userHistory.reportsAgainst.length > 0) ||
      (userHistory.reportsMade && userHistory.reportsMade.length > 0);

    return (
      <div className={styles.historySection}>
        <h3>📋 Moderation History</h3>

        {/* Summary */}
        <div className={styles.historySummary}>
          <span>Mod Actions: {userHistory.summary?.totalModerationActions || 0}</span>
          <span>Bans: {userHistory.summary?.totalBans || 0}</span>
          <span>Name Changes: {userHistory.summary?.totalNameChanges || 0}</span>
          <span>ELO Refunds: {userHistory.summary?.totalEloRefunds || 0} ({userHistory.summary?.totalEloRefunded || 0} ELO)</span>
          <span>Reports Against: {userHistory.summary?.totalReportsAgainst || 0}</span>
          <span>Reports Made: {userHistory.summary?.totalReportsMade || 0}</span>
        </div>

        {!hasAnyHistory && (
          <div className={styles.noHistory}>
            <p>No moderation history found for this user.</p>
            <p style={{ fontSize: '0.85rem', color: '#6e7681' }}>
              History will appear here after moderation actions are taken through this dashboard.
            </p>
          </div>
        )}

        {/* Ban History */}
        {userHistory.banHistory && userHistory.banHistory.length > 0 && (
          <div className={styles.historySubsection}>
            <h4>🚫 Ban History ({userHistory.banHistory.length})</h4>
            {userHistory.banHistory.map((ban, i) => (
              <div key={i} className={styles.historyItem}>
                <span className={`${styles.historyBadge} ${styles[ban.action.replace('_', '')]}`}>
                  {ban.action.replace(/_/g, ' ')}
                </span>
                <span className={styles.historyReason}>{ban.reason}</span>
                {ban.duration && <span className={styles.historyDuration}>({ban.duration})</span>}
                <span className={styles.historyMeta}>
                  by {ban.moderator} • {new Date(ban.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Username History */}
        {userHistory.usernameHistory && userHistory.usernameHistory.length > 0 && (
          <div className={styles.historySubsection}>
            <h4>✏️ Username Changes ({userHistory.usernameHistory.length})</h4>
            {userHistory.usernameHistory.map((change, i) => (
              <div key={i} className={styles.historyItem}>
                <span className={styles.nameChange}>
                  <span className={styles.oldName}>{change.oldName}</span>
                  <span className={styles.nameArrow}>→</span>
                  <span className={styles.newName}>{change.newName}</span>
                </span>
                <span className={`${styles.historyBadge} ${styles[change.action?.replace('_', '') || 'namechange']}`}>
                  {change.action?.replace(/_/g, ' ') || 'changed'}
                </span>
                <span className={styles.historyMeta}>
                  {new Date(change.changedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ELO Refunds */}
        {userHistory.eloRefunds && userHistory.eloRefunds.length > 0 && (
          <div className={styles.historySubsection}>
            <h4>💰 ELO Refunds ({userHistory.eloRefunds.length}) - Total: {userHistory.summary?.totalEloRefunded || 0} ELO</h4>
            <div style={{ fontSize: '0.85rem', color: '#6e7681', marginBottom: '10px' }}>
              ELO refunded from games against banned players
            </div>
            {userHistory.eloRefunds.map((refund, i) => (
              <div key={i} className={styles.historyItem}>
                <span className={styles.historyBadge} style={{ backgroundColor: '#28a745' }}>
                  +{refund.amount} ELO
                </span>
                <span className={styles.historyReason}>
                  from banned player: <strong>{refund.bannedUsername}</strong>
                </span>
                <span className={styles.historyMeta}>
                  New ELO: {refund.newElo} • {new Date(refund.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Reports Against This User */}
        {userHistory.reportsAgainst && userHistory.reportsAgainst.length > 0 && (
          <div className={styles.historySubsection}>
            <h4>🚩 Reports Against ({userHistory.reportsAgainst.length})</h4>
            {userHistory.reportsAgainst
              .slice((userReportsPage - 1) * USER_REPORTS_PER_PAGE, userReportsPage * USER_REPORTS_PER_PAGE)
              .map((report, i) => (
              <div
                key={report._id || i}
                className={styles.historyReportItem}
              >
                <span className={`${styles.statusBadge} ${styles[report.status]}`}>
                  {report.status.replace(/_/g, ' ')}
                </span>
                <span className={styles.reasonBadge}>{report.reason.replace(/_/g, ' ')}</span>
                <span className={styles.historyReason}>by {report.reportedBy?.username}</span>
                <span className={styles.historyMeta}>
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
                <span
                  className={styles.viewLink}
                  style={{ opacity: 1, cursor: 'pointer' }}
                  onClick={() => setFocusedReport(report)}
                >
                  View →
                </span>
              </div>
            ))}
            {/* Pagination for reports */}
            {userHistory.reportsAgainst.length > USER_REPORTS_PER_PAGE && (
              <div className={styles.historyPagination}>
                <button
                  className={styles.historyPageBtn}
                  onClick={() => setUserReportsPage(p => Math.max(1, p - 1))}
                  disabled={userReportsPage <= 1}
                >
                  ← Prev
                </button>
                <span className={styles.historyPageInfo}>
                  Page {userReportsPage} of {Math.ceil(userHistory.reportsAgainst.length / USER_REPORTS_PER_PAGE)}
                </span>
                <button
                  className={styles.historyPageBtn}
                  onClick={() => setUserReportsPage(p => Math.min(Math.ceil(userHistory.reportsAgainst.length / USER_REPORTS_PER_PAGE), p + 1))}
                  disabled={userReportsPage >= Math.ceil(userHistory.reportsAgainst.length / USER_REPORTS_PER_PAGE)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Reports Made By This User */}
        {userHistory.reportsMade && userHistory.reportsMade.length > 0 && (
          <div className={styles.historySubsection}>
            <h4>📝 Reports Made ({userHistory.reportsMade.length})</h4>
            {userHistory.reportsMade.slice(0, 10).map((report, i) => (
              <div
                key={report._id || i}
                className={styles.historyReportItem}
              >
                <span className={`${styles.statusBadge} ${styles[report.status]}`}>
                  {report.status.replace(/_/g, ' ')}
                </span>
                <span>against {report.reportedUser?.username}</span>
                <span className={styles.reasonBadge}>{report.reason.replace(/_/g, ' ')}</span>
                <span className={styles.historyMeta}>
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
                <span
                  className={styles.viewLink}
                  style={{ opacity: 1, cursor: 'pointer' }}
                  onClick={() => setFocusedReport(report)}
                >
                  View →
                </span>
              </div>
            ))}
            {userHistory.reportsMade.length > 10 && (
              <p style={{ color: '#6e7681', fontSize: '0.85rem', marginTop: '8px' }}>
                ... and {userHistory.reportsMade.length - 10} more reports
              </p>
            )}
          </div>
        )}

        {/* Full Moderation Log */}
        {userHistory.moderationLogs && userHistory.moderationLogs.length > 0 && (
          <div className={styles.historySubsection}>
            <h4>📜 Full Moderation Log ({userHistory.moderationLogs.length})</h4>
            {userHistory.moderationLogs.map((log, i) => (
              <div key={i} className={styles.historyItem}>
                <span className={`${styles.historyBadge} ${styles[log.actionType?.replace('_', '') || 'action']}`}>
                  {log.actionType?.replace(/_/g, ' ')}
                </span>
                <span className={styles.historyReason}>{log.reason}</span>
                {log.nameChange?.oldName && log.nameChange?.newName && (
                  <span className={styles.nameChange}>
                    ({log.nameChange.oldName} → {log.nameChange.newName})
                  </span>
                )}
                <span className={styles.historyMeta}>
                  by {log.moderator?.username} • {new Date(log.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
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
            setReportedUserId(null);
          }}
          onUsernameLookup={handleUsernameLookup}
          options={{ isModView: true, reportedUserId: reportedUserId }}
        />
      )}

      {/* Action Modal */}
      {renderActionModal()}

      {/* Focused Report Modal - shown on any tab */}
      {focusedReport && (
        <div className={styles.focusedReportOverlay} onClick={() => setFocusedReport(null)}>
          <div className={styles.focusedReportCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.focusedReportHeader}>
              <h3>📋 Report Details</h3>
              <button className={styles.focusedReportClose} onClick={() => setFocusedReport(null)}>×</button>
            </div>
            <div className={styles.focusedReportBody}>
              <div className={styles.reportMeta} style={{ marginBottom: '16px' }}>
                <span className={`${styles.statusBadge} ${styles[focusedReport.status]}`}>
                  {focusedReport.status?.replace(/_/g, ' ')}
                </span>
                <span className={styles.reasonBadge}>{focusedReport.reason?.replace(/_/g, ' ')}</span>
                <span className={styles.reportDate}>
                  {new Date(focusedReport.createdAt).toLocaleString()}
                </span>
              </div>

              <div className={styles.reportUsers} style={{ marginBottom: '16px' }}>
                <div className={styles.userInfo}>
                  <strong>Reporter:</strong>
                  <span
                    className={styles.username}
                    onClick={() => {
                      setFocusedReport(null);
                      handleUserLookupById(focusedReport.reportedBy?.accountId, focusedReport.reportedBy?.username);
                    }}
                  >
                    {focusedReport.reportedBy?.username}
                  </span>
                </div>
                <div className={styles.userInfo}>
                  <strong>Reported:</strong>
                  <span
                    className={styles.username}
                    onClick={() => {
                      setFocusedReport(null);
                      handleUserLookupById(focusedReport.reportedUser?.accountId, focusedReport.reportedUser?.username);
                    }}
                  >
                    {focusedReport.reportedUser?.username}
                  </span>
                </div>
              </div>

              <div className={styles.reportDescription} style={{ marginBottom: '16px' }}>
                <strong>Description:</strong>
                <p>{focusedReport.description}</p>
              </div>

              <div className={styles.reportGameInfo}>
                <span>
                  <strong>Game ID:</strong>{' '}
                  <span
                    className={styles.gameIdLink}
                    onClick={() => {
                      setFocusedReport(null);
                      fetchGameById(focusedReport.gameId, focusedReport.reportedUser?.accountId, focusedReport.reportedUser?.accountId);
                    }}
                  >
                    {focusedReport.gameId}
                  </span>
                </span>
                <span><strong>Type:</strong> {focusedReport.gameType?.replace(/_/g, ' ')}</span>
              </div>

              {focusedReport.moderatorNotes && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#161b22', borderRadius: '6px' }}>
                  <strong>Moderator Notes:</strong>
                  <p style={{ margin: '8px 0 0 0' }}>{focusedReport.moderatorNotes}</p>
                </div>
              )}

              {focusedReport.reviewedBy?.username && (
                <div style={{ marginTop: '12px', color: '#6e7681', fontSize: '0.85rem' }}>
                  Reviewed by {focusedReport.reviewedBy.username} on {new Date(focusedReport.reviewedAt).toLocaleString()}
                </div>
              )}

              {/* Action buttons for pending reports */}
              {focusedReport.status === 'pending' && (() => {
                // Get all pending reports against this user (from user history if available)
                const allPendingReportsAgainstUser = userHistory?.reportsAgainst
                  ?.filter(r => r.status === 'pending' && r.reportedUser?.accountId === focusedReport.reportedUser?.accountId)
                  || [focusedReport];
                const allPendingReportIds = allPendingReportsAgainstUser.map(r => r._id);
                
                return (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #30363d' }}>
                    {allPendingReportIds.length > 1 && (
                      <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(88, 166, 255, 0.1)', borderRadius: '6px', fontSize: '0.85rem', color: '#58a6ff' }}>
                        ℹ️ Action will apply to all {allPendingReportIds.length} pending reports against this user
                      </div>
                    )}
                  <ReportActionButtons
                    targetUser={{ id: focusedReport.reportedUser?.accountId, username: focusedReport.reportedUser?.username }}
                      reportIds={allPendingReportIds}
                      reports={allPendingReportsAgainstUser}
                    onAction={(actionType, user, reportIds, options) => {
                      setFocusedReport(null);
                      handleReportAction(actionType, user, reportIds, options);
                    }}
                  />
                </div>
                );
              })()}

              {/* Open in Reports Page button */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #30363d', textAlign: 'center' }}>
                <button
                  className={styles.refreshBtn}
                  onClick={() => {
                    const reportToView = focusedReport;
                    setFocusedReport(null);
                    viewReportInTab(reportToView, false);
                  }}
                  style={{ width: '100%' }}
                >
                  📋 Open in Reports Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ borderColor: '#da3633' }}>
            <div className={styles.modalHeader} style={{ background: 'linear-gradient(135deg, #da3633, #8b0000)' }}>
              <h3>🗑️ DELETE USER PERMANENTLY</h3>
              <button className={styles.modalClose} onClick={() => {
                setDeleteModal(null);
                setDeleteConfirmUsername('');
                setDeleteReason('');
              }}>×</button>
            </div>

            <div className={styles.modalBody}>
              <div style={{
                background: 'rgba(218, 54, 51, 0.15)',
                border: '2px solid #da3633',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <h4 style={{ color: '#f85149', margin: '0 0 12px 0' }}>⚠️ DANGER: This action is IRREVERSIBLE!</h4>
                <p style={{ color: '#f0883e', margin: '0 0 8px 0', fontSize: '0.9rem' }}>
                  Deleting user <strong style={{ color: '#fff' }}>{deleteModal.username}</strong> will permanently:
                </p>
                <ul style={{ color: '#b1bac4', margin: '0', paddingLeft: '20px', fontSize: '0.85rem' }}>
                  <li>Delete the user account and all profile data</li>
                  <li>Delete all user statistics and progression history</li>
                  <li>Delete all maps created by this user</li>
                  <li>Anonymize user data in games (games preserved for other players)</li>
                  <li>Remove user from all friend lists</li>
                  <li>Anonymize all reports made by/against this user</li>
                </ul>
              </div>

              <div className={styles.formGroup}>
                <label style={{ color: '#f85149' }}>
                  Type <strong>&quot;{deleteModal.username}&quot;</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmUsername}
                  onChange={(e) => setDeleteConfirmUsername(e.target.value)}
                  placeholder={`Type "${deleteModal.username}" exactly`}
                  className={styles.usernameInput}
                  style={{ borderColor: deleteConfirmUsername.toLowerCase() === deleteModal.username.toLowerCase() ? '#3fb950' : '#da3633' }}
                />
              </div>

              <div className={styles.formGroup}>
                <label>🔒 Reason for deletion (internal, minimum 10 characters):</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="GDPR request, user request, spam account, etc..."
                  className={styles.textarea}
                  rows={3}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setDeleteModal(null);
                  setDeleteConfirmUsername('');
                  setDeleteReason('');
                }}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className={styles.deleteUserBtn}
                onClick={deleteUser}
                disabled={
                  deleteLoading ||
                  deleteConfirmUsername.toLowerCase() !== deleteModal.username.toLowerCase() ||
                  deleteReason.trim().length < 10
                }
                style={{
                  opacity: (deleteConfirmUsername.toLowerCase() === deleteModal.username.toLowerCase() && deleteReason.trim().length >= 10) ? 1 : 0.5
                }}
              >
                {deleteLoading ? 'Deleting...' : '🗑️ PERMANENTLY DELETE USER'}
              </button>
            </div>
          </div>
        </div>
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

          {/* Success/Error Messages */}
          {successMessage && (
            <div className={styles.successMessage}>✅ {successMessage}</div>
          )}
          {error && (
            <div className={styles.errorMessage}>❌ {error}</div>
          )}

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
            <button
              className={`${styles.tab} ${activeTab === 'nameReview' ? styles.activeTab : ''}`}
              onClick={() => handleTabChange('nameReview')}
            >
              ✏️ Name Review
              {nameReviewStats?.pending > 0 && (
                <span className={styles.badge}>{nameReviewStats.pending}</span>
              )}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'auditLogs' ? styles.activeTab : ''}`}
              onClick={() => handleTabChange('auditLogs')}
            >
              📋 Audit Logs
            </button>
          </div>

          <div className={styles.searchSection}>
            <div className={styles.searchBox}>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search by username, email, or account ID..."
                className={styles.usernameInput}
                disabled={loading}
              />
              <button
                onClick={lookupUser}
                disabled={loading || !usernameInput.trim()}
                className={styles.searchBtn}
              >
                {loading ? 'Searching...' : '🔍 Lookup Player'}
              </button>
            </div>
          </div>

          {/* User Lookup Tab */}
          {activeTab === 'users' && (
            <>
              {/* Multiple Matches Warning (Ban Evader Detection) */}
              {multipleMatches && (
                <div className={styles.multipleMatchesSection}>
                  <div className={styles.multipleMatchesWarning}>
                    <h3>⚠️ Multiple Accounts Found!</h3>
                    <p>
                      <strong>{multipleMatches.matchCount} accounts</strong> are associated with the username &quot;<strong>{multipleMatches.searchTerm}</strong>&quot;.
                      This could indicate <span style={{ color: '#f85149' }}>ban evasion</span>.
                    </p>
                  </div>

                  <div className={styles.matchesList}>
                    {multipleMatches.matches.map((match, index) => (
                      <div
                        key={match._id}
                        className={`${styles.matchCard} ${match.banned ? styles.matchCardBanned : ''}`}
                        onClick={() => handleUserLookupById(match._id, match.username)}
                      >
                        <div className={styles.matchCardHeader}>
                          <span className={styles.matchNumber}>#{index + 1}</span>
                          <span className={styles.matchUsername}>{match.username}</span>
                          <div className={styles.matchBadges}>
                            {match.staff && <span className={styles.staffBadge}>STAFF</span>}
                            {match.banned && (
                              <span className={styles.bannedBadge}>
                                {match.banType === 'temporary' ? 'TEMP BANNED' : 'BANNED'}
                              </span>
                            )}
                            {match.pendingNameChange && (
                              <span className={styles.pendingNameBadge}>NAME CHANGE</span>
                            )}
                          </div>
                        </div>
                        <div className={styles.matchInfo}>
                          <span className={match.matchType === 'current_username' ? styles.matchTypeCurrent : styles.matchTypePast}>
                            {match.matchInfo}
                          </span>
                        </div>
                        <div className={styles.matchStats}>
                          <span>XP: {match.totalXp?.toLocaleString() || 0}</span>
                          <span>Elo: {match.elo || 1000}</span>
                          <span>Joined: {new Date(match.created_at).toLocaleDateString()}</span>
                        </div>
                        {/* {match.email && (
                          <div className={styles.matchEmail}>
                            📧 {match.email}
                          </div>
                        )} */}
                        <div className={styles.matchAction}>
                          Click to view full details →
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className={styles.clearMatchesBtn}
                    onClick={() => setMultipleMatches(null)}
                  >
                    Clear Results
                  </button>
                </div>
              )}

              {targetUser ? (
                <div className={styles.gameHistorySection}>
                  {/* User Info Card */}
                  <div className={styles.userCard}>
                    <div className={styles.userCardHeader}>
                      <h3>{targetUser.username}</h3>
                      <div className={styles.userBadges}>
                        {targetUser.staff && <span className={styles.staffBadge}>STAFF</span>}
                        {targetUser.supporter && <span className={styles.supporterBadge}>SUPPORTER</span>}
                        {targetUser.banned && (
                          <span className={styles.bannedBadge}>
                            {targetUser.banType === 'temporary' ? 'TEMP BANNED' : 'BANNED'}
                          </span>
                        )}
                        {targetUser.pendingNameChange && (
                          <span className={styles.pendingNameBadge}>PENDING NAME CHANGE</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.userStats}>
                      <span>XP: {targetUser.totalXp?.toLocaleString()}</span>
                      <span>Elo: {targetUser.elo}</span>
                      <span>Games: {targetUser.totalGamesPlayed}</span>
                      <span>Joined: {new Date(targetUser.created_at).toLocaleDateString()}</span>
                    </div>

                    <div className={styles.accountId}>
                      <span>Account ID: </span>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText(targetUser._id);
                          setSuccessMessage('Account ID copied to clipboard');
                        }}
                        title="Click to copy"
                        style={{ cursor: 'pointer' }}
                      >
                        {targetUser._id}
                      </code>
                    </div>

                    {/* {targetUser.email && (
                      <div className={styles.accountId}>
                        <span>Email: </span>
                        <code
                          onClick={() => {
                            navigator.clipboard.writeText(targetUser.email);
                            setSuccessMessage('Email copied to clipboard');
                          }}
                          title="Click to copy"
                          style={{ cursor: 'pointer' }}
                        >
                          {targetUser.email}
                        </code>
                      </div>
                    )} */}

                    {targetUser.banned && targetUser.banExpiresAt && (
                      <div className={styles.banInfo}>
                        Ban expires: {new Date(targetUser.banExpiresAt).toLocaleString()}
                      </div>
                    )}

                    {/* Moderation Actions */}
                    <div className={styles.userActions}>
                      {targetUser.banned ? (
                        <button
                          className={styles.unbanBtn}
                          onClick={() => setActionModal({
                            type: 'unban',
                            targetUser: { id: targetUser._id, username: targetUser.username }
                          })}
                        >
                          ✅ Unban User
                        </button>
                      ) : (
                        <>
                          <button
                            className={styles.banBtn}
                            onClick={() => setActionModal({
                              type: 'ban_permanent',
                              targetUser: { id: targetUser._id, username: targetUser.username },
                              reportIds: []
                            })}
                          >
                            ⛔ Ban
                          </button>
                          <button
                            className={styles.tempBanBtn}
                            onClick={() => setActionModal({
                              type: 'ban_temporary',
                              targetUser: { id: targetUser._id, username: targetUser.username },
                              reportIds: []
                            })}
                          >
                            ⏱️ Temp Ban
                          </button>
                          <button
                            className={styles.forceNameBtn}
                            onClick={() => setActionModal({
                              type: 'force_name_change',
                              targetUser: { id: targetUser._id, username: targetUser.username },
                              reportIds: [],
                              hasInappropriateUsername: false
                            })}
                          >
                            ✏️ Force Name Change
                          </button>
                        </>
                      )}

                      {/* Delete User Button - Dangerous Action */}
                      {!targetUser.staff && (
                        <button
                          className={styles.deleteUserBtn}
                          onClick={() => setDeleteModal({
                            id: targetUser._id,
                            username: targetUser.username
                          })}
                        >
                          🗑️ Delete User
                        </button>
                      )}
                    </div>
                  </div>

                  {/* User History */}
                  {renderUserHistory()}

                  {/* Game History */}
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
                      <li><span>🔍</span><span>Enter a player&apos;s username to view their complete profile and history</span></li>
                      <li><span>📊</span><span>View detailed moderation history, bans, and username changes</span></li>
                      <li><span>⚖️</span><span>Take moderation actions: Ban, Temp Ban, Force Name Change, Unban</span></li>
                      <li><span>🎮</span><span>Review game history and investigate suspicious gameplay</span></li>
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
                    <span className={styles.statLabel}>Total</span>
                    <span className={styles.statValue}>{reportsStats.total}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Pending</span>
                    <span className={`${styles.statValue} ${styles.pending}`}>{reportsStats.pending}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Dismissed</span>
                    <span className={styles.statValue}>{reportsStats.dismissed}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Action Taken</span>
                    <span className={`${styles.statValue} ${styles.actionTaken}`}>{reportsStats.action_taken}</span>
                  </div>
                </div>
              )}

              {/* Status Filter */}
              <div className={styles.filterBar}>
                <label>Status:</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => handleStatusFilterChange(e.target.value)}
                  className={styles.statusFilter}
                >
                  <option value="pending">Pending ({reportsStats?.pending || 0})</option>
                  <option value="all">All Reports ({reportsStats?.total || 0})</option>
                  <option value="dismissed">Dismissed ({reportsStats?.dismissed || 0})</option>
                  <option value="action_taken">Action Taken ({reportsStats?.action_taken || 0})</option>
                </select>

                {/* Report Type Filter - only show for pending */}
                {selectedStatus === 'pending' && (
                  <>
                    <label>Type:</label>
                    <select
                      value={selectedReason}
                      onChange={(e) => handleReasonFilterChange(e.target.value)}
                      className={styles.statusFilter}
                    >
                      <option value="all">All Types ({reportsStats?.pending || 0})</option>
                      <option value="cheating">🎮 Cheating ({reportsStats?.pendingByReason?.cheating || 0})</option>
                      <option value="inappropriate_username">📛 Inap. Name ({reportsStats?.pendingByReason?.inappropriate_username || 0})</option>
                      <option value="other">❓ Other ({reportsStats?.pendingByReason?.other || 0})</option>
                    </select>
                  </>
                )}

                <button onClick={() => fetchReports(selectedStatus, selectedReason, 1)} className={styles.refreshBtn}>
                  🔄 Refresh
                </button>
              </div>

              {/* Reports Pagination */}
              {reportsPagination.totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    onClick={() => handleReportsPageChange(reportsPagination.page - 1)}
                    disabled={reportsPagination.page <= 1 || reportsLoading}
                    className={styles.pageBtn}
                  >
                    ← Previous
                  </button>
                  <span className={styles.pageInfo}>
                    Page {reportsPagination.page} of {reportsPagination.totalPages}
                    {' '}({reportsPagination.totalCount} {isGrouped ? 'users' : 'reports'})
                  </span>
                  <button
                    onClick={() => handleReportsPageChange(reportsPagination.page + 1)}
                    disabled={reportsPagination.page >= reportsPagination.totalPages || reportsLoading}
                    className={styles.pageBtn}
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* Game Loading Overlay */}
              {gameLoading && (
                <div className={styles.gameLoadingOverlay}>
                  <div className={styles.gameLoadingContent}>
                    <div className={styles.loadingSpinner}></div>
                    <p>Loading game details...</p>
                  </div>
                </div>
              )}

              {/* Reports List */}
              {reportsLoading ? (
                <div className={styles.loadingText}>Loading reports...</div>
              ) : reportsError ? (
                <div className={styles.error}>❌ {reportsError}</div>
              ) : isGrouped && groupedReports.length === 0 ? (
                <div className={styles.noReports}>
                  <span style={{ fontSize: '48px', marginBottom: '16px' }}>📭</span>
                  <p>No pending reports</p>
                </div>
              ) : !isGrouped && flatReports.length === 0 ? (
                <div className={styles.noReports}>
                  <span style={{ fontSize: '48px', marginBottom: '16px' }}>📭</span>
                  <p>No reports found</p>
                </div>
              ) : isGrouped ? (
                // Grouped reports view (for pending)
                <div className={styles.reportsList}>
                  {groupedReports.map((group) => {
                    const isHighlighted = highlightedUserId === group.reportedUser.accountId;
                    return (
                    <div 
                      key={group.reportedUser.accountId} 
                      className={`${styles.reportGroup} ${isHighlighted ? styles.highlighted : ''}`}
                      data-highlighted={isHighlighted ? 'true' : undefined}
                    >
                      <div className={styles.reportGroupHeader}>
                        <div className={styles.reportGroupUser}>
                          <span
                            className={styles.username}
                            onClick={() => handleUserLookupById(group.reportedUser.accountId, group.reportedUser.username)}
                          >
                            {group.reportedUser.username}
                          </span>
                          {renderUserStatusBadges(group.reportedUser)}
                          <span className={styles.reportCountBadge}>
                            {group.reportCount} report{group.reportCount !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Action Buttons for Group */}
                        <ReportActionButtons
                          targetUser={{ id: group.reportedUser.accountId, username: group.reportedUser.username }}
                          reportIds={group.reports.map(r => r._id)}
                          reports={group.reports}
                          onAction={handleReportAction}
                        />
                      </div>

                      {/* Individual Reports */}
                      {group.reports.map((report) => (
                        <div key={report._id} className={styles.reportCard}>
                          <div className={styles.reportHeader}>
                            <div className={styles.reportMeta}>
                              <span className={styles.reasonBadge}>{report.reason.replace(/_/g, ' ')}</span>
                              <span className={styles.reportDate}>
                                {new Date(report.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className={styles.reportBody}>
                            <div className={styles.reportUsers}>
                              <div className={styles.userInfo}>
                                <strong>Reporter:</strong>
                                <span
                                  className={styles.username}
                                  onClick={() => handleUserLookupById(report.reportedBy.accountId, report.reportedBy.username)}
                                >
                                  {report.reportedBy.username}
                                </span>
                                {renderReporterStats(report.reporterStats, report.reporterStatus)}
                                {renderUserStatusBadges(report.reporterStatus)}
                              </div>
                            </div>

                            <div className={styles.reportDescription}>
                              <p>{report.description}</p>
                            </div>

                            <div className={styles.reportGameInfo}>
                              <span
                                className={styles.gameIdLink}
                                onClick={() => fetchGameById(report.gameId, group.reportedUser.accountId, group.reportedUser.accountId)}
                              >
                                🎮 View Game
                              </span>
                              <span>{report.gameType.replace(/_/g, ' ')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )})}
                </div>
              ) : (
                // Flat reports view (for historical)
                <div className={styles.reportsList}>
                  {flatReports.map((report) => {
                    const isHighlighted = highlightedReportId === report._id;
                    return (
                    <div 
                      key={report._id} 
                      className={`${styles.reportCard} ${isHighlighted ? styles.highlighted : ''}`}
                      data-highlighted={isHighlighted ? 'true' : undefined}
                    >
                      <div className={styles.reportHeader}>
                        <div className={styles.reportMeta}>
                          <span className={`${styles.statusBadge} ${styles[report.status]}`}>
                            {report.status.replace('_', ' ')}
                          </span>
                          {report.actionTaken && (
                            <span className={styles.actionBadge}>{report.actionTaken.replace(/_/g, ' ')}</span>
                          )}
                          <span className={styles.reportDate}>
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className={styles.reportBody}>
                        <div className={styles.reportUsers}>
                          <div className={styles.userInfo}>
                            <strong>Reporter:</strong>
                            <span className={styles.username} onClick={() => handleUserLookupById(report.reportedBy.accountId, report.reportedBy.username)}>
                              {report.reportedBy.username}
                            </span>
                            {renderReporterStats(report.reporterStats, report.reporterStatus)}
                            {renderUserStatusBadges(report.reporterStatus)}
                          </div>
                          <div className={styles.userInfo}>
                            <strong>Reported:</strong>
                            <span className={styles.username} onClick={() => handleUserLookupById(report.reportedUser.accountId, report.reportedUser.username)}>
                              {report.reportedUser.username}
                            </span>
                            {renderUserStatusBadges(report.reportedUserStatus)}
                          </div>
                        </div>

                        <div className={styles.reportReason}>
                          <span className={styles.reasonBadge}>{report.reason.replace(/_/g, ' ')}</span>
                        </div>

                        <div className={styles.reportDescription}>
                          <p>{report.description}</p>
                        </div>

                        {/* Moderation Info - shown for resolved/dismissed reports */}
                        {report.reviewedBy?.username && (
                          <div className={styles.moderationInfo}>
                            <div className={styles.modInfoHeader}>
                              <strong>Reviewed by:</strong> {report.reviewedBy.username}
                              {report.reviewedAt && (
                                <span className={styles.reviewDate}>
                                  {' '}on {new Date(report.reviewedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {report.moderatorNotes && (
                              <div className={styles.modNotes}>
                                <strong>Internal Notes:</strong>
                                <p>{report.moderatorNotes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              )}

              {/* Bottom Pagination */}
              {reportsPagination.totalPages > 1 && (
                <div className={styles.pagination} style={{ marginTop: '20px' }}>
                  <button
                    onClick={() => handleReportsPageChange(reportsPagination.page - 1)}
                    disabled={reportsPagination.page <= 1 || reportsLoading}
                    className={styles.pageBtn}
                  >
                    ← Previous
                  </button>
                  <span className={styles.pageInfo}>
                    Page {reportsPagination.page} of {reportsPagination.totalPages}
                    {' '}({reportsPagination.totalCount} {isGrouped ? 'users' : 'reports'})
                  </span>
                  <button
                    onClick={() => handleReportsPageChange(reportsPagination.page + 1)}
                    disabled={reportsPagination.page >= reportsPagination.totalPages || reportsLoading}
                    className={styles.pageBtn}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Name Review Tab */}
          {activeTab === 'nameReview' && (
            <div className={styles.reportsSection}>
              {/* Stats */}
              {nameReviewStats && (
                <div className={styles.statsBar}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Pending</span>
                    <span className={`${styles.statValue} ${styles.pending}`}>{nameReviewStats.pending}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Approved Today</span>
                    <span className={`${styles.statValue} ${styles.actionTaken}`}>{nameReviewStats.approvedToday}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Rejected Today</span>
                    <span className={styles.statValue}>{nameReviewStats.rejectedToday}</span>
                  </div>
                </div>
              )}

              <div className={styles.filterBar}>
                <button onClick={fetchNameReviewQueue} className={styles.refreshBtn}>
                  🔄 Refresh
                </button>
              </div>

              {nameReviewLoading ? (
                <div className={styles.loadingText}>Loading name review queue...</div>
              ) : nameRequests.length === 0 ? (
                <div className={styles.noReports}>
                  <span style={{ fontSize: '48px', marginBottom: '16px' }}>✅</span>
                  <p>No pending name changes to review</p>
                </div>
              ) : (
                <div className={styles.reportsList}>
                  {nameRequests.map((request) => (
                    <div key={request._id} className={styles.nameReviewCard}>
                      <div className={styles.nameReviewHeader}>
                        <div>
                          <span className={styles.oldName}>{request.user.currentUsername}</span>
                          <span className={styles.nameArrow}>→</span>
                          <span className={styles.newName}>{request.requestedUsername}</span>
                        </div>
                        {request.rejectionCount > 0 && (
                          <span className={styles.rejectionCount}>
                            {request.rejectionCount} previous rejection{request.rejectionCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <div className={styles.nameReviewBody}>
                        <p><strong>Reason for force change:</strong> {request.reason}</p>
                        <p className={styles.reportDate}>
                          Submitted: {new Date(request.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className={styles.nameReviewActions}>
                        <button
                          className={styles.approveBtn}
                          onClick={() => reviewNameChange(request._id, 'approve')}
                          disabled={actionLoading}
                        >
                          ✅ Approve
                        </button>
                        <div className={styles.rejectSection}>
                          <input
                            type="text"
                            placeholder="Rejection reason..."
                            value={rejectionReasons[request._id] || ''}
                            onChange={(e) => setRejectionReasons(prev => ({ ...prev, [request._id]: e.target.value }))}
                            className={styles.rejectInput}
                          />
                          <button
                            className={styles.rejectBtn}
                            onClick={() => reviewNameChange(request._id, 'reject')}
                            disabled={actionLoading || !(rejectionReasons[request._id] || '').trim()}
                          >
                            ❌ Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Audit Logs Tab */}
          {activeTab === 'auditLogs' && (
            <div className={styles.reportsSection}>
              {/* Stats */}
              {auditLogsStats && (
                <div className={styles.statsBar}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Total Actions</span>
                    <span className={styles.statValue}>{auditLogsStats.totalActions}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Unique Moderators</span>
                    <span className={styles.statValue}>{auditLogsStats.uniqueModerators}</span>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className={styles.filterBar}>
                <select
                  value={auditLogsFilter.moderatorId}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setAuditLogsFilter(prev => ({ ...prev, moderatorId: newValue }));
                    fetchAuditLogs(1, { moderatorId: newValue });
                  }}
                  className={styles.filterSelect}
                >
                  <option value="all">All Moderators</option>
                  {auditLogsModerators.map(mod => (
                    <option key={mod.accountId} value={mod.accountId}>
                      {mod.username} ({mod.actionCount} actions)
                    </option>
                  ))}
                </select>

                <select
                  value={auditLogsFilter.actionType}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setAuditLogsFilter(prev => ({ ...prev, actionType: newValue }));
                    fetchAuditLogs(1, { actionType: newValue });
                  }}
                  className={styles.filterSelect}
                >
                  <option value="all">All Action Types</option>
                  <option value="ban_permanent">⛔ Permanent Ban</option>
                  <option value="ban_temporary">⏱️ Temporary Ban</option>
                  <option value="unban">✅ Unban</option>
                  <option value="force_name_change">✏️ Force Name Change</option>
                  <option value="name_change_approved">👍 Name Change Approved</option>
                  <option value="name_change_rejected">👎 Name Change Rejected</option>
                  <option value="report_ignored">🚫 Report Ignored</option>
                  <option value="report_resolved">✔️ Report Resolved</option>
                  <option value="warning">⚠️ Warning</option>
                </select>

                <button onClick={() => fetchAuditLogs(1)} className={styles.refreshBtn}>
                  🔄 Refresh
                </button>
              </div>

              {/* Pagination */}
              {auditLogsPagination.totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    onClick={() => fetchAuditLogs(auditLogsPagination.page - 1)}
                    disabled={auditLogsPagination.page <= 1 || auditLogsLoading}
                    className={styles.pageBtn}
                  >
                    ← Previous
                  </button>
                  <span className={styles.pageInfo}>
                    Page {auditLogsPagination.page} of {auditLogsPagination.totalPages}
                    {' '}({auditLogsPagination.totalCount} total)
                  </span>
                  <button
                    onClick={() => fetchAuditLogs(auditLogsPagination.page + 1)}
                    disabled={auditLogsPagination.page >= auditLogsPagination.totalPages || auditLogsLoading}
                    className={styles.pageBtn}
                  >
                    Next →
                  </button>
                </div>
              )}

              {auditLogsLoading ? (
                <div className={styles.loadingText}>Loading audit logs...</div>
              ) : auditLogs.length === 0 ? (
                <div className={styles.noReports}>
                  <span style={{ fontSize: '48px', marginBottom: '16px' }}>📋</span>
                  <p>No audit logs found</p>
                </div>
              ) : (
                <div className={styles.reportsList}>
                  {auditLogs.map((log) => (
                    <div key={log._id} className={styles.auditLogCard}>
                      <div className={styles.auditLogHeader}>
                        <span className={styles.auditLogAction}>
                          {log.actionType === 'ban_permanent' && '⛔ Permanent Ban'}
                          {log.actionType === 'ban_temporary' && '⏱️ Temporary Ban'}
                          {log.actionType === 'unban' && '✅ Unban'}
                          {log.actionType === 'force_name_change' && '✏️ Force Name Change'}
                          {log.actionType === 'name_change_approved' && '👍 Name Approved'}
                          {log.actionType === 'name_change_rejected' && '👎 Name Rejected'}
                          {log.actionType === 'report_ignored' && '🚫 Report Ignored'}
                          {log.actionType === 'warning' && '⚠️ Warning'}
                        </span>
                        <span className={styles.auditLogDate}>
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className={styles.auditLogBody}>
                        <div className={styles.auditLogRow}>
                          <span className={styles.auditLogLabel}>Target:</span>
                          <span
                            className={styles.auditLogValue}
                            style={{ cursor: 'pointer', color: '#58a6ff' }}
                            onClick={() => {
                              setUsernameInput(log.targetUser.accountId);
                              lookupUser();
                            }}
                          >
                            {log.targetUser.username}
                          </span>
                        </div>
                        <div className={styles.auditLogRow}>
                          <span className={styles.auditLogLabel}>Moderator:</span>
                          <span className={styles.auditLogValue}>{log.moderator.username}</span>
                        </div>
                        {log.reason && (
                          <div className={styles.auditLogRow}>
                            <span className={styles.auditLogLabel}>Reason:</span>
                            <span className={styles.auditLogValue}>{log.reason}</span>
                          </div>
                        )}
                        {log.durationString && (
                          <div className={styles.auditLogRow}>
                            <span className={styles.auditLogLabel}>Duration:</span>
                            <span className={styles.auditLogValue}>{log.durationString}</span>
                          </div>
                        )}
                        {log.nameChange?.oldName && (
                          <div className={styles.auditLogRow}>
                            <span className={styles.auditLogLabel}>Name Change:</span>
                            <span className={styles.auditLogValue}>
                              {log.nameChange.oldName} → {log.nameChange.newName || '(pending)'}
                            </span>
                          </div>
                        )}
                        {log.eloRefund?.totalRefunded > 0 && (
                          <div className={styles.auditLogRow}>
                            <span className={styles.auditLogLabel}>ELO Refunded:</span>
                            <span className={styles.auditLogValue} style={{ color: '#3fb950' }}>
                              +{log.eloRefund.totalRefunded} to {log.eloRefund.opponentsAffected} player(s)
                            </span>
                          </div>
                        )}
                        {log.notes && (
                          <div className={styles.auditLogRow}>
                            <span className={styles.auditLogLabel}>Public Note:</span>
                            <span className={styles.auditLogValue} style={{ color: '#d29922' }}>{log.notes}</span>
                          </div>
                        )}
                        {log.relatedReports > 0 && (
                          <div className={styles.auditLogRow}>
                            <span className={styles.auditLogLabel}>Related Reports:</span>
                            <span className={styles.auditLogValue}>{log.relatedReports}</span>
                          </div>
                        )}
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
