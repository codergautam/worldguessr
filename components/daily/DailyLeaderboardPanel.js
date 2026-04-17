import React from 'react';
import { useTranslation } from '@/components/useTranslations';

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '#' + rank;
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
            <span className="rank">{medal(entry.rank)}</span>
            <span className="name">{entry.username}</span>
            <span className="score">{entry.score.toLocaleString()}</span>
          </div>
        );
      })}

      {!userInTop10 && typeof userRank === 'number' && isLoggedIn && (
        <>
          <div className="daily-leaderboard-separator" />
          <div className="daily-leaderboard-row self">
            <span className="rank">#{userRank}</span>
            <span className="name">{username || text('yourScore')}</span>
            <span className="score">{Number(userScore || 0).toLocaleString()}</span>
          </div>
        </>
      )}

      {!isLoggedIn && (
        <>
          <div className="daily-leaderboard-separator" />
          <div className="daily-leaderboard-signin">
            {text('signInToCompete')}
            {onSignIn && (
              <>
                {' '}
                <button
                  className="g2_green_button3"
                  style={{ padding: '4px 12px', borderRadius: 8, marginLeft: 6 }}
                  onClick={onSignIn}
                >
                  {text('signIn')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
