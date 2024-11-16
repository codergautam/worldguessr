import React, { useState, useEffect } from 'react';
import { getLeague } from './utils/leagues';

const easeOutQuad = (t) => t * (2 - t);

const HealthBar = ({ health, maxHealth, name, elo, start, isStartingDuel }) => {
  const [displayHealth, setDisplayHealth] = useState(health);

  const barColor = displayHealth / maxHealth > 0.2 ? 'green' : 'red';

  useEffect(() => {
    let startTime;
    const duration = 1000; // 3 seconds

    const animateHealth = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuad(progress);
      const newDisplayHealth = displayHealth + easedProgress * (health - displayHealth);

      setDisplayHealth(newDisplayHealth);

      if (progress < 1) {
        requestAnimationFrame(animateHealth);
      }
    };

    requestAnimationFrame(animateHealth);
  }, [health]);

  const healthPercentage = Math.max(0, (displayHealth / maxHealth) * 100);

  return (
    <div className={`health-bar-container ${start ? 'start' : ''}`}>
      { !isStartingDuel && (
      <div className="health-bar">
        <div
          className="health-bar-fill"
          style={{
            width: `${healthPercentage}%`,
            backgroundColor: barColor,
          }}
        >
          <span className="health-text">{Math.round(displayHealth)}</span>
        </div>
      </div>
      )}
      <div className={`player-info ${isStartingDuel && 'starting'}`}>
        <span className="player-name">{name}

{elo && (
<span style={{color: getLeague(elo)?.light ?? getLeague(elo)?.color ?? "blue"}}> ({elo})</span>
)}

          </span>

      </div>
    </div>
  );
};

export default HealthBar;
