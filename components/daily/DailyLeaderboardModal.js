import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import config from '@/clientConfig';
import { useTranslation } from '@/components/useTranslations';

// Client-side pages over the single top-100 response — 100 rows of
// {rank,username,score} is one small fetch; no point round-tripping per page.
const PAGE_SIZE = 10;

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return <span style={{ opacity: 0.7, fontSize: '0.85em' }}>#{rank}</span>;
}

function ProfileNameLink({ username, className }) {
  if (!username) return null;
  // Poki hosts the build at a nested per-deploy CDN path with no /user route —
  // the target="_blank" link would open a 404 tab. Plain text instead.
  if (process.env.NEXT_PUBLIC_POKI === 'true') {
    return <span className={className}>{username}</span>;
  }
  return (
    <Link
      href={`/user?u=${encodeURIComponent(username)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {username}
    </Link>
  );
}

export default function DailyLeaderboardModal({ isOpen, onClose, date, userData = null, isLoggedIn, onSignIn }) {
  const { t: text } = useTranslation();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);

  const fetchLeaderboard = useCallback(async () => {
    setError(false);
    try {
      const { apiUrl } = config();
      const res = await fetch(`${apiUrl}/api/dailyChallenge/leaderboard?date=${date}`);
      if (!res.ok) throw new Error('leaderboard fetch failed');
      const data = await res.json();
      setEntries(Array.isArray(data?.leaderboard) ? data.leaderboard : []);
    } catch {
      setError(true);
    }
  }, [date]);

  // Refetch on every open (server caches for a few seconds anyway); keep the
  // previous list rendered meanwhile so reopening doesn't flash a spinner.
  useEffect(() => {
    if (!isOpen) return;
    setPage(0);
    fetchLeaderboard();
  }, [isOpen, fetchLeaderboard]);

  const username = userData?.username;
  const totalPages = entries ? Math.ceil(entries.length / PAGE_SIZE) : 0;
  const pageEntries = entries ? entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
  const userInList = !!(username && entries?.some(e => e.username === username));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={text('dailyLeaderboardTitle')}>
      {error && !entries ? (
        <div className="daily-distribution-empty">
          {text('error')}{' '}
          <button
            className="g2_green_button3"
            style={{ padding: '6px 14px', borderRadius: 10, fontSize: '0.9rem', marginLeft: 8 }}
            onClick={fetchLeaderboard}
          >
            {text('retry')}
          </button>
        </div>
      ) : !entries ? (
        <div className="daily-distribution-empty">{text('loading')}</div>
      ) : entries.length === 0 ? (
        <div className="daily-distribution-empty">{text('dailyLandingNoWinnersYet')}</div>
      ) : (
        <div className="daily-leaderboard">
          {pageEntries.map(entry => {
            const isMe = isLoggedIn && entry.username === username;
            return (
              <div key={entry.rank} className={`daily-leaderboard-row ${isMe ? 'self' : ''}`}>
                <div className="rank-name-group">
                  <span className="rank">{medal(entry.rank)}</span>
                  <ProfileNameLink username={entry.username} className="name daily-leaderboard-name-link" />
                </div>
                <span className="score">{entry.score.toLocaleString()}</span>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="daily-leaderboard-pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                {text('previous')}
              </button>
              <span>{text('pageOf', { current: page + 1, total: totalPages })}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                {text('next')}
              </button>
            </div>
          )}

          {/* Own standing when it isn't in the top-100 at all (rank comes from
              the bucket-derived distribution rank, so it can run past 100). */}
          {!userInList && typeof userData?.ownRank === 'number' && isLoggedIn && (
            <>
              <div className="daily-leaderboard-separator">
                <span>•••</span>
              </div>
              <div className="daily-leaderboard-row self">
                <div className="rank-name-group">
                  <span className="rank">
                    <span style={{ opacity: 0.7, fontSize: '0.85em' }}>#{userData.ownRank}</span>
                  </span>
                  {username
                    ? <ProfileNameLink username={username} className="name daily-leaderboard-name-link" />
                    : <span className="name">{text('yourScore')}</span>}
                </div>
                <span className="score">{Number(userData?.ownScore || 0).toLocaleString()}</span>
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
      )}
    </Modal>
  );
}
