// The quiz family as one unit for home.js: its screens ('quizzes' = the hub,
// 'quiz' = a singleplayer run), entry and exit with their animations, URLs
// and landings, Back, the navbar pill, page meta, and what to render, plus
// party games whose mode is a quiz.
//
// home.js knows none of this. It holds a list of mode-screen units and asks
// each the same questions (see the returned object), so another family of
// non-Street-View modes plugs in as one more unit, not as edits all over home.

import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/components/useTranslations';
import { isQuizMode, QUIZ_PARTIES } from '../../shared/modes/catalog.js';
import { QUIZ_EXIT_MS } from '@mapfinder/quiz-kit/core';
import { quizOf, QUIZ_IDS, QUIZ_PATHS, quizModeFromPath, MODE_LABEL_KEYS, quizKey } from '../modes/quizClient';
import { continentKey } from '../utils/continentLocale';
import QuizzesPage, { onSheetEntry } from './QuizzesPage';

// The round screens (kit + globe) load client-side; until then the screen is
// already the kit's starfield, so the first frame is space, not a blank. A
// board mode (Languages) has no space: its first frame is its own dimmed
// backdrop. next/dynamic gives a loader no props, so the round's render
// notes the mode here first. On a landing page (/countries ...) the screen
// is there from the server's HTML on, so it has no entrance: a fade would
// show the home page first and then turn it black.
let fallbackMode = null;
let fallbackInstant = false;
const INSTANT = { animation: 'none' };
function SpaceFallback() {
  const style = fallbackInstant ? INSTANT : undefined;
  if (quizOf(fallbackMode)?.input === 'choice') {
    return <div className="mf-quiz mf-quiz--board" style={style}><div className="mf-space mf-space--board" /></div>;
  }
  return (
    <div className="mf-quiz" style={style}>
      <div className="mf-globe">
        <div className="mf-space">
          <div className="mf-stars mf-stars--far" />
          <div className="mf-stars mf-stars--mid" />
          <div className="mf-stars mf-stars--near" />
        </div>
      </div>
    </div>
  );
}
const SoloRound = dynamic(() => import('./KitRounds').then((m) => m.SoloRound), { ssr: false, loading: SpaceFallback });
const PartyRound = dynamic(() => import('./KitRounds').then((m) => m.PartyRound), { ssr: false, loading: SpaceFallback });

const HUB = 'quizzes';
const RUN = 'quiz';
const isHubPath = (p) => /^\/quizzes\/?$/.test(p || '');
const isQuizPath = (p) => isHubPath(p) || !!quizModeFromPath(p);

