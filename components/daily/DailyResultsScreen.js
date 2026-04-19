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
const TOTAL_MAX = 3 * MAX_PER_ROUND;

// Pick a quip ONCE when score arrives, and keep it stable across re-renders.
// `text` from useTranslation re-identifies on every render, so useMemo with
// it in deps would roll a new random each render — we separate the random
// index (cached in a ref, tied only to the score bracket) from the lookup.
function useMotivationalQuip(score) {
  const { t: text } = useTranslation();
  const quipRef = useRef({ bracket: null, idx: null });

  if (score == null) return null;

  let bracket = 'Mid';
  if (score >= 12000) bracket = 'Good';
  else if (score < 6000) bracket = 'Bad';

  if (quipRef.current.bracket !== bracket) {
    quipRef.current = {
      bracket,
      idx: Math.floor(Math.random() * 10) + 1,
    };
  }

  return text(`dailyQuip${bracket}${quipRef.current.idx}`);
}

// Palette + thresholds mirror components/roundOverScreen.js:213-242 so the
// Daily stars match the rest of the game exactly (same tiers, same cutoffs).
const STAR_COLORS = {
  bronze: '#b6b2b2',
  silver: '#CD7F32',
  gold: 'gold',
  platinum: 'platinum', // sentinel — rendered as the platinum_star.png image
};

function starsFromPercent(percent) {
  if (percent <= 20) return ['bronze'];
  if (percent <= 40) return ['bronze', 'bronze'];
  if (percent <= 50) return ['bronze', 'bronze', 'bronze'];
  if (percent <= 65) return ['silver', 'silver', 'silver'];
  if (percent <= 85) return ['gold', 'gold', 'gold'];
  return ['platinum', 'platinum', 'platinum'];
}

// Bar accent color matches the guess-line color used in roundOverScreen.js
// (green/amber/red by absolute points).
function barColorForScore(score) {
  if (score >= 3000) return '#4CAF50';
  if (score >= 1500) return '#FFC107';
  return '#F44336';
}

function RoundBadges({ rounds, roundAverages = [], locations = [], allowMapLinks = true }) {
  const { t: text } = useTranslation();
  return (
    <div className="daily-round-badges" aria-label={text('roundBreakdown')}>
      {rounds.map((r, i) => {
        const perfect = r.score >= 4850;
        const avg = Number.isFinite(roundAverages[i]) ? roundAverages[i] : null;
        const loc = locations[i];
        const mapUrl = allowMapLinks && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.long)
          ? `https://www.google.com/maps?q=${loc.lat},${loc.long}`
          : null;

        // Only show a "% above avg" brag badge when the player is at or
        // above the global average — below-average shaming doesn't belong
        // in a celebratory results screen.
        let diffLabel = null;
        let diffClass = "";
        if (avg != null && r.score != null && avg > 0) {
          const diffPct = Math.round(((r.score - avg) / avg) * 100);
          if (diffPct > 0) {
            diffLabel = text('aboveAvg', { pct: diffPct });
            diffClass = "above-avg";
          } else if (diffPct === 0) {
            diffLabel = text('exactAvg');
            diffClass = "exact-avg";
          }
        } else if (avg === 0 && r.score > 0) {
          diffLabel = text('aboveAvg', { pct: 100 });
          diffClass = "above-avg";
        }

        const style = { '--badge-color': barColorForScore(r.score || 0), animationDelay: `${i * 0.1}s` };

        const content = (
          <>
            <div className="daily-round-badge-num">{text('roundNumber', { round: `#${i + 1}` })}</div>
            <div className="daily-round-badge-score">
              {Math.round(r.score).toLocaleString()}
            </div>
            {diffLabel && (
              <div className={`daily-round-badge-diff ${diffClass}`}>
                {diffLabel}
              </div>
            )}
            {perfect && <div className="daily-round-badge-star" title={text('perfectRound')}>★</div>}
          </>
        );

        if (mapUrl) {
          return (
            <a
              key={i}
              className="daily-round-badge-item daily-round-badge-item--clickable"
              style={style}
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
              <div className="daily-round-badge-map-hint">{text('openInMaps')}</div>
            </a>
          );
        }

        return (
          <div
            className="daily-round-badge-item"
            key={i}
            style={style}
          >
            {content}
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
  inCoolMathGames = false,
}) {
  const { t: text } = useTranslation();
  const [displayScore, scoreAnimating] = useAnimatedNumber(totalScore);
  const [displayPercentile] = useAnimatedNumber(
    typeof submitResponse?.percentile === 'number' ? submitResponse.percentile : null
  );
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
  const quip = useMotivationalQuip(totalScore);

  const distribution = results?.distribution;

  return (
    <div className="daily-results-backdrop" role="dialog" aria-modal="true">
      <div className="daily-results-card">
        <button className="daily-results-close" onClick={onClose} aria-label={text('backToHome')}>
          ×
        </button>

        <div className="daily-hero-section">
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

          {quip && (
            <div className="daily-motivational-quip">
              "{quip}"
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
        </div>

        {submitResponse?.alreadySubmitted && (
          <div className="daily-already-played-inline">{text('alreadyPlayedToday')}</div>
        )}

        {/* Round breakdown — badges */}
        <RoundBadges
          rounds={rounds}
          roundAverages={distribution?.roundAverages || []}
          locations={locations}
          allowMapLinks={!inCoolMathGames}
        />

        <div className="daily-stats-grid">
          {/* Distribution */}
          <div className="daily-stat-card">
            <div className="daily-stat-title">{text('dailyScoreDistribution')}</div>
            {(distribution?.totalPlays || 0) >= 10 ? (
              <ScoreDistributionChart
                buckets={distribution?.buckets || []}
                totalPlays={distribution?.totalPlays || 0}
                userScore={totalScore}
              />
            ) : (
              <div className="daily-distribution-empty">{text('tooFewPlaysForChart')}</div>
            )}
            <div className="daily-distribution-meta">
              <span>{text('averageScoreToday', { avg: distribution?.avgScore || 0 })}</span>
              <span>{text('sampleSize', { count: (distribution?.totalPlays || 0).toLocaleString() })}</span>
            </div>
            {typeof percentile === 'number' && typeof rank === 'number' && (distribution?.totalPlays || 0) > 1 && (
              <div className="daily-distribution-standing">
                <span className="daily-distribution-pct">
                  {text('beatPctPlayers', { pct: Math.round(displayPercentile) })}
                </span>
                <span className="daily-distribution-rank">
                  {text('rankOfTotal', { rank, total: (distribution?.totalPlays || totalPlays).toLocaleString() })}
                </span>
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="daily-stat-card">
            <div className="daily-stat-title">{text('top10Today')}</div>
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
            <div className="daily-stat-card" style={{ gridColumn: '1 / -1' }}>
              <div className="daily-stat-title">{text('past7Days')}</div>
              <DailyHistorySparkline history={results.user.history} />
            </div>
          )}
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
