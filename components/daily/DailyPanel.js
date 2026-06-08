import React, { useEffect, useMemo, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { FaClock, FaPlay, FaFire, FaCheck } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import config from '@/clientConfig';
import { getClientLocalDate, formatCountdown, msUntilLocalMidnight } from '@/utils/dailyDate';
import { readDailyStatus, writeDailyStatus } from '@/utils/dailyStatusCache';
import { getGuestId } from '@/utils/guestId';
import CountryFlag from '@/components/utils/countryFlag';

export default function DailyPanel({ open, onClose, session, onStartChallenge, onOpenProfile }) {
  const { t: text } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const today = getClientLocalDate();
  const [data, setData] = useState(() => {
    const cached = typeof window !== 'undefined' ? readDailyStatus(today) : null;
    return cached ? { user: cached, top10: [] } : null;
  });
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(() =>
    typeof window !== 'undefined' ? msUntilLocalMidnight() : 0
  );

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const secret = session?.token?.secret;
    const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
    if (!apiUrl) return;
    setLoading(true);
    const params = new URLSearchParams({ date: today });
    if (secret) params.set('secret', secret);
    else params.set('guestId', getGuestId());
    fetch(`${apiUrl}/api/dailyChallenge/results?${params.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('fetch_failed')))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        if (d.user) writeDailyStatus(today, d.user);
      })
      .catch(() => {  })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, session?.token?.secret, today]);

  const user = data?.user;
  const top10 = data?.top10 || [];
  const playedToday = !!user?.playedToday;
  const disqualifiedToday = !!user?.disqualifiedToday;

  const lockedForToday = playedToday || disqualifiedToday;
  const isLoggedIn = !!session?.token?.secret;
  const streak = user?.streak || 0;
  const streakBest = user?.streakBest || 0;
  const personalBest = user?.personalBest || 0;

  const ownScore = typeof user?.ownScore === 'number' ? user.ownScore : null;
  const ownRank = typeof user?.ownRank === 'number' ? user.ownRank : null;

  const startLabel = lockedForToday
    ? text('alreadyPlayedViewResults') || 'View results'
    : text('openTodaysChallenge') || "Today's Challenge";

  const countdownLabel = formatCountdown(countdown);

  const historyRows = useMemo(() => {
    const raw = Array.isArray(user?.history) ? user.history : [];
    return [...raw]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 30);
  }, [user?.history]);

  if (!mounted) return null;

  const handleOpenLbProfile = (username) => {
    if (!username || !onOpenProfile) return;
    if (username.startsWith('Guest #') || username.startsWith('guest-')) return;
    onOpenProfile(username);
  };

  return (
    <aside
      className={`wg-daily ${shown ? 'wg-daily--shown' : ''}`}
      role="dialog"
      aria-label="Daily Challenge"
    >
      <div className="wg-daily__topbar">
        <h2 className="wg-daily__title wg-gmarket-bold">
          {text('dailyChallenge') || 'Daily Challenge'}
        </h2>
        <button
          type="button"
          className="wg-daily__close"
          onClick={onClose}
          aria-label="Close"
        >
          <FaXmark />
        </button>
      </div>

      <div className="wg-daily__body">

        <section className="wg-daily__heroCard">
          <button
            type="button"
            className={`wg-daily__cta ${lockedForToday ? 'wg-daily__cta--done' : ''}`}
            onClick={() => onStartChallenge?.(lockedForToday ? 'results' : 'play')}
          >
            {lockedForToday ? <FaCheck /> : <FaPlay />}
            <span className="wg-daily__ctaLabel">{startLabel}</span>
          </button>
          <div className="wg-daily__nextChip">
            <FaClock aria-hidden="true" />
            <span>
              {text('nextChallengeIn', { time: countdownLabel })
                || `Next in ${countdownLabel}`}
            </span>
          </div>
          {streak > 0 && (
            <div className={`wg-daily__streakBanner ${lockedForToday ? 'wg-daily__streakBanner--done' : ''}`}>
              <FaFire />
              <span>{streak}-day streak{lockedForToday ? '!' : '! Play today to keep it alive'}</span>
            </div>
          )}
          {playedToday && ownScore != null && (
            <div className="wg-daily__todayStats">
              <div className="wg-daily__todayStat">
                <span className="wg-daily__todayStatLbl">Your score</span>
                <span className="wg-daily__todayStatVal">{ownScore.toLocaleString()}</span>
              </div>
              {ownRank != null && (
                <div className="wg-daily__todayStat">
                  <span className="wg-daily__todayStatLbl">Rank</span>
                  <span className="wg-daily__todayStatVal">#{ownRank}</span>
                </div>
              )}
            </div>
          )}
          {disqualifiedToday && !playedToday && (
            <div className="wg-daily__notice wg-daily__notice--warn">
              <span>
                {text('dailyDisqualifiedRibbon')
                  || "Today's attempt was disqualified — try again tomorrow."}
              </span>
            </div>
          )}
          {!isLoggedIn && (
            <div className="wg-daily__notice wg-daily__notice--info">
              <span>
                {streak > 0
                  ? `Sign in to lock in your ${streak}-day streak.`
                  : 'Sign in to save your streak and appear on the leaderboard.'}
              </span>
            </div>
          )}
        </section>

        <section className="wg-daily__section">
          <h3 className="wg-daily__sectionTitle">
            {text('top10Today') || "Top players today"}
          </h3>
          {top10.length === 0 ? (
            <div className="wg-daily__empty">
              {loading
                ? (text('loading') || 'Loading…')
                : (text('dailyLandingNoWinnersYet') || 'No scores yet — be the first!')}
            </div>
          ) : (
            <ol className="wg-daily__leaderboard">
              {top10.slice(0, 10).map((row, i) => {
                const isMe = isLoggedIn && row.username === session?.token?.username;
                const medal = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : null;
                const clickable = !!row.username
                  && !row.username.startsWith('Guest #')
                  && !row.username.startsWith('guest-');
                return (
                  <li
                    key={row.username || i}
                    className={[
                      'wg-daily__lbRow',
                      medal ? `wg-daily__lbRow--${medal}` : '',
                      isMe ? 'wg-daily__lbRow--me' : '',
                      clickable ? 'wg-daily__lbRow--clickable' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={clickable ? () => handleOpenLbProfile(row.username) : undefined}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={clickable
                      ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenLbProfile(row.username); } }
                      : undefined}
                  >
                    <span className={`wg-daily__lbRank ${medal ? `wg-daily__lbRank--${medal}` : ''}`}>
                      {medal ? (
                        <span className={`wg-daily__lbMedal wg-daily__lbMedal--${medal}`}>{i + 1}</span>
                      ) : (
                        <>#{i + 1}</>
                      )}
                    </span>
                    <span className="wg-daily__lbNameCell">
                      {row.countryCode && (
                        <CountryFlag countryCode={row.countryCode} size={1.1} marginRight="0" />
                      )}
                      <span className="wg-daily__lbName" title={row.username}>{row.username}</span>
                    </span>
                    <span className={`wg-daily__lbScore ${medal ? `wg-daily__lbScore--${medal}` : ''}`}>
                      {(row.score || 0).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="wg-daily__section">
          <h3 className="wg-daily__sectionTitle">
            {text('dailyHistoryTitle') || 'Your history'}
          </h3>

          <div className="wg-daily__historySummary">
            <div className="wg-daily__histCell">
              <span className="wg-daily__histLbl">Best streak</span>
              <span className="wg-daily__histVal">{streakBest}</span>
            </div>
            <div className="wg-daily__histCell">
              <span className="wg-daily__histLbl">Personal best</span>
              <span className="wg-daily__histVal">{personalBest.toLocaleString()}</span>
            </div>
            <div className="wg-daily__histCell">
              <span className="wg-daily__histLbl">Days played</span>
              <span className="wg-daily__histVal">{historyRows.length}</span>
            </div>
          </div>

          {historyRows.length === 0 ? (
            <div className="wg-daily__empty">
              {isLoggedIn
                ? 'No daily plays yet. Today is a good day to start.'
                : 'Sign in to track your daily history.'}
            </div>
          ) : (
            <ol className="wg-daily__historyList">
              {historyRows.map((h, i) => {
                let dateLabel = h.date;
                try {
                  const d = new Date(`${h.date}T00:00:00`);
                  dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                } catch {  }
                const isPB = (h.score || 0) >= personalBest && personalBest > 0;
                return (
                  <li key={`${h.date}-${i}`} className="wg-daily__historyRow">
                    <span className="wg-daily__historyDate">{dateLabel}</span>
                    <span className={`wg-daily__historyScore ${isPB ? 'wg-daily__historyScore--pb' : ''}`}>
                      {(h.score || 0).toLocaleString()}
                    </span>
                    {h.rank != null && (
                      <span className="wg-daily__historyRank">#{h.rank}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </aside>
  );
}
