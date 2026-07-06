import React, { useEffect, useState } from 'react';
import { FaCalendarDay, FaClock, FaTrophy, FaPlay, FaCheck } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import { formatCountdown, msUntilLocalMidnight } from '@/utils/dailyDate';
import DailyStreakBadge from './DailyStreakBadge';
import ScoreDistributionChart from './ScoreDistributionChart';
import PersonalRecordsCard from './PersonalRecordsCard';
import DailyHistoryBars14 from './DailyHistoryBars14';
import DailyLeaderboardModal from './DailyLeaderboardModal';
import { derivePercentile } from '@/shared/daily/percentile';

export default function DailyLanding({ today, distribution = null, userData = null, onStartChallenge, onSignIn, isLoggedIn, animateEntrance = false }) {
  const { t: text } = useTranslation();
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  const playedToday = userData?.playedToday;
  // graceDay is only true for logged-in users whose stored streak is alive
  // today purely because of the unused-grace branch (server-computed in
  // api/dailyChallenge/results.js). Don't show the warning if they've
  // already played today.
  const graceDay = !!userData?.graceDay && !playedToday && (userData?.streak || 0) > 0;

  return (
    <div className={`daily-landing ${animateEntrance ? 'daily-landing--opening' : ''}`}>
      <section className="daily-landing-hero">
        <h1 className="daily-landing-title">{text('dailyLandingTitle')}</h1>

        <button
          className={`g2_green_button daily-landing-cta ${playedToday ? 'played' : ''}`}
          onClick={onStartChallenge}
          aria-label={playedToday ? text('alreadyPlayedViewResults') : text('openTodaysChallenge')}
        >
          {!playedToday && <FaPlay style={{ verticalAlign: '-2px', marginRight: 8 }} />}
          {playedToday
            ? text('nextChallengeIn', { time: formatCountdown(countdown) })
            : text('openTodaysChallenge')}
          <span className="daily-landing-cta-subtitle">
            {playedToday
              ? text('alreadyPlayedViewResults')
              : text('nextChallengeIn', { time: formatCountdown(countdown) })}
          </span>
        </button>

        {graceDay && (
          <div className="daily-landing-grace-banner" role="status">
            {text('dailyLandingGraceDay', { streak: userData.streak })}
          </div>
        )}

        <div className="daily-landing-user-stats">
          {userData?.streak > 0 && (
            <DailyStreakBadge streak={userData.streak} size="lg" variant={graceDay ? 'at-risk' : (playedToday ? 'done' : 'pulsing')} />
          )}
          {!isLoggedIn && (
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>
              {userData?.streak > 0
                ? text('dailyLandingLockInStreak', { streak: userData.streak })
                : text('dailyLandingLoggedOutPrompt')}
              {onSignIn && (
                <>
                  {' '}
                  <button
                    className="g2_green_button3"
                    style={{ padding: '4px 14px', borderRadius: 10, marginLeft: 8 }}
                    onClick={onSignIn}
                  >
                    {text('signIn')}
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      </section>

      <section className="daily-landing-section">
        <div className="daily-landing-section-title">{text('dailyLandingHowItWorks')}</div>
        <div className="daily-landing-steps">
          <div className="daily-landing-step">
            <FaCalendarDay aria-hidden="true" />
            <div className="daily-landing-step-text">{text('dailyLandingStep1')}</div>
          </div>
          <div className="daily-landing-step">
            <FaClock aria-hidden="true" />
            <div className="daily-landing-step-text">{text('dailyLandingStep2')}</div>
          </div>
          <div className="daily-landing-step">
            <FaTrophy aria-hidden="true" />
            <div className="daily-landing-step-text">{text('dailyLandingStep3')}</div>
          </div>
        </div>
      </section>

      {/* Community pulse — the anonymous distribution stays the headline (an
          average is a reachable target for beginners); the named top-100 board
          is deliberately tucked behind an opt-in modal so it isn't the main
          attraction. Mirrors the results screen's distribution card:
          chart (≥10 plays) → meta → standing/hook. */}
      <section className="daily-landing-section">
        {/* "How you compare" only makes sense once there's a score to compare —
            pre-play it's just today's scores. */}
        <div className="daily-landing-section-title-row">
          <div className="daily-landing-section-title">
            {text(playedToday ? 'dailyScoreDistribution' : 'dailyTodaysScores')}
          </div>
          {(distribution?.totalPlays || 0) > 0 && (
            <button className="daily-leaderboard-open-btn" onClick={() => setShowLeaderboard(true)}>
              <FaTrophy aria-hidden="true" />
              {text('dailyViewLeaderboard')}
            </button>
          )}
        </div>
        {(distribution?.totalPlays || 0) > 0 ? (
          <>
            {distribution.totalPlays >= 10 ? (
              <ScoreDistributionChart
                buckets={distribution.buckets || []}
                totalPlays={distribution.totalPlays}
                userScore={playedToday ? userData?.ownScore ?? undefined : undefined}
              />
            ) : (
              <div className="daily-distribution-empty">{text('tooFewPlaysForChart')}</div>
            )}
            <div className="daily-distribution-meta">
              <span>{text('averageScoreToday', { avg: distribution.avgScore || 0 })}</span>
              <span>{text('sampleSize', { count: distribution.totalPlays.toLocaleString() })}</span>
            </div>
            {(() => {
              const percentile = playedToday
                ? derivePercentile(userData?.ownRank, distribution.totalPlays)
                : null;
              if (percentile !== null && percentile >= 20) {
                return (
                  <div className="daily-distribution-standing">
                    <span className="daily-distribution-pct">
                      {text('beatPctPlayers', { pct: percentile })}
                    </span>
                    <span className="daily-distribution-rank">
                      {text('rankOfTotal', { rank: userData.ownRank, total: distribution.totalPlays.toLocaleString() })}
                    </span>
                  </div>
                );
              }
              if (!playedToday) {
                return (
                  <div className="daily-distribution-empty">
                    {text('dailyBeatAvgHook', { avg: (distribution.avgScore || 0).toLocaleString() })}
                  </div>
                );
              }
              return null;
            })()}
          </>
        ) : (
          <div className="daily-distribution-empty">{text('dailyLandingNoWinnersYet')}</div>
        )}
      </section>

      <section className="daily-landing-section">
        <div className="daily-landing-section-title">{text('dailyHistoryTitle')}</div>
        <PersonalRecordsCard
          history={userData?.history || []}
          streakBest={userData?.streakBest || 0}
          personalBest={userData?.personalBest || 0}
        />
        {(userData?.history?.length || 0) > 0 && (
          <DailyHistoryBars14 history={userData?.history || []} today={today} />
        )}
      </section>

      <DailyLeaderboardModal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        date={today}
        userData={userData}
        isLoggedIn={isLoggedIn}
        onSignIn={onSignIn ? () => { setShowLeaderboard(false); onSignIn(); } : undefined}
      />
    </div>
  );
}
