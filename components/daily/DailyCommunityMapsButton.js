import React from 'react';
import { FaMapMarkedAlt } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';

export default function DailyCommunityMapsButton({ onClick, hidden, loggedIn }) {
  const { t: text } = useTranslation();
  if (hidden) return null;
  const label = text('communityMaps');
  return (
    <button
      type="button"
      className={`daily-community-maps-btn${loggedIn ? ' daily-community-maps-btn--loggedIn' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <FaMapMarkedAlt className="daily-community-maps-btn__icon" />
      <span className="daily-community-maps-btn__label">{label}</span>
    </button>
  );
}
