import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaStar, FaShareAlt, FaArrowLeft } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import { asset } from '@/lib/basePath';
import { formatCountdown, msUntilLocalMidnight, challengeNumber as computeChallengeNumber } from '@/utils/dailyDate';
import ScoreDistributionChart from './ScoreDistributionChart';
import DailyLeaderboardPanel from './DailyLeaderboardPanel';
import DailyHistorySparkline from './DailyHistorySparkline';
import DailyShareModal from './DailyShareModal';

const MAX_PER_ROUND = 5000;
const TOTAL_MAX = 5 * MAX_PER_ROUND;

// Palette + thresholds mirror components/roundOverScreen.js so Daily stays
// visually consistent with the rest of the game. (The bronze/silver hex
// naming there is inverted — we keep the same hex values so the rendered
// colors match exactly.)
const STAR_COLORS = {
  bronze: '#b6b2b2',
  silver: '#CD7F32',
  gold: 'gold',
  platinum: 'platinum', // sentinel — rendered as the platinum_star.png image
};

// Returns a 3-entry array of tier names for the given percent (0..100),
// matching the escalating tiers used in roundOverScreen.js:213-252.
function starsFromPercent(percent) {
  if (percent <= 20) return ['bronze'];
  if (percent <= 30) return ['bronze', 'bronze'];
  if (percent <= 45) return ['bronze', 'bronze', 'bronze'];
  if (percent <= 50) return ['silver', 'silver', 'bronze'];
  if (percent <= 60) return ['silver', 'silver', 'silver'];
  if (percent <= 62) return ['gold', 'silver', 'silver'];
  if (percent <= 65) return ['gold', 'gold', 'silver'];
  if (percent <= 79) return ['gold', 'gold', 'gold'];
  if (percent <= 82) return ['platinum', 'gold', 'gold'];
  if (percent <= 85) return ['platinum', 'platinum', 'gold'];
  return ['platinum', 'platinum', 'platinum'];
}

// Highest tier reached at a given percent — used for per-bar accent color so
// a bar's color matches the star tier it would award.
function tierForPercent(percent) {
  if (percent >= 79) return 'platinum';
  if (percent >= 60) return 'gold';
  if (percent >= 45) return 'silver';
  return 'bronze';
}

function tierAccentColor(tier) {
  if (tier === 'platinum') return '#e6f4ff';
  if (tier === 'gold') return '#ffd700';
  if (tier === 'silver') return STAR_COLORS.silver;
  return STAR_COLORS.bronze;
}

