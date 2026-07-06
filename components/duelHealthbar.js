import React, { useState, useEffect, useRef } from 'react';
import { getLeague } from './utils/leagues';
import Link from 'next/link';
import CountryFlag from './utils/countryFlag';
import { MdWifiOff } from 'react-icons/md';
import { useTranslation } from '@/components/useTranslations';

const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0
    ? 0
    : t === 1
    ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Team name block: one name per line ("You" / "& mate"). Teams are capped at
// 2 players, so the stack never grows past two lines.
// Flex column (NOT inline with block children): an inline .player-name keeps
// its own empty line-strut below block children — the "phantom third row".
const stackStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 0, maxWidth: '100%', minWidth: 0 };
const TeamNames = ({ names, dcLabel }) => {
  // Entries are { name, username, isMe, hasProfile, countryCode,
  // disconnected } (plain strings tolerated for safety).
  const entryOf = (n) => (typeof n === 'string' ? { name: n, countryCode: null } : n);
  return (
    // title: full names on hover — the truncated stack's only fallback.
    <span className="player-name" style={stackStyle} title={names.map((n) => entryOf(n).name).join(', ')}>
      {names.map((n, i) => {
        const entry = entryOf(n);
        const rowStyle = {
          lineHeight: 1.2, display: 'inline-flex', alignItems: 'center', gap: '5px',
          maxWidth: '100%', minWidth: 0,
          // Dim through the reconnect grace so the team reads short-handed.
          ...(entry.disconnected ? { opacity: 0.55 } : {}),
        };
        const inner = (
          <>
            {/* Ellipsis must live on the text box itself — it has no effect on a
                flex parent, which just hard-clipped long names mid-character. */}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {i > 0 ? `& ${entry.name}` : entry.name}
            </span>
            {entry.countryCode && <CountryFlag countryCode={entry.countryCode} />}
            {entry.disconnected && <MdWifiOff className="hb-dc" title={dcLabel} aria-label={dcLabel} />}
          </>
        );
        // Every registered player but yourself gets the same profile link
        // 1v1 opponents have (the multi-name stack used to drop it
        // entirely). Guests have no /user page — hasProfile keeps their
        // names as plain text instead of dead links.
        return entry.username && !entry.isMe && entry.hasProfile ? (
          <Link key={i} href={`/user?u=${encodeURIComponent(entry.username)}`} target="_blank"
            style={{ ...rowStyle, color: 'inherit', textDecoration: 'underline', pointerEvents: 'auto' }}>
            {inner}
          </Link>
        ) : (
          <span key={i} style={rowStyle}>{inner}</span>
        );
      })}
    </span>
  );
};

const HealthBar = ({ health, maxHealth, name, names = null, elo, isStartingDuel, isOpponent = false, countryCode = null, disconnected = false, hasProfile = true }) => {
  const { t: text } = useTranslation("common");
  const [displayHealth, setDisplayHealth] = useState(health);
  const [prevHealth, setPrevHealth] = useState(health);
  const [isAnimating, setIsAnimating] = useState(false);
  const [damageIndicator, setDamageIndicator] = useState(null);
  const prevHealthRef = useRef(health);

  const getHealthColor = (percentage) => {
    if (percentage > 60) return { bg: '#4ade80', glow: '#22c55e' }; // Green
    if (percentage > 30) return { bg: '#fbbf24', glow: '#f59e0b' }; // Yellow
    return { bg: '#ef4444', glow: '#dc2626' }; // Red
  };

  const healthPercentage = Math.max(0, (displayHealth / maxHealth) * 100);
  const colors = getHealthColor(healthPercentage);

  useEffect(() => {
    if (health !== prevHealthRef.current) {
      const damage = prevHealthRef.current - health;
      if (damage > 0) {
        setDamageIndicator(damage);
        setTimeout(() => setDamageIndicator(null), 2000);
      }
      setPrevHealth(prevHealthRef.current);
      prevHealthRef.current = health;
    }

    let startTime;
    const duration = 1200;
    setIsAnimating(true);

    const animateHealth = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = progress; // Simple linear interpolation
      const newDisplayHealth = Math.max(0, displayHealth + easedProgress * (health - displayHealth));

      setDisplayHealth(newDisplayHealth);

      if (progress < 1) {
        requestAnimationFrame(animateHealth);
      } else {
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animateHealth);
  }, [health]);

  return (
    <div className={`health-bar-container modern ${isAnimating ? 'animating' : ''}`}>
      {damageIndicator && (
        <div className="damage-indicator">
          -{damageIndicator}
        </div>
      )}
      
      { !isStartingDuel && (
        <div className="health-bar-wrapper">
          <div className="health-bar-bg">
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{
                  width: `${healthPercentage}%`,
                  backgroundColor: colors.bg,
                  boxShadow: `0 0 20px ${colors.glow}40, inset 0 2px 4px rgba(255,255,255,0.3)`,
                }}
              >
                <div className="health-bar-shine"></div>
                <div className="health-bar-pulse" style={{ backgroundColor: colors.glow }}></div>
              </div>
            </div>
            <div className="health-text">
              <span className="health-number">{Math.max(0, Math.round(displayHealth))}</span>
              <span className="health-max">/{maxHealth}</span>
            </div>
          </div>
        </div>
      )}
      
      <div className={`player-info-modern ${isStartingDuel ? 'starting' : ''}`}>
        <div className="player-name-wrapper">
          {Array.isArray(names) && names.length > 0 ? (
            <TeamNames names={names} dcLabel={text("disconnectedTag")} />
          ) : isOpponent && name && hasProfile ? (
            <Link
              href={`/user?u=${encodeURIComponent(name)}`}
              target="_blank"
              className="player-name"
              style={{
                color: 'white',
                textDecoration: 'underline',
                cursor: 'pointer',
                transition: 'opacity 0.2s ease',
                pointerEvents: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: disconnected ? 0.55 : undefined
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = disconnected ? '0.55' : '1';
              }}
            >
              {name}
              {countryCode && <CountryFlag countryCode={countryCode} />}
              {disconnected && <MdWifiOff className="hb-dc" title={text("disconnectedTag")} aria-label={text("disconnectedTag")} />}
            </Link>
          ) : (
            // Also the guest-opponent fallback (no /user page → no link), so
            // it keeps the same disconnect furniture as the linked branch.
            <span className="player-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: disconnected ? 0.55 : undefined }}>
              {name}
              {countryCode && <CountryFlag countryCode={countryCode} />}
              {disconnected && <MdWifiOff className="hb-dc" title={text("disconnectedTag")} aria-label={text("disconnectedTag")} />}
            </span>
          )}
          {elo && (
            <span 
              className="player-elo" 
              style={{
                color: getLeague(elo)?.light ?? getLeague(elo)?.color ?? "#60a5fa",
                textShadow: `0 0 10px ${getLeague(elo)?.light ?? getLeague(elo)?.color ?? "#60a5fa"}60`
              }}
            >
              ({elo})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default HealthBar;
