import { FaShoePrints, FaCompass, FaShip, FaGlobeAmericas, FaRocket, FaTrophy } from 'react-icons/fa';

const icons = {
  Trekker: FaShoePrints,
  Explorer: FaCompass,
  Voyager: FaShip,
  Nomad: FaGlobeAmericas,
  Pathfinder: FaRocket,
  Master: FaTrophy,
  trekker: FaShoePrints,
  explorer: FaCompass,
  voyager: FaShip,
  nomad: FaGlobeAmericas,
  pathfinder: FaRocket,
  master: FaTrophy,
};

const gradId = 'wg-master-grad';

export default function LeagueIcon({ league, size = 18, showSubrank = true, style }) {
  if (!league) return null;
  const Icon = icons[league.name] || icons[league.icon] || FaShoePrints;
  const hasGradient = !!league.gradient;
  const roman = showSubrank ? league.roman : '';

  return (
    <span
      className="wg-leagueIcon"
      aria-label={league.label || league.name}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        flex: '0 0 auto',
        ...(style || {}),
      }}
    >
      <Icon
        size={size}
        style={hasGradient ? { fill: `url(#${gradId})` } : { color: league.color }}
        aria-hidden="true"
      />
      {hasGradient && (
        <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d6ff33" />
              <stop offset="50%" stopColor="#4cf2a0" />
              <stop offset="100%" stopColor="#00d4dc" />
            </linearGradient>
          </defs>
        </svg>
      )}
      {roman && (
        <span
          className="wg-leagueIcon__sub"
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: Math.round(-size * 0.06),
            bottom: Math.round(-size * 0.1),
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: Math.round(size * 0.46),
            height: Math.round(size * 0.46),
            padding: `0 ${Math.max(2, Math.round(size * 0.07))}px`,
            fontSize: Math.max(8, Math.round(size * 0.32)),
            fontWeight: 800,
            letterSpacing: '0.3px',
            lineHeight: 1,
            color: league.color,
            background: 'rgba(8, 12, 20, 0.92)',
            border: `${Math.max(1, Math.round(size * 0.04))}px solid ${league.color}`,
            borderRadius: Math.max(4, Math.round(size * 0.22)),
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.45)',
          }}
        >
          {roman}
        </span>
      )}
    </span>
  );
}
