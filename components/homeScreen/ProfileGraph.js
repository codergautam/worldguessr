import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from '@/components/useTranslations';
import config from '@/clientConfig';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
);

const cache = new Map();
const inFlight = new Map();
const ttl = 5 * 60 * 1000;

function fetchProgression(username) {
  const cached = cache.get(username);
  if (cached && Date.now() - cached.at < ttl) return Promise.resolve(cached.data);
  if (inFlight.has(username)) return inFlight.get(username);
  const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
  const p = fetch(`${apiUrl}/api/userProgression`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
    .then(async (r) => {
      if (r.status === 429) { const e = new Error('rate-limited'); e.code = 429; throw e; }
      if (!r.ok) throw new Error(`progression ${r.status}`);
      const data = await r.json();
      cache.set(username, { at: Date.now(), data });
      return data;
    })
    .finally(() => { inFlight.delete(username); });
  inFlight.set(username, p);
  return p;
}

export default function ProfileGraph({ username, mode = 'xp' }) {
  const { t: text } = useTranslation('common');
  const [progression, setProgression] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState('all');
  const [view, setView] = useState('stat');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(false);
    fetchProgression(username)
      .then((d) => {
        if (!mountedRef.current) return;
        setProgression(d?.progression || []);
        setLoading(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setError(true);
        setLoading(false);
      });
  }, [username]);

  const { chartData, pointCount, isRank } = useMemo(() => {
    if (!progression || progression.length === 0) {
      return { chartData: null, pointCount: 0, isRank: view === 'rank' };
    }
    const now = Date.now();
    const cutoff = range === '7d' ? now - 7 * 86400000
      : range === '30d' ? now - 30 * 86400000
      : 0;
    const filtered = progression.filter((p) => new Date(p.timestamp).getTime() >= cutoff);
    const series = filtered.length > 0 ? filtered : [progression[progression.length - 1]];

    const yKey = mode === 'xp'
      ? (view === 'rank' ? 'xpRank' : 'totalXp')
      : (view === 'rank' ? 'eloRank' : 'elo');

    const pts = series
      .map((s) => ({ x: new Date(s.timestamp), y: s[yKey] }))
      .filter((p) => p.y != null && !Number.isNaN(p.y));

    if (pts.length === 0) return { chartData: null, pointCount: 0, isRank: view === 'rank' };

    if (pts.length === 1) pts.push({ x: new Date(), y: pts[0].y });
    const last = pts[pts.length - 1];
    if (Date.now() - last.x.getTime() > 86400000) {
      pts.push({ x: new Date(), y: last.y });
    }

    const isStat = view === 'stat';
    const colour = mode === 'xp'
      ? (isStat ? '#3b82f6' : '#60a5fa')
      : (isStat ? '#22c55e' : '#4ade80');
    const bg = mode === 'xp'
      ? (isStat ? 'rgba(59, 130, 246, 0.18)' : 'rgba(96, 165, 250, 0.14)')
      : (isStat ? 'rgba(34, 197, 94, 0.18)' : 'rgba(74, 222, 128, 0.14)');

    return {
      pointCount: pts.length,
      isRank: view === 'rank',
      chartData: {
        datasets: [{
          data: pts,
          borderColor: colour,
          backgroundColor: bg,
          fill: true,
          tension: 0.18,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: colour,
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          borderWidth: 2,
        }],
      },
    };
  }, [progression, range, mode, view]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(96, 165, 250, 0.4)',
        borderWidth: 1,
        padding: 8,
        displayColors: false,
        callbacks: {
          title: (ctx) => new Date(ctx[0].parsed.x).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          }),
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (isRank) return `#${Number(v).toLocaleString()}`;
            const label = mode === 'xp' ? 'XP' : 'ELO';
            return `${Number(v).toLocaleString()} ${label}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', displayFormats: { day: 'MMM d', month: 'MMM yy' } },
        grid: { display: false },
        ticks: {
          color: 'rgba(255, 255, 255, 0.55)',
          font: { size: 10 },
          maxTicksLimit: 4,
          autoSkip: true,
        },
      },
      y: {

        reverse: isRank,
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
        ticks: {
          color: 'rgba(255, 255, 255, 0.55)',
          font: { size: 10 },
          maxTicksLimit: 4,
          callback: (v) => isRank ? `#${Number(v).toLocaleString()}` : Number(v).toLocaleString(),
        },
      },
    },
    elements: { line: { capBezierPoints: true } },
    interaction: { intersect: false, mode: 'nearest' },
  }), [mode, isRank]);

  const titleColour = mode === 'xp' ? '#3b82f6' : '#facc15';
  const titleLabel  = mode === 'xp' ? text('xp') : text('elo');
  const rankLabel   = mode === 'xp' ? text('xpRank') : text('eloRank');
  const statLabel   = mode === 'xp' ? text('xp')     : text('elo');

  return (
    <div className="wg-profile__graphCard">
      <div className="wg-profile__graphHead">
        <h3 className="wg-profile__graphTitle">
          <span style={{ color: titleColour }}>{titleLabel}</span>{' '}
          {text('overTime')}
        </h3>
      </div>

      <div className="wg-profile__graphControls">

        <div className="wg-profile__graphSeg wg-profile__graphSeg--alt">
          <button
            type="button"
            className={`wg-profile__graphSegBtn ${view === 'stat' ? 'wg-profile__graphSegBtn--onBlue' : ''}`}
            onClick={() => setView('stat')}
          >
            {statLabel}
          </button>
          <button
            type="button"
            className={`wg-profile__graphSegBtn ${view === 'rank' ? 'wg-profile__graphSegBtn--onBlue' : ''}`}
            onClick={() => setView('rank')}
          >
            {text('rank')}
          </button>
        </div>

        <div className="wg-profile__graphSeg">
          {['7d', '30d', 'all'].map((r) => (
            <button
              key={r}
              type="button"
              className={`wg-profile__graphSegBtn ${range === r ? 'wg-profile__graphSegBtn--on' : ''}`}
              onClick={() => setRange(r)}
            >
              {r === 'all' ? text('all') : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="wg-profile__graphBody">
        {loading && (
          <div className="wg-profile__graphMsg">
            <span className="wg-profile__spinner" />
          </div>
        )}
        {!loading && error && (
          <div className="wg-profile__graphMsg">
            <span>{text('error')}</span>
          </div>
        )}
        {!loading && !error && !chartData && (
          <div className="wg-profile__graphMsg">
            <span>{text('noStatsAvailable')}</span>
          </div>
        )}
        {!loading && !error && chartData && (
          <Line data={chartData} options={options} />
        )}
      </div>

      <div className="wg-profile__graphFoot">
        {text('dataPoints', { count: pointCount })}
      </div>
    </div>
  );
}
