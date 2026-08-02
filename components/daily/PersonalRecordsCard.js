import React from 'react';
import { useTranslation } from '@/components/useTranslations';

// Compact personal-records card — shows the three stats that are most
// motivating without leaning on anyone else's scores. Shared between the
// daily results modal and the landing page's history panel. Works for
// guests the same as logged-in users because GuestProfile.daily's shape
// mirrors User.dailyHistory / dailyStreakBest.
export default function PersonalRecordsCard({ history = [], streakBest = 0, personalBest = 0, todayScore = null, daysPlayed = 0 }) {
  const { t: text } = useTranslation();
  // Server lifetime counter, floored by what the payload proves anyway:
  // history is a rolling 30-entry window (its length saturates — the old
  // "30 days played, 36 streak" impossibility), and a best streak of N
  // requires ≥N days played. The floor keeps guests and not-yet-reseeded
  // legacy users truthful.
  const days = Math.max(daysPlayed || 0, history.length, streakBest || 0);
  const todayBroke = Number.isFinite(todayScore) && todayScore > 0 && todayScore >= personalBest;

  if (days === 0) {
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
          <span className="daily-record-value">{days.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
