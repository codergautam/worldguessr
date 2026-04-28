import React from 'react';
import { FaMapMarkedAlt } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';

export default function DailyCommunityMapsButton({ onClick, hidden, loggedOut }) {
  const { t: text } = useTranslation();
  if (hidden) return null;
  return (
    <button
      type="button"
      className={`daily-community-maps-btn${loggedOut ? ' daily-community-maps-btn--below-login' : ''}`}
      aria-label={text('communityMaps')}
      title={text('communityMaps')}
      onClick={onClick}
    >
      <FaMapMarkedAlt aria-hidden="true" />
      <span className="daily-community-maps-btn__label">{text('maps')}</span>
    </button>
  );
}
