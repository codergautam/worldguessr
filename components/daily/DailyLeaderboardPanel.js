import React from 'react';
import { useTranslation } from '@/components/useTranslations';

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return <span style={{ opacity: 0.7, fontSize: '0.85em' }}>#{rank}</span>;
}

export default function DailyLeaderboardPanel({ top10 = [], userRank, userScore, username, isLoggedIn, onSignIn }) {
  const { t: text } = useTranslation();
  const userInTop10 = typeof userRank === 'number' && userRank <= 10;

  return (
    <div className="daily-leaderboard">
      {top10.length === 0 && (
        <div className="daily-distribution-empty">{text('dailyLandingNoWinnersYet')}</div>
      )}
      {top10.map(entry => {
        const isMe = isLoggedIn && entry.username === username;
        return (
          <div key={entry.rank} className={`daily-leaderboard-row ${isMe ? 'self' : ''}`}>
            <div className="rank-name-group">
              <span className="rank">{medal(entry.rank)}</span>
              <span className="name">{entry.username}</span>
            </div>
            <span className="score">{entry.score.toLocaleString()}</span>
          </div>
        );
      })}

      {!userInTop10 && typeof userRank === 'number' && isLoggedIn && (
        <>
          <div className="daily-leaderboard-separator">
            <span>•••</span>
          </div>
          <div className="daily-leaderboard-row self">
            <div className="rank-name-group">
              <span className="rank">
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>#{userRank}</span>
              </span>
              <span className="name">{username || text('yourScore')}</span>
            </div>
            <span className="score">{Number(userScore || 0).toLocaleString()}</span>
          </div>
        </>
      )}

      {!isLoggedIn && (
        <>
          <div className="daily-leaderboard-separator">
            <span>•••</span>
          </div>
          <div className="daily-leaderboard-signin">
            <span style={{ marginRight: 8 }}>{text('signInToCompete')}</span>
            {onSignIn && (
              <button
                className="g2_green_button3"
                style={{ padding: '6px 14px', borderRadius: 10, fontSize: '0.9rem' }}
                onClick={onSignIn}
              >
                {text('signIn')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
