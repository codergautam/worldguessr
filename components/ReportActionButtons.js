import styles from '../styles/modDashboard.module.css';

/**
 * Reusable Report Action Buttons Component
 * 
 * Renders moderation action buttons for reports.
 * Used in both the Reports tab and User Lookup page.
 * 
 * @param {Object} props
 * @param {Object} props.targetUser - { id, username } of the reported user
 * @param {Array} props.reportIds - Array of report IDs to act upon
 * @param {Array} props.reports - Array of report objects (optional, for checking report types)
 * @param {Function} props.onAction - Callback when action button is clicked: (actionType, targetUser, reportIds, options) => void
 * @param {boolean} props.showForceNameChange - Whether to show the Force Name Change button (default: auto-detect from reports)
 * @param {boolean} props.compact - Whether to use compact layout (default: false)
 * @param {boolean} props.showResolve - Whether to show Resolve button (default: true)
 * @param {boolean} props.showIgnore - Whether to show Ignore button (default: true)
 * @param {boolean} props.showBan - Whether to show Ban buttons (default: true)
 */
export default function ReportActionButtons({
  targetUser,
  reportIds = [],
  reports = [],
  onAction,
  showForceNameChange,
  compact = false,
  showResolve = true,
  showIgnore = true,
  showBan = true,
}) {
  // Auto-detect if we should show Force Name Change based on report reasons
  const hasInappropriateUsername = showForceNameChange !== undefined
    ? showForceNameChange
    : reports.some(r => r.reason === 'inappropriate_username');

  // Get only inappropriate username report IDs for force name change action
  const inappropriateUsernameReportIds = reports
    .filter(r => r.reason === 'inappropriate_username')
    .map(r => r._id);

  const handleAction = (actionType, options = {}) => {
    if (onAction) {
      onAction(actionType, targetUser, options.reportIds || reportIds, options);
    }
  };

  if (compact) {
    return (
      <div className={styles.reportActionsCompact}>
        {showResolve && (
          <button
            className={styles.resolveBtnCompact}
            onClick={() => handleAction('mark_resolved')}
            title="Mark Resolved (report was valid but no action needed)"
          >
            ✅
          </button>
        )}
        {showIgnore && (
          <button
            className={styles.ignoreBtnCompact}
            onClick={() => handleAction('ignore')}
            title="Ignore (spam/invalid report)"
          >
            🚫
          </button>
        )}
        {showBan && (
          <>
            <button
              className={styles.banBtnCompact}
              onClick={() => handleAction('ban_permanent')}
              title="Permanent Ban"
            >
              ⛔
            </button>
            <button
              className={styles.tempBanBtnCompact}
              onClick={() => handleAction('ban_temporary')}
              title="Temporary Ban"
            >
              ⏱️
            </button>
          </>
        )}
        {hasInappropriateUsername && (
          <button
            className={styles.forceNameBtnCompact}
            onClick={() => handleAction('force_name_change', {
              reportIds: inappropriateUsernameReportIds.length > 0 ? inappropriateUsernameReportIds : reportIds,
              hasInappropriateUsername: true
            })}
            title="Force Name Change"
          >
            ✏️
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.groupActions}>
      {showResolve && (
        <button
          className={styles.resolveBtn}
          onClick={() => handleAction('mark_resolved')}
        >
          ✅ Resolve
        </button>
      )}
      {showIgnore && (
        <button
          className={styles.ignoreBtn}
          onClick={() => handleAction('ignore')}
        >
          🚫 Ignore
        </button>
      )}
      {showBan && (
        <>
          <button
            className={styles.banBtn}
            onClick={() => handleAction('ban_permanent')}
          >
            ⛔ Ban
          </button>
          <button
            className={styles.tempBanBtn}
            onClick={() => handleAction('ban_temporary')}
          >
            ⏱️ Temp Ban
          </button>
        </>
      )}
      {hasInappropriateUsername && (
        <button
          className={styles.forceNameBtn}
          onClick={() => handleAction('force_name_change', {
            reportIds: inappropriateUsernameReportIds.length > 0 ? inappropriateUsernameReportIds : reportIds,
            hasInappropriateUsername: true
          })}
        >
          ✏️ Force Name
        </button>
      )}
    </div>
  );
}

