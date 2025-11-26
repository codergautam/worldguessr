import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';

/**
 * PendingNameChangeModal
 *
 * Shown to users who have been forced to change their username due to an
 * inappropriate username report. They can still play singleplayer but not
 * multiplayer until their new name is approved.
 */
export default function PendingNameChangeModal({ session, onClose, isOpen = true }) {
  const { t: text } = useTranslation("common");
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);

  const checkExistingRequest = async () => {
    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/checkNameChangeStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: session?.token?.secret }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasPendingRequest) {
          setExistingRequest(data.request);
        }
      }
    } catch (err) {
      console.error('Error checking name change status:', err);
    }
  };

  // Check if there's an existing pending request
  useEffect(() => {
    if (isOpen) {
      checkExistingRequest();
    }
  }, [isOpen]);

  // Don't render if not open
  if (!isOpen) return null;

  const submitNameChange = async () => {
    if (!newUsername.trim()) {
      setError('Please enter a new username');
      return;
    }

    // Validate username format
    const trimmed = newUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      setError('Username must be between 3 and 20 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('Username can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/submitNameChange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: session?.token?.secret,
          newUsername: trimmed
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setExistingRequest({ requestedUsername: trimmed, status: 'pending' });
      } else {
        setError(data.message || 'Failed to submit name change');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>⚠️ Username Change Required</h2>
          {onClose && (
            <button onClick={onClose} style={styles.closeBtn}>×</button>
          )}
        </div>

        <div style={styles.body}>
          <p style={styles.description}>
            Your username has been flagged as inappropriate. You can still play singleplayer, but multiplayer is disabled until your new name is approved.
          </p>

          {session?.token?.pendingNameChangeReason && (
            <p style={styles.reason}>
              <strong>Reason:</strong> {session.token.pendingNameChangeReason}
            </p>
          )}

          {existingRequest?.status === 'pending' ? (
            <div style={styles.pendingBox}>
              <h3 style={styles.pendingTitle}>⏳ Awaiting Approval</h3>
              <p style={styles.pendingText}>
                Your requested username <strong>&quot;{existingRequest.requestedUsername}&quot;</strong> is being reviewed by our moderation team.
              </p>
              <p style={styles.pendingNote}>
                You will be able to play multiplayer once your new username is approved. This usually takes less than 7 days.
              </p>

              <div style={styles.divider}>
                <span>or submit a different name</span>
              </div>
            </div>
          ) : existingRequest?.status === 'rejected' ? (
            <div style={styles.rejectedBox}>
              <h3 style={styles.rejectedTitle}>❌ Name Rejected</h3>
              <p style={styles.rejectedText}>
                Your requested username <strong>&quot;{existingRequest.requestedUsername}&quot;</strong> was rejected.
              </p>
              {existingRequest.rejectionReason && (
                <p style={styles.rejectedReason}>
                  Reason: {existingRequest.rejectionReason}
                </p>
              )}
              <p style={styles.pendingNote}>
                Please choose a different username below.
              </p>
            </div>
          ) : null}

          {success && !existingRequest ? (
            <div style={styles.successBox}>
              <h3 style={styles.successTitle}>✅ Request Submitted</h3>
              <p style={styles.successText}>
                Your name change request has been submitted for review.
              </p>
            </div>
          ) : (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.label}>New Username:</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter new username..."
                  style={styles.input}
                  maxLength={20}
                  disabled={loading}
                />
                <span style={styles.hint}>3-20 characters, letters, numbers, underscores, and hyphens only</span>
              </div>

              {error && (
                <div style={styles.error}>
                  ❌ {error}
                </div>
              )}

              <button
                onClick={submitNameChange}
                disabled={loading || !newUsername.trim()}
                style={{
                  ...styles.submitBtn,
                  opacity: loading || !newUsername.trim() ? 0.5 : 1
                }}
              >
                {loading ? 'Submitting...' : 'Submit New Username'}
              </button>
            </>
          )}

          <p style={styles.contactInfo}>
            Need help? Contact <a href="mailto:support@worldguessr.com" style={styles.link}>support@worldguessr.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
  },
  modal: {
    backgroundColor: '#161b22',
    borderRadius: '12px',
    border: '1px solid #30363d',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  header: {
    padding: '20px',
    borderBottom: '1px solid #30363d',
    backgroundColor: '#0d1117',
    borderRadius: '12px 12px 0 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    color: '#ffa657',
    fontSize: '1.5rem',
    fontFamily: 'Lexend, sans-serif',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#6e7681',
    fontSize: '28px',
    cursor: 'pointer',
    padding: '0',
    lineHeight: '1',
  },
  body: {
    padding: '20px',
  },
  description: {
    color: '#b1bac4',
    fontSize: '1rem',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  reason: {
    backgroundColor: '#21262d',
    padding: '12px',
    borderRadius: '6px',
    color: '#e6edf3',
    marginBottom: '20px',
    fontSize: '0.9rem',
  },
  pendingBox: {
    backgroundColor: 'rgba(210, 153, 34, 0.1)',
    border: '1px solid #d29922',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  pendingTitle: {
    margin: '0 0 8px 0',
    color: '#d29922',
    fontSize: '1.1rem',
  },
  pendingText: {
    color: '#e6edf3',
    margin: '0 0 8px 0',
  },
  pendingNote: {
    color: '#b1bac4',
    fontSize: '0.9rem',
    margin: 0,
  },
  rejectedBox: {
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    border: '1px solid #f85149',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  rejectedTitle: {
    margin: '0 0 8px 0',
    color: '#f85149',
    fontSize: '1.1rem',
  },
  rejectedText: {
    color: '#e6edf3',
    margin: '0 0 8px 0',
  },
  rejectedReason: {
    color: '#f85149',
    fontStyle: 'italic',
    margin: '0 0 8px 0',
  },
  successBox: {
    backgroundColor: 'rgba(63, 185, 80, 0.1)',
    border: '1px solid #3fb950',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  successTitle: {
    margin: '0 0 8px 0',
    color: '#3fb950',
    fontSize: '1.1rem',
  },
  successText: {
    color: '#e6edf3',
    margin: 0,
  },
  divider: {
    textAlign: 'center',
    color: '#6e7681',
    margin: '20px 0',
    fontSize: '0.85rem',
  },
  inputGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    color: '#e6edf3',
    marginBottom: '8px',
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '1rem',
    border: '1px solid #30363d',
    borderRadius: '6px',
    backgroundColor: '#0d1117',
    color: '#e6edf3',
    fontFamily: 'Lexend, sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
  },
  hint: {
    display: 'block',
    color: '#6e7681',
    fontSize: '0.8rem',
    marginTop: '4px',
  },
  error: {
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    border: '1px solid #f85149',
    borderRadius: '6px',
    padding: '12px',
    color: '#f85149',
    marginBottom: '16px',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#3fb950',
    color: '#0d1117',
    cursor: 'pointer',
    fontFamily: 'Lexend, sans-serif',
    marginBottom: '20px',
  },
  contactInfo: {
    textAlign: 'center',
    color: '#6e7681',
    fontSize: '0.85rem',
    margin: 0,
  },
  link: {
    color: '#58a6ff',
  },
};

