import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';

const MAX_SCORE = 15000;

// Tier thresholds keyed on fraction of MAX_SCORE. Kept local because these
// apply to per-day scores; DailyResultsScreen's starsFromPercent is tuned
// for a different surface (total-score star tiers on the results header).
function tierForScore(score) {
  const pct = score / MAX_SCORE;
  if (pct < 0.30) return 'low';
  if (pct < 0.60) return 'mid';
  if (pct < 0.80) return 'high';
  if (pct < 0.90) return 'gold';
  return 'platinum';
}

// Local "today" in YYYY-MM-DD — we don't use getClientLocalDate here because
// the parent already passes one down for consistency with the streak system.
function shiftDays(dateStr, n) {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + n * 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTooltipDate(dateStr) {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

// Narrow viewports cram 14 thin bars into unreadable slivers — drop to 10
// below ~340px so bars stay >= 18px wide with a 2px gap.
function useWindowCount() {
  const [count, setCount] = useState(14);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => setCount(window.innerWidth <= 340 ? 10 : 14);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return count;
}

export default function DailyHistoryBars14({ history = [], today }) {
  const { t: text } = useTranslation();
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const windowDays = useWindowCount();

  // Single memoized derivation — DailyLanding re-renders every 1s for its
  // countdown timer, so recomputing this every tick would burn cycles for
  // no reason. Keyed on [history, today, windowDays] so viewport changes
  // still re-slice correctly.
  const bars = useMemo(() => {
    if (!today) return [];
    const byDate = new Map();
    for (const h of history) {
      if (!h?.date) continue;
      const prev = byDate.get(h.date);
      if (!prev || (h.score || 0) > (prev.score || 0)) byDate.set(h.date, h);
    }
    const out = [];
    // windowDays-1..0 days ago → oldest-left, today-right
    for (let i = windowDays - 1; i >= 0; i--) {
      const date = shiftDays(today, -i);
      const entry = date ? byDate.get(date) : null;
      const played = !!entry && Number.isFinite(entry.score);
      out.push({
        date,
        score: played ? entry.score : 0,
        rank: played ? (entry.rank ?? null) : null,
        played,
        isToday: i === 0,
        tier: played ? tierForScore(entry.score) : null,
      });
    }
    return out;
  }, [history, today, windowDays]);

  if (!history.length) return null;

  const hoveredBar = hoveredIdx != null ? bars[hoveredIdx] : null;

  return (
    <div
      className="daily-history-bars14"
      role="img"
      aria-label={text('dailyHistoryChartAria', { days: windowDays })}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <div className="daily-history-bars14-plot">
        {bars.map((b, i) => {
          const h = b.played ? Math.max(10, (b.score / MAX_SCORE) * 100) : 6;
          const classes = [
            'daily-history-bar',
            b.played ? `tier-${b.tier}` : 'stub',
            b.isToday ? 'today' : '',
            b.isToday && !b.played ? 'today-unplayed' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              type="button"
              key={b.date || i}
              className={classes}
              style={{ '--bar-h': `${h}%` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onFocus={() => setHoveredIdx(i)}
              onBlur={() => setHoveredIdx(null)}
              aria-label={b.played
                ? text('dailyHistoryBarAriaPlayed', { date: formatTooltipDate(b.date), score: b.score.toLocaleString() })
                : text('dailyHistoryBarAriaMissed', { date: formatTooltipDate(b.date) })}
            >
              <span className="daily-history-bar-fill" />
            </button>
          );
        })}
      </div>

      {hoveredBar && (
        <div
          className="daily-history-bars14-tooltip"
          style={{ '--bar-idx': hoveredIdx, '--bar-count': bars.length }}
          role="tooltip"
        >
          <div className="daily-history-bars14-tooltip-date">
            {formatTooltipDate(hoveredBar.date)}{hoveredBar.isToday ? ` · ${text('today')}` : ''}
          </div>
          {hoveredBar.played ? (
            <div className="daily-history-bars14-tooltip-stats">
              <span className="daily-history-bars14-tooltip-score">
                {hoveredBar.score.toLocaleString()} {text('pointsAbbrev')}
              </span>
              {typeof hoveredBar.rank === 'number' && (
                <span className="daily-history-bars14-tooltip-rank">
                  {text('rankN', { rank: hoveredBar.rank })}
                </span>
              )}
            </div>
          ) : (
            <div className="daily-history-bars14-tooltip-stats muted">
              {text('dailyHistoryDayMissed')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
