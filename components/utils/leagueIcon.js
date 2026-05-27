import { FaShoePrints, FaCompass, FaShip, FaGlobe } from 'react-icons/fa';

const icons = {
  Trekker: FaShoePrints,
  Explorer: FaCompass,
  Voyager: FaShip,
  Nomad: FaGlobe,
};

export default function LeagueIcon({ league, size = 18, style }) {
  if (!league) return null;
  const Icon = icons[league.name] || FaShoePrints;
  return (
    <Icon
      size={size}
      style={{ color: league.color, flex: '0 0 auto', ...(style || {}) }}
      aria-label={league.name}
    />
  );
}
