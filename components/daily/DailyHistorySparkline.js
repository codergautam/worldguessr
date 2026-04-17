import React, { useMemo } from 'react';
import { useTranslation } from '@/components/useTranslations';

const WIDTH = 600;
const HEIGHT = 80;
const PAD = 10;

function trendFromScores(scores) {
  if (scores.length < 3) return 'steady';
  const n = scores.length;
  const xs = scores.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = scores.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (scores[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  if (slope > 80) return 'improving';
  if (slope < -80) return 'rough';
  return 'steady';
}

export default function DailyHistorySparkline({ history = [] }) {
  const { t: text } = useTranslation();

  const sorted = useMemo(() => {
    return [...history]
      .filter(h => typeof h?.score === 'number')
      .sort((a, b) => a.date < b.date ? -1 : 1)
      .slice(-7);
  }, [history]);

  const { path, points, avg, trend } = useMemo(() => {
    const scores = sorted.map(h => h.score);
    if (scores.length === 0) return { path: '', points: [], avg: 0, trend: 'steady' };
    const max = Math.max(...scores, 5000);
    const min = Math.min(...scores, 0);
    const range = Math.max(1, max - min);
    const stepX = scores.length > 1 ? (WIDTH - PAD * 2) / (scores.length - 1) : 0;
    const pts = scores.map((v, i) => {
      const x = PAD + i * stepX;
      const y = HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);
      return { x, y, v };
    });
    let p = '';
    pts.forEach((pt, i) => { p += (i === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ' '; });
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { path: p, points: pts, avg, trend: trendFromScores(scores) };
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div className="daily-distribution-empty">{text('notEnoughPlayersYet')}</div>
    );
  }

  const trendLabel = trend === 'improving' ? text('trendImproving')
    : trend === 'rough' ? text('trendRoughWeek')
    : text('trendSteady');

  return (
    <div>
      <svg className="daily-sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={text('past7Days')}>
        <path d={path} stroke="#ffd700" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="#ffd700" stroke="#1a0a00" strokeWidth="1" />
        ))}
      </svg>
      <div className="daily-sparkline-trend">
        <span>{text('averageScoreToday', { avg })}</span>
        <span className={trend}>{trendLabel}</span>
      </div>
    </div>
  );
}
