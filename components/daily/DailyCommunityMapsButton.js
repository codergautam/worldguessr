import React from 'react';
import { FaMapMarkedAlt } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';

// `covered` and `loggedOut` are gone. Both were positioning concerns: the modal
// cover is now one `visibility` on the .hudCorner column that owns this button,
// and `loggedOut` picked a variant whose only job was dodging the taller login
// button — which the column now stacks it under for free.
export default function DailyCommunityMapsButton({ onClick, hidden }) {
  const { t: text } = useTranslation();
  if (hidden) return null;
  return (
    <button
      type="button"
      className="daily-community-maps-btn"
      aria-label={text('communityMaps')}
      title={text('communityMaps')}
      onClick={onClick}
    >
      <FaMapMarkedAlt aria-hidden="true" />
      <span className="daily-community-maps-btn__label">{text('maps')}</span>
    </button>
  );
}
