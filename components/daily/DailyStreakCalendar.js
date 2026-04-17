import React, { useMemo } from 'react';

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DailyStreakCalendar({ history = [], days = 30, today }) {
  const playedSet = useMemo(() => new Set(history.map(h => h.date)), [history]);
  const cells = useMemo(() => {
    const now = today ? new Date(today) : new Date();
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = toDateStr(d);
      out.push({
        date: dateStr,
        played: playedSet.has(dateStr),
        isToday: i === 0,
      });
    }
    return out;
  }, [days, today, playedSet]);

  return (
    <div className="daily-streak-calendar" aria-label={`${days}-day streak calendar`}>
      {cells.map(cell => (
        <div
          key={cell.date}
          className={`streak-calendar-cell ${cell.played ? 'played' : ''} ${cell.isToday ? 'today' : ''}`}
          title={cell.date}
        />
      ))}
    </div>
  );
}
