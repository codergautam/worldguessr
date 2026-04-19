import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
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
      <div className="daily-confirm-card" onClick={e => e.stopPropagation()}>
        <h3>{text('dailyChallenge')}</h3>
        <p>{text('confirmStartDaily')}</p>
        <div className="daily-confirm-actions">
          <button className="g2_green_button" onClick={onConfirm}>{text('startDailyChallenge')}</button>
          <button className="g2_green_button3" onClick={onCancel}>{text('cancel')}</button>
        </div>
      </div>
    </div>
  );
}

function DisqualifiedModal({ onClose }) {
  const { t: text } = useTranslation();
  return (
    <div className="daily-confirm-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="daily-confirm-card" onClick={e => e.stopPropagation()}>
        <h3>{text('dailyDisqualifiedTitle')}</h3>
        <p>{text('dailyDisqualifiedDesc')}</p>
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
}) {
  const { t: text } = useTranslation();
  const today = getClientLocalDate();
  const { locationData, fetchLocations, results, fetchResults, submit, loadingResults } = useDailyChallenge({ session });

  const [phase, setPhase] = useState('landing');

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
  // can skip the "Loading today's challenge…" flicker entirely.
  useEffect(() => {
    if ((phase === 'confirming' || phase === 'loading') && !locationData) {
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
    if (phase === 'landing' || phase === 'confirming' || phase === 'results') {
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
    await fetchResults();
    setPhase('results');
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

  // --- render ---

  if (phase === 'landing') {
    return (
      <DailyLanding
        today={today}
        todayTop10={results?.top10 || []}
        userData={results?.user || landingBootstrap?.userData}
        isLoggedIn={!!session?.token?.secret}
        onStartChallenge={handleStart}
        onSignIn={() => signIn()}
      />
    );
  }

  if (phase === 'confirming') {
    return (
      <>
        <DailyLanding
          today={today}
          todayTop10={results?.top10 || []}
          userData={results?.user || landingBootstrap?.userData}
          isLoggedIn={!!session?.token?.secret}
          onStartChallenge={handleStart}
          onSignIn={() => signIn()}
        />
        <ConfirmStartModal
          onConfirm={handleConfirmStart}
          onCancel={() => setPhase('landing')}
        />
      </>
    );
  }

  if (phase === 'loading' || (phase === 'game' && !locationData)) {
    return (
      <div className="daily-loading">
        <p>{text('loadingDailyChallenge')}</p>
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
        username={session?.token?.username || session?.user?.username}
        disqualified={disqualified || submitResponse?.disqualified}
        onClose={onExit}
        onSignIn={() => signIn()}
        fetchResults={fetchResults}
        inCoolMathGames={inCoolMathGames}
      />
    );
  }

  return null;
}
