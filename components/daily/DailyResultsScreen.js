import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaXmark, FaShareNodes, FaRankingStar } from 'react-icons/fa6';
import { FaArrowLeft, FaCheck, FaFire, FaChartBar, FaClock, FaTrophy, FaMapMarkerAlt } from 'react-icons/fa';
import sendEvent from '../utils/sendEvent';
import { useTranslation } from '@/components/useTranslations';
import { formatCountdown, msUntilLocalMidnight, challengeNumber as computeChallengeNumber } from '@/utils/dailyDate';
import ScoreDistributionChart from './ScoreDistributionChart';

const MAX_PER_ROUND = 5000;
const TOTAL_MAX = 3 * MAX_PER_ROUND;

function roundTier(score) {
  if (score >= 3000) return 'good';
  if (score >= 1500) return 'mid';
  return 'low';
}

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

function useAnimatedNumber(target, durationMs = 900) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(0);
  useEffect(() => {
    if (typeof target !== 'number' || !Number.isFinite(target)) return;
    cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    fromRef.current = display;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 200 : durationMs;
    function step(t) {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / dur);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);
  return display;
}

export default function DailyResultsScreen({
  date,
  rounds,
  locations,
  totalScore,
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
  const displayScore = useAnimatedNumber(totalScore);

  const rank = submitResponse?.rank ?? results?.user?.ownRank ?? null;
  const totalPlays = submitResponse?.totalPlays ?? results?.distribution?.totalPlays ?? 0;
  const percentile = typeof submitResponse?.percentile === 'number'
    ? submitResponse.percentile
    : (typeof rank === 'number' && totalPlays > 1
      ? Math.round(Math.max(0, Math.min(100, ((totalPlays - rank) / (totalPlays - 1)) * 100)))
      : null);
  const [shareCopied, setShareCopied] = useState(false);
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const chNum = useMemo(() => computeChallengeNumber(date), [date]);
  const dateLabel = useMemo(() => {
    try {
      const d = new Date(`${date}T00:00:00`);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return date; }
  }, [date]);

  const streak = submitResponse?.streak ?? results?.user?.streak ?? 0;
  const newPB = submitResponse?.newPersonalBest;
  const distribution = results?.distribution;
  const quip = useMotivationalQuip(totalScore, date);

  const handleShare = async () => {
    const cleanDate = (dateLabel || '').replace(/[‎‏‪-‮]/g, '');
    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    sendEvent('daily_share_click', {
      challenge_num: chNum,
      score: Math.round(totalScore),
      percentile: typeof percentile === 'number' ? percentile : null,
      streak,
      method: hasNativeShare ? 'native' : 'clipboard',
    });
    const title = text('dailyShareTitleDate', { date: cleanDate });
    const maxScore = (rounds?.length || 3) * MAX_PER_ROUND;
    const scoreLine = typeof percentile === 'number'
      ? text('dailyShareScoreLinePct', { score: Math.round(totalScore), max: maxScore, pct: percentile })
      : text('dailyShareAnonLine', { score: Math.round(totalScore), max: maxScore });
    const emojis = (rounds || []).map(r => {
      if (r.score >= 3000) return '🟢';
      if (r.score >= 1500) return '🟡';
      return '🔴';
    }).join('');
    const url = typeof window !== 'undefined' ? window.location.origin : 'worldguessr.com';
    const shareText = `${title}\n${scoreLine}\n${emojis}\n${url}`;
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
    } catch {  }
  };

  const scorePct = Math.max(0, Math.min(100, (totalScore / TOTAL_MAX) * 100));

  return (
    <div className="wg-dailyResults" role="dialog" aria-modal="true">
      <div className="wg-dailyResults__scrim" onClick={onClose} aria-hidden="true" />

      <div className="wg-dailyResults__card">
        <div className="wg-dailyResults__topbar">
          <button
            type="button"
            className="wg-dailyResults__close"
            onClick={onClose}
            aria-label={text('backToHome') || 'Close'}
          >
            <FaXmark />
          </button>
          <div className="wg-dailyResults__topbarMain">
            <span className="wg-dailyResults__challengeNum">
              {text('challengeNumber', { num: chNum })}
            </span>
            <span className="wg-dailyResults__dateLabel">{dateLabel}</span>
          </div>
          {streak > 0 && !disqualified && (
            <div className="wg-dailyResults__streakChip">
              <FaFire />
              <span>{text('streakDay', { count: streak }) || `${streak}-day streak`}</span>
            </div>
          )}
        </div>

        <div className="wg-dailyResults__body">
          {disqualified && (
            <div className="wg-dailyResults__notice wg-dailyResults__notice--warn">
              {text('dailyDisqualifiedRibbon') || 'This run was disqualified.'}
            </div>
          )}
          {!disqualified && newPB && (
            <div className="wg-dailyResults__notice wg-dailyResults__notice--ok">
              <FaTrophy />
              <span>{text('newPersonalBest') || 'New personal best!'}</span>
            </div>
          )}

          <section className="wg-dailyResults__hero">
            <div className="wg-dailyResults__scoreRow">
              <span className="wg-dailyResults__scoreVal">
                {Math.round(displayScore).toLocaleString()}
              </span>
              <span className="wg-dailyResults__scoreMax">
                / {TOTAL_MAX.toLocaleString()}
              </span>
            </div>
            <div className="wg-dailyResults__scoreBar" aria-hidden="true">
              <div
                className="wg-dailyResults__scoreBarFill"
                style={{ width: `${scorePct}%` }}
              />
            </div>
            {quip && (
              <p className="wg-dailyResults__quip">&ldquo;{quip}&rdquo;</p>
            )}
          </section>

          {typeof rank === 'number' && (distribution?.totalPlays || totalPlays) > 1 && (
            <section className="wg-dailyResults__rankRow">
              <div className="wg-dailyResults__rankCell">
                <span className="wg-dailyResults__rankLbl">
                  <FaRankingStar aria-hidden="true" />
                  Rank
                </span>
                <span className="wg-dailyResults__rankVal">
                  #{rank}
                  <span className="wg-dailyResults__rankSuffix">
                    {' '}/ {(distribution?.totalPlays || totalPlays).toLocaleString()}
                  </span>
                </span>
              </div>
              {typeof percentile === 'number' && percentile >= 20 && (
                <div className="wg-dailyResults__rankCell">
                  <span className="wg-dailyResults__rankLbl">Beat</span>
                  <span className="wg-dailyResults__rankVal">{percentile}%</span>
                </div>
              )}
            </section>
          )}

          <section className="wg-dailyResults__section">
            <h3 className="wg-dailyResults__sectionTitle">
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{text('roundBreakdown') || 'Round breakdown'}</span>
            </h3>
            <div className="wg-dailyResults__rounds">
              {(rounds || []).map((r, i) => {
                const tier = roundTier(r.score || 0);
                const loc = locations?.[i];
                const mapUrl = !inCoolMathGames && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.long)
                  ? `https://www.google.com/maps?q=${loc.lat},${loc.long}`
                  : null;
                const content = (
                  <>
                    <div className="wg-dailyResults__roundHead">
                      <span className="wg-dailyResults__roundNum">
                        {text('roundNumber', { round: `#${i + 1}` }) || `Round ${i + 1}`}
                      </span>
                      <span className={`wg-dailyResults__roundDot wg-dailyResults__roundDot--${tier}`} />
                    </div>
                    <div className="wg-dailyResults__roundScore">
                      {Math.round(r.score || 0).toLocaleString()}
                      <span className="wg-dailyResults__roundMax"> / {MAX_PER_ROUND.toLocaleString()}</span>
                    </div>
                    <div className="wg-dailyResults__roundBar" aria-hidden="true">
                      <div
                        className={`wg-dailyResults__roundBarFill wg-dailyResults__roundBarFill--${tier}`}
                        style={{ width: `${Math.max(0, Math.min(100, ((r.score || 0) / MAX_PER_ROUND) * 100))}%` }}
                      />
                    </div>
                    {mapUrl && (
                      <span className="wg-dailyResults__roundMapHint">
                        {text('openInMaps') || 'Open in Maps'} →
                      </span>
                    )}
                  </>
                );
                if (mapUrl) {
                  return (
                    <a
                      key={i}
                      className="wg-dailyResults__round wg-dailyResults__round--link"
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {content}
                    </a>
                  );
                }
                return (
                  <div key={i} className="wg-dailyResults__round">
                    {content}
                  </div>
                );
              })}
            </div>
          </section>

          {(distribution?.totalPlays || 0) >= 10 && (
            <section className="wg-dailyResults__section">
              <h3 className="wg-dailyResults__sectionTitle">
                <FaChartBar aria-hidden="true" />
                <span>{text('dailyScoreDistribution') || 'Score distribution'}</span>
              </h3>
              <div className="wg-dailyResults__chart">
                <ScoreDistributionChart
                  buckets={distribution?.buckets || []}
                  totalPlays={distribution?.totalPlays || 0}
                  userScore={totalScore}
                />
              </div>
              <div className="wg-dailyResults__chartMeta">
                <span>{text('averageScoreToday', { avg: distribution?.avgScore || 0 })}</span>
                <span>{text('sampleSize', { count: (distribution?.totalPlays || 0).toLocaleString() })}</span>
              </div>
            </section>
          )}
          {(distribution?.totalPlays || 0) < 10 && !loadingResults && (
            <section className="wg-dailyResults__section">
              <div className="wg-dailyResults__empty">
                {text('tooFewPlaysForChart') || 'Not enough plays yet to show a distribution.'}
              </div>
            </section>
          )}
        </div>

        <div className="wg-dailyResults__footer">
          <div className="wg-dailyResults__actions">
            <button
              type="button"
              className={`wg-dailyResults__share ${shareCopied ? 'wg-dailyResults__share--copied' : ''}`}
              onClick={handleShare}
            >
              {shareCopied ? <FaCheck /> : <FaShareNodes />}
              <span>{shareCopied ? (text('shareCopied') || 'Copied!') : (text('share') || 'Share')}</span>
            </button>
            <button
              type="button"
              className="wg-dailyResults__back"
              onClick={onClose}
            >
              <FaArrowLeft />
              <span>{text('backToHome') || 'Back to home'}</span>
            </button>
          </div>
          <div className="wg-dailyResults__nextChip">
            <FaClock aria-hidden="true" />
            <span>
              {countdown > 0
                ? (text('nextChallengeIn', { time: formatCountdown(countdown) })
                    || `Next in ${formatCountdown(countdown)}`)
                : (text('newChallengeReady') || 'New challenge ready!')}
            </span>
          </div>
          {!isLoggedIn && (
            <p className="wg-dailyResults__signinHint">
              {text('dailyLandingLoggedOutPrompt') || 'Sign in to save your streak.'}
              {onSignIn && (
                <button type="button" className="wg-dailyResults__signin" onClick={onSignIn}>
                  {text('signIn') || 'Sign in'}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
