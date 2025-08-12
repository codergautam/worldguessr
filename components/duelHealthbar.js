import React, { useState, useEffect, useRef } from 'react';
import { getLeague } from './utils/leagues';

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

const HealthBar = ({ health, maxHealth, name, elo, start, isStartingDuel }) => {
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
      const easedProgress = easeOutBack(progress);
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
    <div className={`health-bar-container modern ${start ? 'start' : ''} ${isAnimating ? 'animating' : ''}`}>
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
          <span className="player-name">{name}</span>
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
