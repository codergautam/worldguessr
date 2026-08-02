import React, { useState, useEffect, useRef } from 'react';
import { getLeague } from './utils/leagues';
import Link from 'next/link';
import CountryFlag from './utils/countryFlag';
import { MdWifiOff } from 'react-icons/md';
import { useTranslation } from '@/components/useTranslations';
import { NO_PROFILE_LINKS } from '@/components/utils/externalLinks';

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

// Team name block: one name per line. Teams are capped at 2 players, so the
// stack never grows past two lines.
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
              {entry.name}
            </span>
            {entry.countryCode && <CountryFlag countryCode={entry.countryCode} />}
          </>
        );
        const leagueColor = typeof entry.elo === 'number'
          ? (getLeague(entry.elo)?.light ?? getLeague(entry.elo)?.color ?? '#60a5fa')
          : null;
        // Every registered player but yourself gets the same profile link
        // 1v1 opponents have (the multi-name stack used to drop it
        // entirely). Guests have no /user page — hasProfile keeps their
        // names as plain text instead of dead links. The link wraps only
        // name+flag so the elo suffix stays un-underlined, like the 1v1 bar.
        return (
          <span key={i} style={rowStyle}>
            {entry.username && !entry.isMe && entry.hasProfile && !NO_PROFILE_LINKS ? (
              <Link href={`/user?u=${encodeURIComponent(entry.username)}`} target="_blank"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%', minWidth: 0, color: 'inherit', textDecoration: 'underline', pointerEvents: 'auto' }}>
                {inner}
              </Link>
            ) : inner}
            {leagueColor && (
              <span className="player-elo" style={{ flex: 'none', color: leagueColor, textShadow: `0 0 10px ${leagueColor}60` }}>
                ({entry.elo})
              </span>
            )}
            {entry.disconnected && <MdWifiOff className="hb-dc" title={dcLabel} aria-label={dcLabel} />}
          </span>
        );
      })}
    </span>
  );
};