// Inputs from home: the screen state, whether URLs may be rewritten, and the
// few app services a quiz needs (ads between games, starting a party, the
// party's own Back, session/options for saving and the end screen).
export function useQuizScreens({
  screen, setScreen, initialScreen, skipUrlSync, inGame,
  session, options, partyEnabled, startParty, midgameAd,
}) {
  const { t: text } = useTranslation('common');
  // { mode, region, islands } on the 'quiz' screen. A landing page starts
  // with its run (`landing`), so the server's HTML is already the round
  // screen and the home page never paints under it.
  const landingMode = QUIZ_IDS.includes(initialScreen) ? initialScreen : null;
  const [run, setRun] = useState(() => (landingMode ? { mode: landingMode, region: 'all', islands: false, landing: true } : null));
  // True until the landing effect below has set the screen.
  const bootRef = useRef(!!landingMode);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const exitTimerRef = useRef(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const runRef = useRef(run);
  runRef.current = run;
  // Counts changes of screen or run, so a callback that arrives late (after
  // an ad) can tell the player has gone somewhere else meanwhile.
  const visitRef = useRef(0);
  // The hub reopens on the mode last played.
  const lastModeRef = useRef(null);

  const owns = (s) => s === HUB || s === RUN;

  // The screen plays its exit (`leaving`) before the next one replaces it.
  const exitThen = (action) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      leavingRef.current = false;
      setLeaving(false);
      action();
    }, QUIZ_EXIT_MS);
  };
  // Any other change of screen or run (browser Back, another quiz) cancels a
  // pending exit, so its timer cannot fire later and a new screen never
  // mounts with the exit playing.
  useLayoutEffect(() => () => {
    visitRef.current += 1;
    if (!exitTimerRef.current) return;
    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
    leavingRef.current = false;
    setLeaving(false);
  }, [screen, run]);

  // The Quizzes page's sheet has its own history entry (Back closes it); a
  // new screen takes that entry's place instead of stacking on it.
  const writeUrl = (path, state) => {
    window.history[onSheetEntry() ? 'replaceState' : 'pushState'](state, '', path);
  };
  const pushUrl = (path, state) => {
    if (skipUrlSync || typeof window === 'undefined' || window.location.pathname === path) return;
    writeUrl(path, state);
  };
  // The hub's Back: closes its sheet when one is open.
  const hubBackRef = useRef(null);
  function openHub({ fromLanding = false } = {}) {
    if (!fromLanding) pushUrl('/quizzes', { wgQuizzes: true });
    setRun(null);
    setScreen(HUB);
  }
  function openRun(mode, { region = 'all', islands = false, fromLanding = false } = {}) {
    if (!quizOf(mode)) return;
    if (!fromLanding) pushUrl(QUIZ_PATHS[mode], { wgQuiz: mode });
    lastModeRef.current = mode;
    setRun({ mode, region, islands });
    setScreen(RUN);
  }

  // Landings (pages/quizzes.js, pages/flags.js ...): before the first paint,
  // so the menu never shows.
  useLayoutEffect(() => {
    if (initialScreen === HUB) openHub({ fromLanding: true });
    else if (bootRef.current) {
      // the run is already rendered; only the screen is still 'home'
      bootRef.current = false;
      lastModeRef.current = landingMode;
      setScreen(RUN);
    } else if (landingMode) openRun(landingMode, { fromLanding: true });
  }, [initialScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the quiz screens drops their URL (entering pushes its own).
  const prevScreenRef = useRef(screen);
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;
    if (owns(prev) && !owns(screen) && !skipUrlSync && typeof window !== 'undefined' && isQuizPath(window.location.pathname)) {
      writeUrl('/', {});
    }
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warm the round screens (globe, kit CSS) while the hub is open, so Play
  // opens straight onto the globe instead of a loading frame.
  useEffect(() => {
    if (owns(screen)) import('./KitRounds').catch(() => {});
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = screen === RUN && run
    ? `${text(MODE_LABEL_KEYS[run.mode])}${run.region && run.region !== 'all' ? ` · ${text(continentKey(run.region))}` : ''}`
    : null;

  return {
    // Is this screen one of ours? (The wordmark's new-location shortcut and
    // other Street View chrome stay out of it.)
    owns,
    // Did the player arrive on one of our landing pages? (No tutorial.)
    isLanding: (initial) => initial === HUB || QUIZ_IDS.includes(initial),
    openHub: () => openHub(),
    // The navbar Back. True when handled.
    handleBack() {
      if (screen === RUN && !inGame) { exitThen(() => openHub()); return true; }
      if (screen === HUB) {
        if (!hubBackRef.current?.()) exitThen(() => setScreen('home'));
        return true;
      }
      return false;
    },
    // Browser Back/Forward landed on `path`. True when handled.
    handlePopState(path) {
      // A multiplayer game stays on screen: put the URL back instead of
      // opening the hub or a run over it.
      if (inGame && isQuizPath(path)) {
        window.history.replaceState({}, '', '/');
        return true;
      }
      if (isHubPath(path)) { openHub({ fromLanding: true }); return true; }
      const mode = quizModeFromPath(path);
      if (mode) { openRun(mode, { region: runRef.current?.region, islands: runRef.current?.islands, fromLanding: true }); return true; }
      if (owns(screenRef.current)) { setRun(null); setScreen('home'); return true; }
      return false;
    },
    // The pill the navbar shows for a run (mode and region).
    navbarLabel: label,
    // Title / description / canonical for our landing pages, or null.
    meta(initial) {
      if (initial === HUB) return { title: text('quizzesTabTitle'), desc: text('quizzesDescMeta'), canonical: 'https://www.worldguessr.com/quizzes' };
      if (!QUIZ_IDS.includes(initial)) return null;
      return { title: text(quizKey(initial, 'TabTitle')), desc: text(quizKey(initial, 'DescMeta')), canonical: `https://www.worldguessr.com${QUIZ_PATHS[initial]}` };
    },
    // Is this party game ours to render? (Its mode is a quiz.)
    ownsParty: (gameData) => isQuizMode(gameData?.mode),
    render() {
      if (screen === HUB) {
        return (
          <QuizzesPage
            partyEnabled={QUIZ_PARTIES && partyEnabled}
            leaving={leaving}
            historyOk={!skipUrlSync}
            backRef={hubBackRef}
            initialMode={lastModeRef.current}
            // The ad may end long after the exit (portal builds); if the
            // player went Back meanwhile, the run must not open over home.
            onPlay={(mode, region, islands) => exitThen(() => {
              const visit = visitRef.current;
              midgameAd(() => { if (visitRef.current === visit) openRun(mode, { region, islands }); });
            })}
            onParty={(mode, region) => {
              lastModeRef.current = mode;
              setRun(null);
              startParty(mode, quizOf(mode)?.supportsRegion ? region : 'all');
            }}
          />
        );
      }
      if (run && (screen === RUN || bootRef.current)) {
        fallbackMode = run.mode;
        fallbackInstant = !!run.landing;
        return (
          <SoloRound
            key={`${run.mode}:${run.region}:${run.islands ? 1 : 0}`}
            mode={run.mode}
            region={run.region}
            islands={run.islands}
            session={session}
            leaving={leaving}
            onExit={() => exitThen(() => openHub())}
            onPlayAgainSp={() => midgameAd(() => {})}
          />
        );
      }
      return null;
    },
    renderParty({ multiplayerState, ws, timeOffset, backBtnPressed }) {
      fallbackMode = multiplayerState?.gameData?.mode;
      fallbackInstant = false;
      return (
        <PartyRound
          multiplayerState={multiplayerState} ws={ws} timeOffset={timeOffset}
          session={session} options={options} backBtnPressed={backBtnPressed}
        />
      );
    },
  };
}
