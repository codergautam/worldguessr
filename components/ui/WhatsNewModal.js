import { useEffect, useState } from 'react';
import Modal from './Modal';
import { isVersionHigher } from '../utils/versionCompare';

// Get the latest version from changelog
const getLatestVersion = (changelog) => {
  if (!changelog || changelog.length === 0) return null;

  // Find the highest version
  let latest = changelog[0];
  for (let i = 1; i < changelog.length; i++) {
    if (isVersionHigher(changelog[i].version, latest.version)) {
      latest = changelog[i];
    }
  }
  return latest;
};

// Simple markdown renderer for the changelog content
const renderMarkdown = (text) => {
  if (!text) return '';

  return text
    // Headers
    .replace(/### (.*$)/gim, '<h3 style="color: #4CAF50; margin: 16px 0 8px 0; font-size: 1.1rem;">$1</h3>')
    .replace(/## (.*$)/gim, '<h2 style="color: #4CAF50; margin: 20px 0 10px 0; font-size: 1.3rem;">$1</h2>')
    .replace(/# (.*$)/gim, '<h1 style="color: #4CAF50; margin: 24px 0 12px 0; font-size: 1.5rem;">$1</h1>')
    // Bold text - non-greedy match to handle multiple bolds on same line
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff; font-weight: 600;">$1</strong>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" style="color: #4CAF50; text-decoration: underline;">$1</a>')
    // Double line breaks become paragraph breaks with less spacing
    .replace(/\n\n/g, '</p><p style="margin: 8px 0;">')
    // Single line breaks become <br> with less spacing
    .replace(/\n/g, '<br style="line-height: 1.2;">')
    // Wrap in paragraph tags
    .replace(/^/, '<p style="margin: 8px 0;">')
    .replace(/$/, '</p>');
};

export default function WhatsNewModal({ changelog }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentEntry, setCurrentEntry] = useState(null);

  useEffect(() => {
    if (!changelog || changelog.length === 0) return;

    // Check if we should show the modal
    const checkVersion = () => {
      try {
        const storedVersion = localStorage.getItem('lastVersion');
        const latestEntry = getLatestVersion(changelog);

        console.log('Stored version:', storedVersion);
        console.log('Latest version:', latestEntry?.version);

        if (!latestEntry) return;

        // For testing - always show modal temporarily
        console.log('Forcing modal to show for testing');
        setCurrentEntry(latestEntry);
        setIsOpen(true);

        // Original logic (commented out for testing):
        // if (!storedVersion) {
        //   localStorage.setItem('lastVersion', latestEntry.version);
        //   console.log('First time user, setting version without modal');
        //   return;
        // }
        // if (isVersionHigher(latestEntry.version, storedVersion)) {
        //   console.log('Showing modal for version update');
        //   setCurrentEntry(latestEntry);
        //   setIsOpen(true);
        // } else {
        //   console.log('User is on latest version, no modal needed');
        // }
      } catch (error) {
        console.error('Error checking version:', error);
      }
    };

    checkVersion();
  }, [changelog]);

  const handleClose = () => {
    setIsOpen(false);

    // Update the stored version after showing the modal
    if (currentEntry) {
      localStorage.setItem('lastVersion', currentEntry.version);
    }
  };

  if (!currentEntry) return null;

  const actions = (
    <button onClick={handleClose}>
      Got it!
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`What's New!`}
      actions={actions}
      variant="default"
    >
      <div style={{
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: '1.2'
      }}>
        {currentEntry.date && (
          <div style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.6)',
            marginBottom: '16px',
            fontStyle: 'italic'
          }}>
            {currentEntry.version} Released on {currentEntry.date}
          </div>
        )}

        <div
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(currentEntry.change)
          }}
          style={{
            fontSize: '15px'
          }}
        />

        {currentEntry.postedBy && (
          <div style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.5)',
            marginTop: '20px',
            textAlign: 'right',
            fontStyle: 'italic'
          }}>
            — {currentEntry.postedBy}
          </div>
        )}
      </div>
    </Modal>
  );
}