// The quiz family as one unit for home.js: its screens ('quizzes' = the hub,
// 'quiz' = a singleplayer run), entry and exit with their animations, URLs
// and landings, Back, the navbar pill, page meta, and what to render, plus
// party games whose mode is a quiz.
//
// home.js knows none of this. It holds a list of mode-screen units and asks
// each the same questions (see the returned object), so another family of
// non-Street-View modes plugs in as one more unit, not as edits all over home.

import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import { isQuizMode } from '../../shared/modes/catalog.js';
import { quizOf, QUIZ_IDS, QUIZ_PATHS, quizModeFromPath, MODE_LABEL_KEYS, quizKey, isFindMode } from '../modes/quizClient';
import { continentKey } from '../utils/continentLocale';
import QuizzesPage, { onSheetEntry } from './QuizzesPage';
import QuizGame, { QUIZ_EXIT_MS } from './QuizGame';
import QuizFind from './QuizFind';

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
  const [run, setRun] = useState(null); // { mode, region } on the 'quiz' screen
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
  function openRun(mode, { region = 'all', fromLanding = false } = {}) {
    if (!quizOf(mode)) return;
    if (!fromLanding) pushUrl(QUIZ_PATHS[mode], { wgQuiz: mode });
    lastModeRef.current = mode;
    setRun({ mode, region });
    setScreen(RUN);
  }

  // Landings (pages/quizzes.js, pages/flags.js ...): before the first paint,
  // so the menu never shows.
  useLayoutEffect(() => {
    if (initialScreen === HUB) openHub({ fromLanding: true });
    else if (QUIZ_IDS.includes(initialScreen)) openRun(initialScreen, { fromLanding: true });
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
      if (isHubPath(path)) { openHub({ fromLanding: true }); return true; }
      const mode = quizModeFromPath(path);
      if (mode) { openRun(mode, { region: runRef.current?.region, fromLanding: true }); return true; }
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
            partyEnabled={partyEnabled}
            leaving={leaving}
            historyOk={!skipUrlSync}
            backRef={hubBackRef}
            initialMode={lastModeRef.current}
            // The ad may end long after the exit (portal builds); if the
            // player went Back meanwhile, the run must not open over home.
            onPlay={(mode, region) => exitThen(() => {
              const visit = visitRef.current;
              midgameAd(() => { if (visitRef.current === visit) openRun(mode, { region }); });
            })}
            onParty={(mode, region) => {
              lastModeRef.current = mode;
              setRun(null);
              startParty(mode, quizOf(mode)?.supportsRegion ? region : 'all');
            }}
          />
        );
      }
      if (screen === RUN && run) {
        const Run = isFindMode(run.mode) ? QuizFind : QuizGame;
        return (
          <Run
            key={`${run.mode}:${run.region}`}
            mode={run.mode}
            region={run.region}
            session={session}
            options={options}
            leaving={leaving}
            onExit={() => exitThen(() => openHub())}
            onPlayAgainSp={() => midgameAd(() => {})}
          />
        );
      }
      return null;
    },
    renderParty({ multiplayerState, ws, timeOffset, backBtnPressed }) {
      return (
        <QuizGame
          multiplayerState={multiplayerState} ws={ws} timeOffset={timeOffset}
          session={session} options={options} backBtnPressed={backBtnPressed}
          onExit={() => backBtnPressed()}
        />
      );
    },
  };
}
