import React from 'react';
import { useTranslation } from '@/components/useTranslations';

// Compact personal-records card — shows the three stats that are most
// motivating without leaning on anyone else's scores. Shared between the
// daily results modal and the landing page's history panel. Works for
// guests the same as logged-in users because GuestProfile.daily's shape
// mirrors User.dailyHistory / dailyStreakBest.
export default function PersonalRecordsCard({ history = [], streakBest = 0, personalBest = 0, todayScore = null }) {
  const { t: text } = useTranslation();
  const daysPlayed = history.length;
  const todayBroke = Number.isFinite(todayScore) && todayScore > 0 && todayScore >= personalBest;

  if (daysPlayed === 0) {
    return (
      <div className="daily-stat-card daily-records-card">
        <div className="daily-stat-title">{text('personalRecords')}</div>
        <div className="daily-records-empty">{text('dailyStartOfJourney')}</div>
      </div>
    );
  }

  return (
    <div className="daily-stat-card daily-records-card">
      <div className="daily-stat-title">{text('personalRecords')}</div>
      <div className="daily-records-grid">
        <div className="daily-record-row">
          <span className="daily-record-icon" aria-hidden="true">🏆</span>
          <span className="daily-record-label">{text('bestScore')}</span>
          <span className="daily-record-value">
            {Math.round(Math.max(personalBest, todayScore || 0)).toLocaleString()}
            {todayBroke && <span className="daily-record-new-badge">{text('newBest')}</span>}
          </span>
        </div>
        <div className="daily-record-row">
          <span className="daily-record-icon" aria-hidden="true">🔥</span>
          <span className="daily-record-label">{text('bestStreakLabel')}</span>
          <span className="daily-record-value">{text('streakDays', { count: streakBest || 0 })}</span>
        </div>
        <div className="daily-record-row">
          <span className="daily-record-icon" aria-hidden="true">📅</span>
          <span className="daily-record-label">{text('daysPlayed')}</span>
          <span className="daily-record-value">{daysPlayed.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
