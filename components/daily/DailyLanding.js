import React, { useEffect, useState } from 'react';
import { FaCalendarDay, FaClock, FaTrophy, FaPlay, FaCheck } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import { formatCountdown, msUntilLocalMidnight, challengeNumber } from '@/utils/dailyDate';
import DailyStreakBadge from './DailyStreakBadge';
import DailyStreakCalendar from './DailyStreakCalendar';
import DailyLeaderboardPanel from './DailyLeaderboardPanel';

export default function DailyLanding({ today, todayTop10 = [], userData = null, onStartChallenge, onSignIn, isLoggedIn }) {
  const { t: text } = useTranslation();
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  const playedToday = userData?.playedToday;
  const chNum = challengeNumber(today);

  return (
    <div className="daily-landing">
      <section className="daily-landing-hero">
        <h1 className="daily-landing-title">{text('dailyLandingTitle')}</h1>
        <p className="daily-landing-tagline">{text('dailyLandingTagline')}</p>

        <button
          className={`g2_green_button daily-landing-cta ${playedToday ? 'played' : ''}`}
          onClick={onStartChallenge}
          aria-label={text('openTodaysChallenge')}
        >
          <FaPlay style={{ verticalAlign: '-2px', marginRight: 8 }} />
          {text('openTodaysChallenge')}
          <span className="daily-landing-cta-subtitle">
            {playedToday
              ? (<><FaCheck aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />{text('alreadyPlayedViewResults')}</>)
              : text('nextChallengeIn', { time: formatCountdown(countdown) })}
          </span>
        </button>

        <div className="daily-landing-user-stats">
          {isLoggedIn && userData?.streak > 0 && (
            <DailyStreakBadge streak={userData.streak} size="lg" variant={playedToday ? 'done' : 'pulsing'} />
          )}
          {!isLoggedIn && (
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>
              {text('dailyLandingLoggedOutPrompt')}
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

      <section className="daily-landing-section">
        <div className="daily-landing-section-title">{text('top10Today')}</div>
        {todayTop10.length > 0 ? (
          <DailyLeaderboardPanel
            top10={todayTop10}
            userRank={userData?.ownRank ?? null}
            userScore={userData?.ownScore ?? null}
            isLoggedIn={isLoggedIn}
            username={userData?.username}
            onSignIn={onSignIn}
          />
        ) : (
          <div className="daily-distribution-empty">{text('dailyLandingNoWinnersYet')}</div>
        )}
      </section>

      {isLoggedIn && (
        <section className="daily-landing-section">
          <div className="daily-landing-section-title">{text('dailyHistoryTitle')}</div>
          <DailyStreakCalendar history={userData?.history || []} today={today} />
        </section>
      )}
    </div>
  );
}
