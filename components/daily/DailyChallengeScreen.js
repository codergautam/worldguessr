import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'react-toastify';
import { FaCalendarDay, FaExclamationTriangle, FaArrowRight } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import { signIn } from '@/components/auth/auth';
import { getClientLocalDate } from '@/utils/dailyDate';
import { useDailyChallenge } from './useDailyChallenge';
import DailyLanding from './DailyLanding';
import DailyResultsScreen from './DailyResultsScreen';

const GameUI = dynamic(() => import('@/components/gameUI'), { ssr: false });

function DailyRoundBadge({ round, total }) {
  const { t: text } = useTranslation();
  const dots = [];
  for (let i = 0; i < total; i++) {
    let cls = 'dot';
    if (i < round - 1) cls += ' done';
    else if (i === round - 1) cls += ' current';
    dots.push(<span key={i} className={cls} />);
  }
  return (
    <div className="daily-round-badge">
      <span aria-hidden="true">🗓</span>
      <span>{text('dailyRoundBadge', { round, total })}</span>
      <span className="dot-row">{dots}</span>
    </div>
  );
}

function ConfirmStartModal({ onConfirm, onCancel }) {
  const { t: text } = useTranslation();
  return (
    <div className="daily-confirm-modal" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="daily-confirm-card daily-confirm-card--start" onClick={e => e.stopPropagation()}>
        <div className="daily-confirm-icon" aria-hidden="true">
          <FaCalendarDay />
        </div>
        <h3>{text('dailyChallenge')}</h3>
        <p className="daily-confirm-tagline">{text('confirmStartDaily')}</p>
        <div className="daily-confirm-warning" role="note">
          <FaExclamationTriangle aria-hidden="true" />
          <span>{text('confirmStartDailyWarning')}</span>
        </div>
        <div className="daily-confirm-actions daily-confirm-actions--stacked">
          <button type="button" className="daily-confirm-primary" onClick={onConfirm} autoFocus>
            <span>{text('startDailyChallenge')}</span>
            <FaArrowRight aria-hidden="true" />
          </button>
          <button type="button" className="daily-confirm-cancel" onClick={onCancel}>
            {text('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisqualifiedModal({ onClose, alreadyDone = false }) {
  const { t: text } = useTranslation();
  // Two contexts share this modal:
  //  - mid-game: tab-switch just disqualified the run; "keep playing" wording
  //  - re-entry: user comes back later and tries to start; "try tomorrow"
  const titleKey = alreadyDone ? 'dailyAlreadyDisqualifiedTitle' : 'dailyDisqualifiedTitle';
  const descKey = alreadyDone ? 'dailyAlreadyDisqualifiedDesc' : 'dailyDisqualifiedDesc';
  return (
    <div className="daily-confirm-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="daily-confirm-card" onClick={e => e.stopPropagation()}>
        <h3>{text(titleKey)}</h3>
        <p>{text(descKey)}</p>
        <div className="daily-confirm-actions">
          <button className="g2_green_button" onClick={onClose}>{text('gotIt')}</button>
        </div>
      </div>
    </div>
  );
}

export default function DailyChallengeScreen({
  session,
  options,
  onExit,
  inCrazyGames,
  inCoolMathGames,
  inGameDistribution,
  landingBootstrap = null,
  // Shared state from home.js so we use the single top-level StreetView:
  latLong,
  setLatLong,
  setLatLongKey,
  loading,
  setLoading,
  onPhaseChange,
}) {
  const { t: text } = useTranslation();
  const today = getClientLocalDate();
  const { locationData, locationError, fetchLocations, results, fetchResults, submit, loadingResults, claimResult, dismissClaimResult } = useDailyChallenge({ session });

  // Surface the post-signin claim outcome as a toast. Fires once per merge.
  useEffect(() => {
    if (!claimResult) return;
    if (claimResult.ok) {
      const key = claimResult.mergedDays === 1 ? 'dailyGuestClaimedSingle' : 'dailyGuestClaimed';
      toast.success(text(key, { mergedDays: claimResult.mergedDays, streak: claimResult.streak }), {
        autoClose: 6000, closeOnClick: true, theme: 'dark',
      });
    } else if (claimResult.code === 'ALREADY_CLAIMED') {
      toast.info(text('dailyGuestAlreadyClaimed'), { autoClose: 5000, theme: 'dark' });
    }
    // NO_PROFILE / NETWORK / ERROR are silent — not useful to the user.
    dismissClaimResult();
  }, [claimResult, text, dismissClaimResult]);

  const [phase, setPhase] = useState('landing');

  // Surface phase changes to home.js so the navbar can hide its back button
  // only during the actual round (phase === 'game'), not on landing/results.
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // If /api/dailyChallenge/locations errors out, the previous behavior was
  // to leave the user staring at a blank "daily-loading" shell forever
  // because phase stays 'loading' without locationData. Surface a toast and
  // drop them back to the landing so they can retry.
  // The hook stores a fresh Error on each failure, so a ref is enough to
  // dedupe — every retry that fails again toasts again.
  const lastLocationErrorRef = useRef(null);
  useEffect(() => {
    if (!locationError) return;
    if (lastLocationErrorRef.current === locationError) return;
    lastLocationErrorRef.current = locationError;
    toast.error(text('dailyLocationsLoadFailed'));
    setPhase((prev) => (prev === 'loading' || prev === 'confirming' ? 'landing' : prev));
  }, [locationError, text]);

  // Local game state (kept here, not in home — only StreetView inputs are shared)
  const [showAnswer, setShowAnswer] = useState(false);
  const [pinPoint, setPinPoint] = useState(null);
  const [hintShown, setHintShown] = useState(false);
  const [miniMapShown, setMiniMapShown] = useState(false);
  const [singlePlayerRound, setSinglePlayerRound] = useState(null);
  const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
  const [showPanoOnResult, setShowPanoOnResult] = useState(false);
  const [finalRounds, setFinalRounds] = useState(null);
  const [submitResponse, setSubmitResponse] = useState(null);
  // If user tab-switches / blurs window during the game, the score is
  // submitted as disqualified — counted in anon distribution only, no
  // leaderboard entry, no streak, no XP, no game history.
  const [disqualified, setDisqualified] = useState(false);
  const [showDisqualifiedModal, setShowDisqualifiedModal] = useState(false);
  const [gameOptions, setGameOptions] = useState({
    location: 'daily',
    maxDist: 20000,
    official: false,
    countryMap: false,
    communityMapName: '',
    extent: null,
    showRoadName: true,
    timePerRound: 60,
  });

  // Load user's current results (streak/etc) for landing + menu badges
  useEffect(() => { fetchResults(); }, [fetchResults]);

  // Prefetch locations as soon as the user opens the confirm dialog so that
  // by the time they click Start, the data is usually already in hand and we
  // can skip the "Loading today's challenge…" flicker entirely. Also fetched
  // on `results` so that revisiting the results screen (after already playing)
  // still has the locations needed to build the per-round Street View links.
  useEffect(() => {
    if ((phase === 'confirming' || phase === 'loading' || phase === 'results') && !locationData) {
      fetchLocations();
    }
  }, [phase, locationData, fetchLocations]);

  // Transition to game once locations are in
  useEffect(() => {
    if (phase === 'loading' && locationData?.locations?.length) {
      setSinglePlayerRound({
        round: 1,
        totalRounds: locationData.locations.length,
        locations: [],
      });
      setShowAnswer(false);
      setPinPoint(null);
      setHintShown(false);
      setPhase('game');
    }
  }, [phase, locationData]);

  // Drive home's latLong from singlePlayerRound.round (source of truth).
  // Also resets per-round UI state (showAnswer, pin, hint, loading).
  const currentRound = singlePlayerRound?.round || 1;
  useEffect(() => {
    if (phase !== 'game' || !locationData?.locations) return;
    const loc = locationData.locations[currentRound - 1];
    if (!loc) return;
    setShowAnswer(false);
    setPinPoint(null);
    setHintShown(false);
    setLoading(true);
    setLatLong({
      lat: loc.lat,
      long: loc.long,
      heading: loc.heading,
      country: loc.country,
    });
    setLatLongKey(k => k + 1);
  }, [phase, currentRound, locationData, setLatLong, setLatLongKey, setLoading]);

  // Clean up home's StreetView when not actively in-game
  useEffect(() => {
    if (phase === 'landing' || phase === 'confirming' || phase === 'results' || phase === 'submitting') {
      setLatLong(null);
    }
  }, [phase, setLatLong]);

  // Disqualify the run if the player switches tabs / minimizes / hides the
  // page while actively playing. We intentionally only listen to
  // `visibilitychange` (not `window.blur`) because the Street View iframe
  // stealing focus fires `blur` on the window even though the tab is still
  // visible — that would give false positives.
  useEffect(() => {
    if (phase !== 'game') return;
    if (disqualified) return;
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setDisqualified(true);
        setShowDisqualifiedModal(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, disqualified]);

  // gameUI.js calls this on its mount and after each round; with the derivation
  // effect above driving latLong, nothing for us to do here.
  const loadLocation = useCallback(() => {}, []);

  const handleStart = useCallback(() => {
    // DQ from an earlier attempt today locks the date — surface the same
    // modal we show mid-game rather than letting them queue a new run.
    if (results?.user?.disqualifiedToday) {
      setShowDisqualifiedModal(true);
      return;
    }
    if (results?.user?.playedToday) {
      setPhase('results');
      return;
    }
    setPhase('confirming');
  }, [results]);

  const handleConfirmStart = useCallback(() => {
    // If the prefetch already landed, skip the 'loading' screen and jump
    // straight into the game to avoid a brief flicker.
    if (locationData?.locations?.length) {
      setSinglePlayerRound({
        round: 1,
        totalRounds: locationData.locations.length,
        locations: [],
      });
      setShowAnswer(false);
      setPinPoint(null);
      setHintShown(false);
      setPhase('game');
    } else {
      setPhase('loading');
    }
  }, [locationData]);

  const handleRoundsComplete = useCallback(async (completedLocations) => {
    // Distance is derived on the server from the canonical daily locations;
    // the client just reports the guess coords.
    const rounds = (completedLocations || []).map(l => ({
      score: Math.round(l.points ?? 0),
      timeMs: typeof l.timeTaken === 'number' ? l.timeTaken * 1000 : null,
      guessLat: typeof l.guessLat === 'number' ? l.guessLat : null,
      guessLng: typeof l.guessLong === 'number' ? l.guessLong : null,
      country: typeof l.country === 'string' ? l.country : null,
    }));
    const totalScore = rounds.reduce((s, r) => s + (r.score || 0), 0);
    const totalTime = rounds.reduce((s, r) => s + (r.timeMs || 0), 0);
    setFinalRounds(rounds);
    // Immediately swap to a dedicated 'submitting' phase so the user sees
    // a clear loading state instead of a stale Street View while the
    // submit + results round-trips happen.
    setPhase('submitting');
    try {
      const response = await submit({
        rounds,
        totalScore,
        totalTime,
        sessionToken: locationData?.sessionToken,
        disqualified,
      });
      setSubmitResponse(response);
    } catch (err) {
      console.error('[daily submit]', err);
      setSubmitResponse({ error: true, score: totalScore, disqualified });
    }
    // Reveal the results screen as soon as submit returns — fetchResults
    // (distribution + top10) runs in the background and the results card
    // already gracefully handles the loadingResults state. This roughly
    // halves the wait the user perceives between last round and modal.
    setPhase('results');
    fetchResults();
  }, [submit, locationData, fetchResults, disqualified]);

  // When the user re-opens the daily after already playing, we don't have
  // local finalRounds / submitResponse — fall back to what the server already
  // persisted for today's challenge.
  const effectiveRounds = useMemo(() => {
    if (finalRounds && finalRounds.length > 0) return finalRounds;
    const own = results?.user?.ownRounds;
    if (Array.isArray(own) && own.length > 0) {
      return own.map(r => ({
        score: r.score ?? 0,
        distance: r.distance ?? null,
        timeMs: r.timeMs ?? null,
        guessLat: r.guessLat ?? null,
        guessLng: r.guessLng ?? null,
        country: r.country ?? null,
      }));
    }
    return [];
  }, [finalRounds, results]);

  const totalScore = useMemo(() => {
    if (submitResponse?.score != null) return submitResponse.score;
    if (results?.user?.ownScore != null) return results.user.ownScore;
    return effectiveRounds.reduce((s, r) => s + (r.score || 0), 0);
  }, [submitResponse, effectiveRounds, results]);

  const [landingEntranceActive, setLandingEntranceActive] = useState(true);

  // --- render ---

  // Session race: home.js seeds `session` as `false` and only fills it from
  // useSession() (NextAuth) on the next tick. Rendering DailyLanding before
  // that lands flashes the logged-out variant (sign-in prompts, "lock in
  // streak" CTA) at a user who actually IS logged in — then snaps back when
  // the token shows up. Detect "session expected" via the wg_secret stored
  // on login, then block the landing until it resolves (with a hard timeout
  // so a stale wg_secret can't lock the page forever).
  const sessionResolved = !!session?.token?.secret;
  const [sessionGracePassed, setSessionGracePassed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return !window.localStorage.getItem('wg_secret'); } catch { return true; }
  });
  useEffect(() => {
    if (sessionResolved || sessionGracePassed) return;
    const t = setTimeout(() => setSessionGracePassed(true), 1500);
    return () => clearTimeout(t);
  }, [sessionResolved, sessionGracePassed]);
  const sessionReady = sessionResolved || sessionGracePassed;

  // Cold-mount guard: with no cache and the first fetch still in flight, the
  // landing would otherwise paint with empty top10, no streak, and a "Next
  // challenge in…" CTA that may flip to "View results" half a second later.
  // Show a brief loading screen instead so the landing only ever appears with
  // its real values. landingBootstrap (if provided) gives us userData up
  // front, in which case we can render immediately.
  const landingHasData = !!results || !!landingBootstrap?.userData;
  const landingShouldWait = !sessionReady || (!landingHasData && loadingResults);
  useEffect(() => {
    if (phase !== 'landing' || landingShouldWait || !landingEntranceActive) return;
    const t = setTimeout(() => setLandingEntranceActive(false), 750);
    return () => clearTimeout(t);
  }, [phase, landingShouldWait, landingEntranceActive]);
  const renderDailyShell = content => (
    <>
      <div
        className={`daily-page-backdrop ${landingEntranceActive ? 'daily-page-backdrop--opening' : ''}`}
        aria-hidden="true"
      />
      {content}
    </>
  );
  if (phase === 'landing' && landingShouldWait) {
    return renderDailyShell(
      <div className="daily-loading">
      </div>
    );
  }

  if (phase === 'landing' || phase === 'confirming') {
    const landing = (
      <DailyLanding
        today={today}
        todayTop10={results?.top10 || []}
        userData={results?.user || landingBootstrap?.userData}
        isLoggedIn={!!session?.token?.secret}
        onStartChallenge={handleStart}
        onSignIn={() => signIn()}
        animateEntrance={phase === 'landing' && landingEntranceActive}
      />
    );

    if (phase === 'landing') {
      return renderDailyShell(
        <>
          {landing}
          {showDisqualifiedModal && (
            <DisqualifiedModal
              alreadyDone
              onClose={() => setShowDisqualifiedModal(false)}
            />
          )}
        </>
      );
    }

    return renderDailyShell(
      <>
        {landing}
        <ConfirmStartModal
          onConfirm={handleConfirmStart}
          onCancel={() => setPhase('landing')}
        />
      </>
    );
  }

  if (phase === 'loading' || (phase === 'game' && !locationData)) {
    return renderDailyShell(
      <div className="daily-loading">
      </div>
    );
  }

  // Post-game submit state: the user has finished the last round and we're
  // waiting on /api/dailyChallenge/submit to come back with rank/streak.
  // Show an explicit "Tallying your score…" overlay instead of a stale
  // Street View, which felt like the game had hung.
  if (phase === 'submitting') {
    return renderDailyShell(
      <div className="daily-submitting" role="status" aria-live="polite">
        <div className="daily-submitting__card">
          <div className="daily-submitting__spinner" aria-hidden="true" />
          <div className="daily-submitting__title">{text('dailySubmittingScore')}</div>
          <div className="daily-submitting__hint">{text('dailySubmittingHint')}</div>
        </div>
      </div>
    );
  }

  if (phase === 'game') {
    return (
      <div className="daily-game-shell">

        {showDisqualifiedModal && (
          <DisqualifiedModal onClose={() => setShowDisqualifiedModal(false)} />
        )}

        <GameUI
          dailyMode
          onRoundsComplete={handleRoundsComplete}
          inCoolMathGames={inCoolMathGames}
          inGameDistribution={inGameDistribution}
          inCrazyGames={inCrazyGames}
          miniMapShown={miniMapShown}
          setMiniMapShown={setMiniMapShown}
          singlePlayerRound={singlePlayerRound}
          setSinglePlayerRound={setSinglePlayerRound}
          showPanoOnResult={showPanoOnResult}
          setShowPanoOnResult={setShowPanoOnResult}
          options={options}
          countryStreak={0}
          setCountryStreak={() => {}}
          hintShown={hintShown}
          setHintShown={setHintShown}
          pinPoint={pinPoint}
          setPinPoint={setPinPoint}
          showAnswer={showAnswer}
          setShowAnswer={setShowAnswer}
          loading={loading}
          setLoading={setLoading}
          session={session}
          gameOptionsModalShown={gameOptionsModalShown}
          setGameOptionsModalShown={setGameOptionsModalShown}
          mapModal={false}
          latLong={latLong}
          loadLocation={loadLocation}
          gameOptions={gameOptions}
          setGameOptions={setGameOptions}
        />
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <DailyResultsScreen
        date={today}
        rounds={effectiveRounds}
        locations={locationData?.locations || []}
        totalScore={totalScore}
        submitResponse={submitResponse}
        results={results}
        loadingResults={loadingResults}
        isLoggedIn={!!session?.token?.secret}
        disqualified={disqualified || submitResponse?.disqualified}
        onClose={onExit}
        onSignIn={() => signIn()}
        inCoolMathGames={inCoolMathGames}
      />
    );
  }

  return null;
}
