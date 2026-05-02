import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaStar, FaShareAlt, FaArrowLeft, FaCheck } from 'react-icons/fa';
import sendEvent from '../utils/sendEvent';
import { useTranslation } from '@/components/useTranslations';
import { asset } from '@/lib/basePath';
import { formatCountdown, msUntilLocalMidnight, challengeNumber as computeChallengeNumber } from '@/utils/dailyDate';
import ScoreDistributionChart from './ScoreDistributionChart';

const MAX_PER_ROUND = 5000;
const TOTAL_MAX = 3 * MAX_PER_ROUND;

// Pick a quip deterministically from date + bracket so it stays the same
// whether the player sees the modal right after submit or reopens it later.
// A Math.random() with useRef would have been stable across re-renders but
// remount (close + reopen modal) would roll a new quip, which is jarring.
function hashStringToInt(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function useMotivationalQuip(score, date) {
  const { t: text } = useTranslation();
  if (score == null) return null;

  let bracket = 'Mid';
  if (score >= 12000) bracket = 'Good';
  else if (score < 6000) bracket = 'Bad';

  const idx = (hashStringToInt(`${date || ''}-${bracket}`) % 10) + 1;
  return text(`dailyQuip${bracket}${idx}`);
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

        // Only show a "% above avg" brag badge when the player is strictly
        // above the global average — matching or below-average results don't
        // belong in a celebratory results screen.
        let diffLabel = null;
        let diffClass = "";
        if (avg != null && r.score != null && avg > 0) {
          const diffPct = Math.round(((r.score - avg) / avg) * 100);
          if (diffPct > 0) {
            diffLabel = text('aboveAvg', { pct: diffPct });
            diffClass = "above-avg";
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

// Full-viewport celebratory flame burst — fires once when a submission lands
// and the streak is alive (started or extended). Self-unmounts after the
// animation so it doesn't re-trigger on re-renders. Pointer-events: none so
// it never blocks the results UI beneath it.
function StreakFlameBurst({ streak, onDone }) {
  const { t: text } = useTranslation();
  const [phase, setPhase] = useState('initial'); // initial -> entering -> holding -> leaving
  
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let t0;
    t0 = requestAnimationFrame(() => {
      t0 = requestAnimationFrame(() => setPhase('entering'));
    });
    const t1 = setTimeout(() => setPhase('holding'), 800);
    const t2 = setTimeout(() => setPhase('leaving'), 3500);
    const t3 = setTimeout(() => onDoneRef.current?.(), 4200);
    return () => { cancelAnimationFrame(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Professional particles: glowing embers instead of emojis
  const particles = useMemo(() => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() * 0.2);
      const dist = 60 + Math.random() * 120;
      out.push({
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - (Math.random() * 60), // drift up
        delay: Math.random() * 0.3,
        scale: 0.3 + Math.random() * 0.7,
        duration: 1.2 + Math.random() * 0.8,
      });
    }
    return out;
  }, []);

  return (
    <div className={`daily-flame-burst daily-flame-burst--${phase}`} aria-hidden="true">
      <div className="daily-flame-backdrop" />
      <div className="daily-flame-glow" />
      <div className="daily-flame-core">
        <div className="daily-flame-text">
          <span className="daily-flame-icon">🔥</span>
          <span className="daily-flame-number">{streak}</span>
        </div>
        <span className="daily-flame-label">
          {streak === 1 ? text('streakStarted') : text('streakExtended')}
        </span>
      </div>
      {particles.map(p => (
        <span
          key={p.id}
          className="daily-flame-ember"
          style={{
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--delay': `${p.delay}s`,
            '--scale': p.scale,
            '--duration': `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
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
  disqualified = false,
  onClose,
  onSignIn,
  inCoolMathGames = false,
}) {
  const { t: text } = useTranslation();
  const [displayScore, scoreAnimating] = useAnimatedNumber(totalScore);

  const rank = submitResponse?.rank ?? results?.user?.ownRank ?? null;
  const totalPlays = submitResponse?.totalPlays ?? results?.distribution?.totalPlays ?? 0;
  // On revisit the /results endpoint doesn't return percentile, only rank —
  // derive it with the same formula submit.js uses so the displayed number
  // is identical whether we arrived here from a fresh submit or a reopen.
  // "Beat X% of OTHER players" → denominator is totalPlays-1, so rank #1
  // shows 100%, not (N-1)/N.
  const percentile = typeof submitResponse?.percentile === 'number'
    ? submitResponse.percentile
    : (typeof rank === 'number' && totalPlays > 1
      ? Math.round(Math.max(0, Math.min(100, ((totalPlays - rank) / (totalPlays - 1)) * 100)))
      : null);
  const [displayPercentile] = useAnimatedNumber(percentile);
  const [shareCopied, setShareCopied] = useState(false);
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

  // Celebratory flame burst on streak start/extend. Guards:
  //  - only when we have a fresh submitResponse (not on re-open of old results)
  //  - not for disqualified runs
  //  - only if the streak is alive (>=1)
  //  - played at most once per mount via `flameShownRef`
  const [showFlame, setShowFlame] = useState(false);
  const flameShownRef = useRef(false);
  useEffect(() => {
    if (flameShownRef.current) return;
    if (disqualified) return;
    if (!submitResponse || !(submitResponse.streak > 0)) return;
    flameShownRef.current = true;
    // Small delay so it lands after the score count-up starts, then
    // overlaps dramatically with the star reveal.
    const t = setTimeout(() => setShowFlame(true), 500);
    return () => clearTimeout(t);
  }, [submitResponse, disqualified]);

  const chNum = useMemo(() => computeChallengeNumber(date), [date]);
  const dateLabel = useMemo(() => {
    try {
      const d = new Date(`${date}T00:00:00`);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return date; }
  }, [date]);

  const streak = submitResponse?.streak ?? results?.user?.streak ?? 0;
  const newPB = submitResponse?.newPersonalBest;
  const graceUsed = submitResponse?.graceUsed;
  const quip = useMotivationalQuip(totalScore, date);

  const distribution = results?.distribution;

  const handleShare = async () => {
    // toLocaleDateString embeds invisible bidi marks (\u200E, etc.) around
    // the date on some locales/platforms. They're fine in rendered HTML but
    // show up as `|` characters when pasted into plain-text share targets,
    // so strip them before using dateLabel in the share string.
    const cleanDate = (dateLabel || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '');
    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    // Fire the click event up front: measures share *intent*, not whether
    // the OS share sheet was completed (which is unmeasurable from JS).
    sendEvent('daily_share_click', {
      challenge_num: chNum,
      score: Math.round(totalScore),
      percentile: typeof percentile === 'number' ? percentile : null,
      streak,
      method: hasNativeShare ? 'native' : 'clipboard',
    });
    const title = text('dailyShareTitleDate', { date: cleanDate });
    const maxScore = (rounds?.length || 3) * MAX_PER_ROUND;
    // Percentile ("Beat n%") is friendlier to share than raw rank — no
    // leaderboard spoiler, and a big "Beat 92%" reads better than "#4".
    // Fall back to the plain score line when percentile isn't computable
    // (totalPlays<=1 or no rank yet).
    const scoreLine = typeof percentile === 'number'
      ? text('dailyShareScoreLinePct', { score: Math.round(totalScore), max: maxScore, pct: percentile })
      : text('dailyShareAnonLine', { score: Math.round(totalScore), max: maxScore });
    const emojis = (rounds || []).map(r => {
      if (r.score >= 3000) return '🟢';
      if (r.score >= 1500) return '🟡';
      return '🔴';
    }).join('');
    const url = typeof window !== 'undefined' ? `${window.location.origin}/daily` : 'worldguessr.com/daily';
    const shareText = `${title}\n${scoreLine}\n${emojis}\n${url}`;
    // Prefer the native share sheet where supported (mobile + some desktop).
    // Fall back to clipboard with a brief "Copied!" label. navigator.share
    // rejecting on user-cancel still falls through to clipboard — harmless.
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch { /* fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(shareText);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch { /* clipboard blocked — nothing to do */ }
  };

  return (
    <div className="daily-results-backdrop" role="dialog" aria-modal="true">
      {showFlame && (
        <StreakFlameBurst streak={streak} onDone={() => setShowFlame(false)} />
      )}
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
              &ldquo;{quip}&rdquo;
            </div>
          )}

          <div className="daily-header-streak-row">
            {streak > 0 && (
              <span>🔥 {text('streakDay', { count: streak })}</span>
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
          <div className="daily-stat-card" style={{ gridColumn: '1 / -1' }}>
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
            {typeof percentile === 'number' && typeof rank === 'number' && (distribution?.totalPlays || 0) > 1 && percentile >= 20 && (
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

        </div>

        <div className="daily-actions">
          <button
            className={`daily-share-btn${shareCopied ? ' is-copied' : ''}`}
            onClick={handleShare}
            aria-label={text('share')}
          >
            <span className="daily-share-btn__shine" aria-hidden="true" />
            <span className="daily-share-btn__icon" aria-hidden="true">
              {shareCopied ? <FaCheck /> : <FaShareAlt />}
            </span>
            <span className="daily-share-btn__label">
              {shareCopied ? text('shareCopied') : text('share')}
            </span>
          </button>
          <button className="daily-back-btn" onClick={onClose}>
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

    </div>
  );
}
