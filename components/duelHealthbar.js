import React from 'react';

const HealthBar = ({ health, maxHealth, name, elo }) => {
  const healthPercentage = Math.max(0, (health / maxHealth) * 100);
  const barColor = healthPercentage > 20 ? 'green' : 'red';

  return (
    <div className="health-bar-container">
      <div className="health-bar">
        <div
          className="health-bar-fill"
          style={{
            width: `${healthPercentage}%`,
            backgroundColor: barColor,
            transition: 'width 0.5s ease',
          }}
        >
          <span className="health-text">{`${health}`}</span>
        </div>
      </div>
      <div className="player-info">
        <span className="player-name">{name}</span>
        <span className="player-elo">{`(${elo})`}</span>
      </div>
    </div>
  );
};

export default HealthBar;