const HealthBar = ({ health, maxHealth, name, names = null, elo, isStartingDuel, isOpponent = false, countryCode = null, disconnected = false, hasProfile = true }) => {
  const { t: text } = useTranslation("common");
  const [isAnimating, setIsAnimating] = useState(false);
  const [damageIndicator, setDamageIndicator] = useState(null);
  const prevHealthRef = useRef(health);
  // What the number label currently shows. The rAF counter below owns it and
  // writes the DOM directly — React never renders mid-drain values anymore,
  // so a re-render during the 1.2s must repaint from here, not from state.
  const shownHealthRef = useRef(health);
  const numberRef = useRef(null);

  const getHealthColor = (percentage) => {
    if (percentage > 60) return { bg: '#4ade80', glow: '#22c55e' }; // Green
    if (percentage > 30) return { bg: '#fbbf24', glow: '#f59e0b' }; // Yellow
    return { bg: '#ef4444', glow: '#dc2626' }; // Red
  };

  // Render the TARGET width/color; the transition on .health-bar-fill
  // (globals.scss) walks them over the same 1.2s the old JS loop took.
  const healthPercentage = Math.max(0, (health / maxHealth) * 100);
  const colors = getHealthColor(healthPercentage);

  // HP drain. Every guard below exists because this ran unguarded on the answer
  // reveal — the single most frame-starved moment of a duel round (fullscreen
  // answer map resizing + flyTo + a WebSocket state burst all in the same tick).
  useEffect(() => {
    if (health !== prevHealthRef.current) {
      const damage = prevHealthRef.current - health;
      if (damage > 0) setDamageIndicator(damage);
      prevHealthRef.current = health;
    }

    const duration = 1200;
    const startValue = shownHealthRef.current;

    // The `.animating` window runs whether or not anything drains — it's the
    // bar's scale(1.05) + drop-shadow lift, and on mount that lift is part of
    // the round-1 "VS" intro. Same 1200ms in both branches.
    setIsAnimating(true);
    const animatingTimeout = setTimeout(() => setIsAnimating(false), duration);

    // Nothing to count: mount (shownHealthRef is seeded FROM health), or a
    // zero-damage round. Width/color are already at target, so the CSS
    // transition has nothing to walk either.
    if (startValue === health) {
      return () => clearTimeout(animatingTimeout);
    }

    // The bar itself drains via the CSS transition on .health-bar-fill; JS
    // only rolls the number label, writing textContent through the ref. The
    // old loop was a setDisplayHealth per frame — ~140 React commits per bar
    // per hit, all landing on the answer reveal, the single most
    // frame-starved moment of a duel round.
    let rafId = null;
    let startTime = null;

    const animateHealth = (timestamp) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Linear, matching the CSS transition's timing function
      const value = Math.max(0, startValue + progress * (health - startValue));
      shownHealthRef.current = value;
      if (numberRef.current) {
        const label = String(Math.max(0, Math.round(value)));
        if (numberRef.current.textContent !== label) numberRef.current.textContent = label;
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(animateHealth);
      } else {
        rafId = null;
      }
    };

    rafId = requestAnimationFrame(animateHealth);

    // Cancellation matters: a second HP change inside the 1.2s window starts
    // its count from wherever this one stopped (shownHealthRef), and unmount
    // mid-drain must not leave a dead component's rAF chain running.
    return () => {
      clearTimeout(animatingTimeout);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [health]);

  // Damage number lifetime, owned by its own effect so the timer is cancelable.
  // It used to be a bare setTimeout inside the drain effect, which meant an
  // unmount mid-round left it pending and firing into nothing.
  useEffect(() => {
    if (damageIndicator === null) return;
    const t = setTimeout(() => setDamageIndicator(null), 2000);
    return () => clearTimeout(t);
  }, [damageIndicator]);

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
              <span className="health-number" ref={numberRef}>{Math.max(0, Math.round(shownHealthRef.current))}</span>
              <span className="health-max">/{maxHealth}</span>
            </div>
          </div>
        </div>
      )}

      <div className={`player-info-modern ${isStartingDuel ? 'starting' : ''}`}>
        <div className="player-name-wrapper">
          {Array.isArray(names) && names.length > 0 ? (
            <TeamNames names={names} dcLabel={text("disconnectedTag")} />
          ) : isOpponent && name && hasProfile && !NO_PROFILE_LINKS ? (
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
                maxWidth: '100%',
                minWidth: 0,
                opacity: disconnected ? 0.55 : undefined
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = disconnected ? '0.55' : '1';
              }}
            >
              {/* Same ellipsis-on-the-text-box trick as TeamNames — text-overflow
                  is inert on the flex link itself, which hard-clipped long names
                  mid-character and pushed the flag out of view. */}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
              {countryCode && <CountryFlag countryCode={countryCode} marginRight="0" />}
              {disconnected && <MdWifiOff className="hb-dc" title={text("disconnectedTag")} aria-label={text("disconnectedTag")} />}
            </Link>
          ) : (
            // Also the guest-opponent fallback (no /user page → no link), so
            // it keeps the same disconnect furniture as the linked branch.
            <span className="player-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', minWidth: 0, opacity: disconnected ? 0.55 : undefined }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
              {countryCode && <CountryFlag countryCode={countryCode} marginRight="0" />}
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

// Memoized: GameUI re-renders every 100ms for the round clock, and these bars
// were re-rendering (players.find results, getLeague, Link, flag) on every
// tick for the whole match. Every prop is a primitive except `names` (2v2
// team stacks), whose entries are rebuilt each render — compare by value.
const namesEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = typeof a[i] === 'string' ? { name: a[i] } : a[i];
    const y = typeof b[i] === 'string' ? { name: b[i] } : b[i];
    if (x.name !== y.name || x.username !== y.username || x.isMe !== y.isMe
      || x.hasProfile !== y.hasProfile || x.countryCode !== y.countryCode
      || x.disconnected !== y.disconnected || x.elo !== y.elo) return false;
  }
  return true;
};

export default React.memo(HealthBar, (prev, next) =>
  prev.health === next.health &&
  prev.maxHealth === next.maxHealth &&
  prev.name === next.name &&
  prev.elo === next.elo &&
  prev.isStartingDuel === next.isStartingDuel &&
  prev.isOpponent === next.isOpponent &&
  prev.countryCode === next.countryCode &&
  prev.disconnected === next.disconnected &&
  prev.hasProfile === next.hasProfile &&
  namesEqual(prev.names, next.names)
);