function RoundBarGraph({ rounds, roundAverages = [] }) {
  const { t: text } = useTranslation();
  return (
    <div className="daily-round-bars" role="img" aria-label={text('roundBreakdown')}>
      {rounds.map((r, i) => {
        const pct = Math.max(0, Math.min(1, (r.score || 0) / MAX_PER_ROUND));
        const pctLabel = Math.round(pct * 100);
        const perfect = r.score >= 4850;
        const tier = tierForPercent(pctLabel);
        const avg = Number.isFinite(roundAverages[i]) ? roundAverages[i] : null;
        const avgPct = avg != null
          ? Math.max(0, Math.min(100, (avg / MAX_PER_ROUND) * 100))
          : null;
        return (
          <div
            className={`daily-round-bar tier-${tier}`}
            key={i}
            style={{ '--bar-color': tierAccentColor(tier) }}
          >
            <div className="daily-round-bar-track" aria-hidden="true">
              <div
                className="daily-round-bar-fill"
                style={{ height: `${pctLabel}%`, animationDelay: `${i * 0.1}s` }}
              />
              {avgPct != null && (
                <div
                  className="daily-round-bar-avg"
                  style={{ bottom: `${avgPct}%` }}
                  title={`${text('globalAvgAbbrev')} ${Math.round(avg).toLocaleString()} ${text('pointsAbbrev')}`}
                >
                  <span className="daily-round-bar-avg-label">
                    {text('globalAvgAbbrev')} {Math.round(avg).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <div className="daily-round-bar-label">{i + 1}</div>
            <div className="daily-round-bar-sub">
              <span className="daily-round-bar-score-value">
                {Math.round(r.score).toLocaleString()}
              </span>{' '}
              <span className="daily-round-bar-score-unit">{text('pointsAbbrev')}</span>
              {perfect && <span className="daily-round-bar-perfect" title={text('perfectRound')}> ★</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function useAnimatedNumber(target, durationMs = 1200) {
  const [display, setDisplay] = useState(0);
  const [animating, setAnimating] = useState(false);
  const rafRef = useRef(null);
  const settleRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof target !== 'number' || !Number.isFinite(target)) return;
    cancelAnimationFrame(rafRef.current);
    clearTimeout(settleRef.current);
    startRef.current = null;
    fromRef.current = display;
    const reduce = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 200 : durationMs;
    setAnimating(true);

    function step(t) {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / dur);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // Keep the glow for a beat after the count lands, matching roundOverScreen.
        settleRef.current = setTimeout(() => setAnimating(false), 300);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(settleRef.current);
    };
  }, [target, durationMs]);

  return [display, animating];
}

function Stars({ score }) {
  const pct = Math.max(0, Math.min(100, (score / TOTAL_MAX) * 100));
  const tiers = starsFromPercent(pct);
  return (
    <div className="daily-header-stars" aria-label={`${tiers.length} stars (${tiers.join(', ')})`}>
      {tiers.map((tier, i) => (
        <span
          key={i}
          className={`daily-header-star tier-${tier}`}
          style={{ animationDelay: `${i * 0.5}s`, transition: 'transform 0.3s ease-out' }}
        >
          {tier === 'platinum'
            ? <img src={asset('/platinum_star.png')} alt="" draggable={false} style={{ transition: 'all 0.3s ease-out' }} />
            : <FaStar color={STAR_COLORS[tier]} />}
        </span>
      ))}
    </div>
  );
}

export default function DailyResultsScreen({
  date,
  rounds,
  locations,
  totalScore,
  totalTime,
  submitResponse,
  results,
  loadingResults,
  isLoggedIn,
  username,
  disqualified = false,
  onClose,
  onSignIn,
  fetchResults,
}) {
  const { t: text } = useTranslation();
  const [displayScore, scoreAnimating] = useAnimatedNumber(totalScore);
  const [showShare, setShowShare] = useState(false);
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (submitResponse?.newPersonalBest || (rounds?.length && rounds.some(r => r.score >= 4850))) {
      import('canvas-confetti').then(m => {
        const confetti = m.default;
        confetti({ particleCount: 160, spread: 90, origin: { y: 0.3 } });
      }).catch(() => {});
    }
  }, [submitResponse, rounds]);

  const chNum = useMemo(() => computeChallengeNumber(date), [date]);
  const dateLabel = useMemo(() => {
    try {
      const d = new Date(`${date}T00:00:00`);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return date; }
  }, [date]);

  const rank = submitResponse?.rank ?? results?.user?.ownRank ?? null;
  const totalPlays = submitResponse?.totalPlays ?? results?.distribution?.totalPlays ?? 0;
  const percentile = submitResponse?.percentile ?? null;
  const streak = submitResponse?.streak ?? results?.user?.streak ?? 0;
  const streakBest = submitResponse?.streakBest ?? results?.user?.streakBest ?? 0;
  const newPB = submitResponse?.newPersonalBest;
  const graceUsed = submitResponse?.graceUsed;

  const distribution = results?.distribution;

  return (
    <div className="daily-results-backdrop" role="dialog" aria-modal="true">
      <div className="daily-results-card">
        <button className="daily-results-close" onClick={onClose} aria-label={text('backToHome')}>
          ×
        </button>

        <div className="daily-header-label">
          {text('challengeNumber', { num: chNum })} · {dateLabel}
        </div>

        {disqualified && (
          <div className="daily-disqualified-ribbon">
            {text('dailyDisqualifiedRibbon')}
          </div>
        )}

        {!disqualified && newPB && (
          <div className="daily-personal-best-ribbon">{text('newPersonalBest')}</div>
        )}

        <div className={`daily-header-score ${scoreAnimating ? 'animating' : ''}`}>
          {Math.round(displayScore).toLocaleString()}
          <span className="max"> / {TOTAL_MAX.toLocaleString()}</span>
        </div>

        <Stars score={totalScore} />

        {typeof rank === 'number' && (
          <div className="daily-header-rank">
            <span className="rank-num">{text('rankOfTotal', { rank, total: totalPlays.toLocaleString() })}</span>
            {typeof percentile === 'number' && (
              <> · <span className="pct">{text('beatPctPlayers', { pct: percentile })}</span></>
            )}
          </div>
        )}

        <div className="daily-header-streak-row">
          {streak > 0 && (
            <span>🔥 {text('streakDay', { count: streak })}</span>
          )}
          {streakBest > 0 && (
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9em' }}>
              · {text('bestStreak', { count: streakBest })}
            </span>
          )}
          {graceUsed && (
            <span style={{ color: '#ffd27a', fontSize: '0.9em' }}>· {text('streakGraceUsed')}</span>
          )}
        </div>

        {submitResponse?.alreadySubmitted && (
          <div className="daily-already-played-inline">{text('alreadyPlayedToday')}</div>
        )}

        {/* Distribution */}
        <div className="daily-section">
          <div className="daily-section-title">{text('dailyScoreDistribution')}</div>
          <ScoreDistributionChart
            buckets={distribution?.buckets || []}
            totalPlays={distribution?.totalPlays || 0}
            userScore={totalScore}
          />
          <div className="daily-distribution-meta">
            <span>{text('averageScoreToday', { avg: distribution?.avgScore || 0 })}</span>
            <span>{text('sampleSize', { count: (distribution?.totalPlays || 0).toLocaleString() })}</span>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="daily-section">
          <div className="daily-section-title">{text('top10Today')}</div>
          <DailyLeaderboardPanel
            top10={results?.top10 || []}
            userRank={rank}
            userScore={totalScore}
            username={username}
            isLoggedIn={isLoggedIn}
            onSignIn={onSignIn}
          />
        </div>

        {/* History sparkline */}
        {isLoggedIn && (results?.user?.history?.length || 0) > 0 && (
          <div className="daily-section">
            <div className="daily-section-title">{text('past7Days')}</div>
            <DailyHistorySparkline history={results.user.history} />
          </div>
        )}

        {/* Round breakdown — bar graph */}
        <div className="daily-section">
          <div className="daily-section-title">{text('roundBreakdown')}</div>
          <RoundBarGraph rounds={rounds} roundAverages={distribution?.roundAverages || []} />
        </div>

        <div className="daily-actions">
          <button className="g2_green_button" onClick={() => setShowShare(true)}>
            <FaShareAlt style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {text('share')}
          </button>
          <button className="g2_green_button3" onClick={onClose}>
            <FaArrowLeft style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {text('backToHome')}
          </button>
        </div>
        <div className="daily-next-countdown">
          {countdown > 0
            ? text('nextChallengeIn', { time: formatCountdown(countdown) })
            : text('newChallengeReady')}
        </div>

        {loadingResults && (
          <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'center' }}>
            …
          </div>
        )}
      </div>

      {showShare && (
        <DailyShareModal
          rounds={rounds}
          totalScore={totalScore}
          challengeNumber={chNum}
          rank={rank}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
