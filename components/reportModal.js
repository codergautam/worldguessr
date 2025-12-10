import { useState } from 'react';
import Modal from './ui/Modal';
import { useTranslation } from '@/components/useTranslations';
import { toast } from 'react-toastify';

export default function ReportModal({
  isOpen,
  onClose,
  reportedUser,
  gameId,
  gameType,
  session
}) {
  const { t: text } = useTranslation("common");
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wordCount, setWordCount] = useState(0);

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

    setSubmitting(true);

    try {
      const response = await fetch(window.cConfig.apiUrl + '/api/submitReport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: session.token.secret,
          reportedUserAccountId: reportedUser.accountId,
          reason,
          description: description.trim(),
          gameId,
          gameType
        }),
      });

      if (response.ok) {
        toast.success('Report submitted successfully. Our moderators will review it.');
        setReason('');
        setDescription('');
        setWordCount(0);
        onClose();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to submit report');
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Report ${reportedUser?.username || 'Player'}`}
      disableBackdropClose={true}
      actions={
        <>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            Cancel
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
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>
          Please provide details about why you are reporting this player. False reports may result in restrictions.
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
              fontFamily: '"Lexend", sans-serif',
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
              {wordCount}/100 words
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
              fontFamily: '"Lexend", sans-serif',
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
    </Modal>
  );
}

