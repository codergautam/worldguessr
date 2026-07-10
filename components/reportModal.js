import { useState } from 'react';
import Modal from './ui/Modal';
import { useTranslation } from '@/components/useTranslations';
import { toast } from 'react-toastify';

// Two shapes:
//   1v1 (unchanged callers): `reportedUser={accountId, username}` — straight
//      to the report form.
//   Team games: `candidates=[{accountId, username}, ...]` (everyone except
//      the reporter) — a picker step first. Multi-select: the co-cheating
//      duo is the core 2v2 case, so both opponents can be reported in one
//      pass (one Report doc per selection, shared reason/description; each
//      lands in its own mod-queue group and banning one or both stays at
//      mod discretion).
// Account-less selections (bots/guests) are never sent — the submit fakes
// success for them so bots stay indistinguishable.
export default function ReportModal({
  isOpen,
  onClose,
  reportedUser,
  candidates = null,
  gameId,
  gameType,
  session
}) {
  const { t: text } = useTranslation("common");
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const usePicker = Array.isArray(candidates) && candidates.length > 0;
  const [selectedIds, setSelectedIds] = useState([]); // candidate indexes (ids may be null for bots)
  const [pickerDone, setPickerDone] = useState(false);

  const selectedTargets = usePicker
    ? selectedIds.map(i => candidates[i]).filter(Boolean)
    : (reportedUser ? [reportedUser] : []);

  const resetAndClose = () => {
    setReason('');
    setDescription('');
    setWordCount(0);
    setSelectedIds([]);
    setPickerDone(false);
    onClose();
  };

  const handleDescriptionChange = (e) => {
    const text = e.target.value;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);

    // Only update if word count is <= 100
    if (words.length <= 100) {
      setDescription(text);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!reason) {
      toast.error('Please select a reason for the report');
      return;
    }

    if (!description.trim()) {
      toast.error('Please provide a description');
      return;
    }

    if (wordCount < 5) {
      toast.error('Please provide a more detailed description (at least 5 words)');
      return;
    }

    if (!session?.token?.secret) {
      toast.error('You must be logged in to submit a report');
      return;
    }

    if (!selectedTargets.length) {
      toast.error('Please select a player to report');
      return;
    }

    // Account-less targets (bots or guests): there is no account for mods to
    // act on, so no real report can exist. They're silently skipped — bots
    // must stay indistinguishable from real opponents.
    const realTargets = selectedTargets.filter(t => t?.accountId);

    if (realTargets.length === 0) {
      toast.success('Report submitted successfully. Our moderators will review it.');
      resetAndClose();
      return;
    }

    setSubmitting(true);

    try {
      // One report per selected player (shared reason/description). The mod
      // queue groups by reported user, so each target gets its own group.
      let failureMessage = null;
      for (const target of realTargets) {
        const response = await fetch(window.cConfig.apiUrl + '/api/submitReport', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: session.token.secret,
            reportedUserAccountId: target.accountId,
            reason,
            description: description.trim(),
            gameId,
            gameType
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          failureMessage = errorData.message || 'Failed to submit report';
        }
      }

      if (failureMessage && realTargets.length === 1) {
        toast.error(failureMessage);
      } else {
        if (failureMessage) {
          // Partial failure on a multi-target submit (e.g. one duplicate):
          // the rest went through — surface the one that didn't.
          toast.warn(failureMessage);
        }
        toast.success('Report submitted successfully. Our moderators will review it.');
        resetAndClose();
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Network error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const reasonOptions = [
    { value: 'inappropriate_username', label: 'Inappropriate Username' },
    { value: 'cheating', label: 'Cheating' },
    { value: 'other', label: 'Other' }
  ];

  const toggleCandidate = (index) => {
    setSelectedIds(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const inPickerStep = usePicker && !pickerDone;

  const title = inPickerStep
    ? 'Report a player'
    : `Report ${selectedTargets.map(t => t?.username).filter(Boolean).join(', ') || reportedUser?.username || 'Player'}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={title}
      disableBackdropClose={true}
      actions={
        inPickerStep ? (
          <>
            <button
              onClick={resetAndClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setPickerDone(true)}
              disabled={selectedIds.length === 0}
              style={{ opacity: selectedIds.length === 0 ? 0.5 : 1 }}
            >
              Next
            </button>
          </>
        ) : (
          <>
            <button
              onClick={usePicker ? () => setPickerDone(false) : resetAndClose}
              disabled={submitting}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              {usePicker ? 'Back' : 'Cancel'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason || !description.trim()}
              style={{
                opacity: (submitting || !reason || !description.trim()) ? 0.5 : 1
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </>
        )
      }
    >
      {inPickerStep ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>
            Who are you reporting? Select one or more players.
          </p>
          {candidates.map((c, index) => (
            <label
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: selectedIds.includes(index)
                  ? '1px solid rgba(76, 175, 80, 0.6)'
                  : '1px solid rgba(255, 255, 255, 0.2)',
                background: selectedIds.includes(index)
                  ? 'rgba(76, 175, 80, 0.12)'
                  : 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(index)}
                onChange={() => toggleCandidate(index)}
                style={{ cursor: 'pointer' }}
              />
              <span>{c.username || 'Player'}</span>
              {c.relationshipLabel && (
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                  {c.relationshipLabel}
                </span>
              )}
            </label>
          ))}
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>
          Please provide details about why you are reporting {selectedTargets.length > 1 ? 'these players' : 'this player'}. False reports may result in restrictions.
        </p>

        <div>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '500',
            color: 'white'
          }}>
            Reason for Report *
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              fontSize: '14px',
              fontFamily: '"Lexend", "Lexend Fallback", sans-serif',
              cursor: 'pointer'
            }}
          >
            <option value="" style={{ background: '#1a1a1a' }}>-- Select a reason --</option>
            {reasonOptions.map(option => (
              <option
                key={option.value}
                value={option.value}
                style={{ background: '#1a1a1a' }}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '500',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>Description *</span>
            <span style={{
              fontSize: '12px',
              color: wordCount > 100 ? '#ff6b6b' : 'rgba(255, 255, 255, 0.6)',
              fontWeight: 'normal'
            }}>
              {wordCount > 4 ? `${wordCount}/100 words` : `Need ${5 - wordCount} more ${5 - wordCount === 1 ? 'word' : 'words'}`}
            </span>
          </label>
          <textarea
            value={description}
            onChange={handleDescriptionChange}
            disabled={submitting}
            placeholder="Please describe the issue in detail..."
            rows={6}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              fontSize: '14px',
              fontFamily: '"Lexend", "Lexend Fallback", sans-serif',
              resize: 'vertical',
              minHeight: '120px'
            }}
          />
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.5)'
          }}>
            Provide as much detail as possible. Minimum 5 words required.
          </p>
        </div>

        <div style={{
          padding: '12px',
          background: 'rgba(255, 152, 0, 0.1)',
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.9)'
        }}>
          <strong>Note:</strong> This report will be reviewed by moderators. Abuse of the reporting system may result in action against your account.
        </div>
      </div>
      )}
    </Modal>
  );
}
