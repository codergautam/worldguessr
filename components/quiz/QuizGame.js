// The quiz round screen (flags / shapes / languages), singleplayer and party
// multiplayer: the globe full screen, one card for the round (stimulus,
// prompt, answer action, then the result) and the classic Round / Points chip.
// No GameUI, no Leaflet, no panorama.
//
// Singleplayer owns its rounds (shared generator), scoring (shared scorer,
// with the server's polygon index), the storeGame save and the summary.
// Multiplayer reads the party's gameData, sends `place` exactly like the
// Street View client does, and shows the server's points at reveal
// (roundPoints); the end screen is the existing RoundOverScreen so
// leaderboards and Back behave as in any party.
//
// Reveal rhythm (MapFinder's): the guess lands at once (pin, sound, flare on a
// hit), the globe flies to the answer, and the card shows the result only when
// the flight arrives (QuizGlobe's onLanded). The chip total waits for it too.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/components/useTranslations';
import { isQuizMode } from '../../shared/modes/catalog.js';
import { generateRounds } from '../../shared/modes/rounds.js';
import { scoreGuessDetailed } from '../../shared/modes/score.js';
import { quizOf, quizRoundFields, MODE_PROMPT_KEYS, preloadStimulus, flagSrc } from '../modes/quizClient';
import { loadShapes } from '../modes/loadShapes';
import { languageName } from '../modes/languageName';
import ModeStimulus from '../modes/ModeStimulus';
import ChoiceButtons from '../modes/ChoiceButtons';
import nameFromCode from '../utils/nameFromCode';
import { playSfx, stopSfx, preloadSfx } from '../utils/audio';
import AnimatedCounter from '../AnimatedCounter';
import Countdown, { DIGIT_SLOT } from '../roundTimer';
import PlayerList from '../playerList';
import TeamScorebar from '../teamScorebar';
import BannerText from '../bannerText';
import deriveTeamEndFallback from '../utils/teamDuelEndFallback';
import QuizSummary from './QuizSummary';
import QuizRail, { isHit } from './QuizRail';
import { flagPalette } from './flagPalette';
import { areFlagTwins } from './flagTwins';
import { Swap, useCountUp } from './motion';
import { loadCountries, countryBounds, countryIndex, countryAt } from './loadCountries';
import { isDocked, dockedInsets } from './layout';
import { readBest, saveBest, postRun } from './runStore';

// Same markup as the globe's own backdrop, so the first frame is already space.
function SpaceFallback() {
  return (
    <div className="quizGlobe">
      <div className="quizSpace">
        <div className="quizStars quizStars--far" />
        <div className="quizStars quizStars--mid" />
        <div className="quizStars quizStars--near" />
      </div>
    </div>
  );
}

const QuizGlobe = dynamic(() => import('./QuizGlobe'), { ssr: false, loading: SpaceFallback });
const RoundOverScreen = dynamic(() => import('../roundOverScreen'), { ssr: false });
const EMPTY = [];
const NO_TIMER_MS = 86400000;
// How long the screen's exit plays before home swaps it out (home.js).
export const QUIZ_EXIT_MS = 560;
// A board (choice modes) has no flight: the result shows this long after the
// pick, while the buttons carry the verdict.
const BOARD_LAND_MS = 650;
// The board's confetti: the game's own greens and gold (a language is not a
// country, so no flag colours).
const BOARD_CONFETTI = ['#4ade80', '#2e7042', '#ffd700', '#ffffff', '#86efac'];
function ResultPoints({ points, text }) {
  const perfect = points === 5000;
  const n = useCountUp(perfect ? 0 : points, 1100);
  if (perfect) {
    return (
      <p className="quizResult__points">
        <span className="perfect5k">
          <span className="perfect5k__word">{text('perfectLabel')}</span>
          <span className="perfect5k__num">5k</span>
        </span>
      </p>
    );
  }
  return (
    <p className="quizResult__points">
      {/* the final value, unseen, holds the number's width while it counts */}
      <span className="quizResult__num">
        <span className="quizResult__numEnd" aria-hidden="true">{points.toLocaleString()}</span>
        <span>{n.toLocaleString()}</span>
      </span>
      <span className="quizResult__word">{text('points')}</span>
    </p>
  );
}

// Two beats: the note lands with the press ("Correct!", "You clicked X");
// the answer and the points unfold under it when the flight arrives.
function QuizResult({ spec, location, result, note, noteTone, landed, text, lang }) {
  const isLang = spec.target === 'language';
  const answer = isLang ? languageName(location.lang, lang) : (location.label || nameFromCode(location.country, lang));
  const headline = result.correct ? answer : text('incorrectCountryWas', { country: answer });
  // A language also by its own name ("português"), the board's learning beat.
  const native = isLang ? languageName(location.lang, location.lang) : null;
  const showNative = native && native.toLocaleLowerCase() !== answer.toLocaleLowerCase();
  return (
    <div className={`quizResult quizResult--${tierOf(result)}${result.correct ? ' quizResult--correct' : ''}${landed ? ' is-landed' : ''}`}>
      <p className={`quizResult__note${noteTone}`}>{note}</p>
      <div className="quizResult__more">
        <div>
          <p className={`quizResult__answer${headline.length > 18 ? ' quizResult__answer--long' : ''}`}>{headline}</p>
          {showNative && <p className="quizResult__native" lang={location.lang}>{native}</p>}
          {landed
            ? <ResultPoints points={result.points} text={text} />
            : <p className="quizResult__points" aria-hidden><span className="quizResult__num">0</span></p>}
        </div>
      </div>
    </div>
  );
}

// The board's result, in the prompt's band: the language (green when it was
// yours), its own name, the points, and Next. The answers stay above with
// the verdict on them, so this row is all that changes at the landing.
function BoardResult({ location, result, lang, text, nextLabel, onNext }) {
  const name = languageName(location.lang, lang);
  const native = languageName(location.lang, location.lang);
  return (
    <div className={`quizResult quizResult--board is-landed${result.correct ? ' quizResult--correct' : ''}`}>
      <div className="quizResult__name">
        <p className="quizResult__answer">{name}</p>
        {native.toLocaleLowerCase() !== name.toLocaleLowerCase() && <p className="quizResult__native" lang={location.lang}>{native}</p>}
      </div>
      <ResultPoints points={result.points} text={text} />
      {onNext && <button type="button" className="quizNext" onClick={onNext}>{nextLabel}</button>}
    </div>
  );
}

// A translated sentence with one value replaced by a node (a flag, a bold
// number), so every locale keeps its own word order.
const SLOT = '\u0001';
function withSlot(sentence, node) {
  const [before, after = ''] = String(sentence).split(SLOT);
  return <>{before}{node}{after}</>;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// How a round went, for its colour (answer wash, rail): a 5k, some points,
// or not found.
export function tierOf(result) {
  if (!result) return null;
  if (!result.correct) return 'missed';
  return result.points >= 5000 ? 'first' : 'few';
}

// Hits in a row at the end of these rows.
function trailingHits(rows) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0 && isHit(rows[i]); i--) n++;
  return n;
}

export default function QuizGame({ mode, region = 'all', multiplayerState, ws, timeOffset = 0, session, options, backBtnPressed, onExit, onPlayAgainSp, leaving = false }) {
  const { t: text, lang } = useTranslation('common');
  const gd = multiplayerState?.inGame ? multiplayerState.gameData : null;
  const mp = !!(gd && isQuizMode(gd.mode));
  const spec = quizOf(mp ? gd.mode : mode);
  const me = mp ? gd.players?.find((p) => p.id === gd.myId) : null;

  // ---- singleplayer run ----
  const [rounds, setRounds] = useState(EMPTY);
  const [roundIdx, setRoundIdx] = useState(0);
  const [history, setHistory] = useState(EMPTY);
  const [spPhase, setSpPhase] = useState('loading'); // loading | guess | reveal | done
  const [spResult, setSpResult] = useState(null); // { points, correct, guessCountry, choice }
  const roundStartRef = useRef(0);
  const runRef = useRef(0);
  const [spRemaining, setSpRemaining] = useState(null);
  const [best, setBest] = useState(0);

  // ---- shared per-round state ----
  const [pin, setPin] = useState(null);
  const [choice, setChoice] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [countriesReady, setCountriesReady] = useState(false);
  const [landedId, setLandedId] = useState(null);
  const [insets, setInsets] = useState(null);
  const [collecting, setCollecting] = useState(false);
  const [aspect, setAspect] = useState({ key: null, ar: 1.5 });
  const [chipFor, setChipFor] = useState(null); // the reveal whose points reached the chip
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const pinRef = useRef(null);
  pinRef.current = pin;

  const total = mp ? gd.rounds : rounds.length;
  const spRound = rounds[roundIdx] || null;
  const mpRound = mp ? (gd.state === 'guess'
    ? gd.locations?.[gd.curRound - 1]
    : gd.locations?.[Math.min(gd.curRound - 2, (gd.locations?.length || 1) - 1)]) : null;
  const location = mp ? mpRound : spRound;
  const guessing = mp ? (gd.state === 'guess' && !me?.final) : spPhase === 'guess';
  // 'done' keeps the last reveal frozen under the summary.
  const revealed = mp ? (gd.state === 'end' || (gd.state === 'getready' && gd.curRound > 1)) : (spPhase === 'reveal' || spPhase === 'done');
  const roundNumber = mp ? Math.min(Math.max(gd.curRound - (revealed && gd.state !== 'guess' ? 1 : 0), 1), total) : roundIdx + 1;
  const roundKey = mp ? `mp:${gd.gameId}:${roundNumber}` : `sp:${runRef.current}:${roundIdx}`;
  const roundKeyRef = useRef(roundKey);
  roundKeyRef.current = roundKey;
  // Only the current round's flag sizes the frame (the outgoing one is still
  // mounted while it flies to the rail).
  const onAspect = useCallback((key, ar) => {
    if (key !== roundKeyRef.current || !Number.isFinite(ar) || ar <= 0) return;
    setAspect((prev) => (prev.key === key && Math.abs(prev.ar - ar) < 0.01 ? prev : { key, ar }));
  }, []);
  const isChoice = spec?.input === 'choice';
  // Choice modes play on a board: no globe (nothing to find on it), the card
  // centred, the stimulus the hero, the verdict on the buttons themselves.
  const board = isChoice;

  // Load polygons (scoring index + reveal framing) + silhouettes once.
  useEffect(() => {
    let on = true;
    loadCountries().then(() => { if (on) setCountriesReady(true); }).catch(() => {});
    if (spec?.stimulus === 'outline') loadShapes().catch(() => {});
    return () => { on = false; };
  }, [spec?.id]);

  // ---- singleplayer: start / restart ----
  const startSp = useCallback(() => {
    if (!spec || mp) return;
    const list = generateRounds({ mode: spec.id, count: spec.defaultRounds, region });
    runRef.current += 1;
    setRounds(list);
    setRoundIdx(0);
    setHistory(EMPTY);
    setSpResult(null);
    setPin(null);
    setChoice(null);
    setResetKey((k) => k + 1);
    setBest(readBest(spec.id));
    roundStartRef.current = Date.now();
    setSpPhase('guess');
    preloadStimulus(list[0]);
    preloadStimulus(list[1]);
  }, [spec?.id, region, mp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!mp) startSp(); }, [startSp, mp]);

  // SP timer (choice modes only: the speed bonus needs a clock).
  const spTimeMs = !mp && spec?.timerRequired ? spec.defaultTimePerRound * 1000 : 0;
  useEffect(() => {
    if (!spTimeMs || spPhase !== 'guess') { setSpRemaining(null); return undefined; }
    const tick = () => {
      const left = Math.max(0, roundStartRef.current + spTimeMs - Date.now());
      setSpRemaining(left);
      if (left <= 0) submitSp(null);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [spTimeMs, spPhase, roundIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitSp(choiceId) {
    if (spPhase !== 'guess' || !spRound || leaving) return;
    const p = pinRef.current;
    const timeTakenMs = Date.now() - roundStartRef.current;
    const r = scoreGuessDetailed({
      mode: spec.id,
      location: spRound,
      guess: spec.input === 'map' && p ? { lat: p.lat, lng: p.lng, country: p.country } : null,
      choice: choiceId,
      maxDist: 20000,
      timeTakenMs,
      timePerRoundMs: spTimeMs,
      countryIndex: countryIndex(),
    });
    const xp = Math.min(Math.floor(r.points / 50), spec.maxXpPerRound);
    setHistory((prev) => [...prev, {
      lat: spRound.lat, long: spRound.long, panoId: null,
      guessLat: p?.lat ?? null, guessLong: p?.lng ?? null,
      points: r.points, timeTaken: Math.round(timeTakenMs / 1000), xpEarned: xp,
      ...quizRoundFields(spRound, { guessCountry: p?.country, choice: choiceId ?? undefined }),
    }]);
    setSpResult({ points: r.points, correct: r.correct, guessCountry: p?.country ?? null, choice: choiceId });
    setSpPhase('reveal');
    // A run of hits climbs in pitch, so the ear hears the streak build.
    const run = r.correct ? trailingHits(history) + 1 : 0;
    playSfx('guess', { rate: r.correct ? Math.min(1.4, 1.2 + 0.04 * Math.min(run - 1, 5)) : 0.85 + 0.35 * (r.points / 5000) });
  }

  // Aim the outgoing card flag at its rail slot (quizCollect reads these).
  function aimCollect(slotIdx) {
    const panel = panelRef.current;
    if (!panel || prefersReducedMotion()) return false;
    const box = panel.querySelector('.quizPanel__stimulus');
    const flag = box?.querySelector('.quizSwap__in .quizCloth, .quizSwap__in .quizStimulus__flag');
    const slot = panel.querySelectorAll('.quizRail__slot')[slotIdx];
    if (!box || !flag || !slot) return false;
    const b = box.getBoundingClientRect();
    const fr = flag.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();
    // No rail on screen (very short layouts): no flight to it.
    if (!fr.width || !sr.width) return false;
    // The slot is still a dot: it grows into a flag of --rail-flag-w about
    // its own centre (the rail is a centred row).
    const slotW = parseFloat(getComputedStyle(panel).getPropertyValue('--rail-flag-w')) || 36;
    panel.style.setProperty('--cx', `${sr.left + sr.width / 2 - (b.left + b.width / 2)}px`);
    // The frame retargets to the next flag during the flight: the flying
    // flag keeps the height it left with.
    panel.style.setProperty('--out-h', `${b.height}px`);
    panel.style.setProperty('--cy', `${sr.top + sr.height / 2 - (b.top + b.height / 2)}px`);
    panel.style.setProperty('--cs', String(slotW / fr.width));
    return true;
  }

  function nextSp() {
    if (spPhase !== 'reveal' || leaving) return;
    if (roundIdx + 1 >= rounds.length) { finishSp(); return; }
    if (aimCollect(roundIdx)) {
      setCollecting(true);
      setTimeout(() => setCollecting(false), 520);
    }
    setRoundIdx(roundIdx + 1);
    setPin(null);
    setChoice(null);
    setSpResult(null);
    setResetKey((k) => k + 1);
    roundStartRef.current = Date.now();
    setSpPhase('guess');
    preloadStimulus(rounds[roundIdx + 2]);
  }

  function finishSp() {
    const totalPts = history.reduce((s, h) => s + h.points, 0);
    // `best` stays the run-start value until Play again re-reads it, so the
    // last round's "New best!" survives into the summary.
    saveBest(spec.id, totalPts);
    setSpPhase('done');
    postRun({ session, spec, region, history });
  }

  // ---- multiplayer wire ----
  const sendFinal = () => {
    const p = pinRef.current;
    if (!mp || gd.state !== 'guess' || me?.final || !p) return;
    me.final = true;
    ws?.send(JSON.stringify({ type: 'place', latLong: [p.lat, p.lng], final: true, round: gd.curRound }));
  };
  const sendChoiceMp = (id) => {
    if (!mp || gd.state !== 'guess' || me?.final) return;
    me.final = true;
    me.choice = id;
    ws?.send(JSON.stringify({ type: 'place', choice: id, final: true, round: gd.curRound }));
  };
  // New multiplayer round: clear the pick and reset the globe.
  const mpRoundKey = mp ? `${gd.gameId}:${gd.curRound}:${gd.state === 'guess'}` : null;
  const prevMpRoundKey = useRef(mpRoundKey);
  useEffect(() => {
    if (!mp || !mpRoundKey || prevMpRoundKey.current === mpRoundKey) return;
    prevMpRoundKey.current = mpRoundKey;
    if (gd.state === 'guess') {
      setPin(null);
      setChoice(null);
      setResetKey((k) => k + 1);
    }
  }, [mp, mpRoundKey, gd?.state]);
  // Warm the next round's stimulus during the reveal.
  useEffect(() => {
    if (mp && gd.state === 'getready') preloadStimulus(gd.locations?.[gd.curRound - 1]);
  }, [mp, gd?.state, gd?.curRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // MP clock (same formula as GameUI: server time minus measured skew).
  // It also runs through the round-1 countdown, which reads it.
  const [mpRemaining, setMpRemaining] = useState(null);
  const mpCounting = mp && (gd.state === 'guess' || (gd.state === 'getready' && gd.curRound === 1));
  useEffect(() => {
    if (!mpCounting) { setMpRemaining(null); return undefined; }
    const tick = () => setMpRemaining(Math.max(0, (gd.nextEvtTime - Date.now()) - timeOffset));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [mpCounting, gd?.nextEvtTime, timeOffset]);

  // ---- picks ----
  const onPick = useCallback((p) => {
    // Name the click by the polygons the score uses (simplified tiles can
    // put a near-border click in the neighbour); the tile id only until the
    // polygons have loaded.
    const pick = { lat: p.lat, lng: p.lng, country: countryAt(p.lat, p.lng) || (countryIndex() ? 'Unknown' : p.country) || 'Unknown' };
    // Warm the miss note's flag, so a wrong guess shows it at once.
    if (pick.country !== 'Unknown') new Image().src = flagSrc(pick.country, 80);
    setPin(pick);
    playSfx('pin');
    if (mp && gd?.state === 'guess' && ws) {
      ws.send(JSON.stringify({ type: 'place', latLong: [pick.lat, pick.lng], final: false, round: gd.curRound }));
    }
  }, [mp, gd?.state, gd?.curRound, ws]);

  const onChoice = (id) => {
    setChoice(id);
    if (mp) sendChoiceMp(id); else submitSp(id);
  };
  const onGuess = () => (mp ? sendFinal() : submitSp(null));

  const mpPoints = mp && revealed ? (gd.roundPoints?.points?.[gd.myId] ?? null) : null;
  const result = mp
    ? (revealed ? {
        points: mpPoints ?? 0,
        // Inside the answer is always 5000 (quizzes have no hints): the
        // server's polygon test, not a client guess at it.
        correct: spec?.input === 'choice'
          ? (me?.choice ?? choice) === location?.lang
          : mpPoints === 5000,
        guessCountry: pin?.country ?? null,
        choice: me?.choice ?? choice,
      } : null)
    : spResult;

  // ---- reveal handed to the globe ----
  const revealId = revealed && location ? `${roundKey}:reveal` : null;
  const landed = !!revealId && landedId === revealId;
  const reveal = useMemo(() => {
    if (!revealId) return null;
    return {
      id: revealId,
      answerCodes: location.spokenIn?.length ? location.spokenIn : [location.country],
      answerPoint: { lat: location.lat, lng: location.long },
      bounds: countriesReady ? countryBounds(location.country) : null,
      guess: pin && spec?.input === 'map' ? { lat: pin.lat, lng: pin.lng } : null,
      correct: !!result?.correct,
      tier: tierOf(result),
      flagCode: spec?.stimulus === 'flag' ? location.country : null,
    };
  }, [revealId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The globe reports the landing; this only covers a globe that never loaded.
  // A board has no flight: the verdict shows on the buttons, then the result.
  useEffect(() => {
    if (!revealId) return undefined;
    const t = setTimeout(() => setLandedId(revealId), board ? BOARD_LAND_MS : 4500);
    return () => clearTimeout(t);
  }, [revealId, board]);
  // The hit burst: the answer flag's own colours, from where it was planted.
  const confettiRef = useRef(null);
  const fireRef = useRef(null);
  const liveRef = useRef({});
  const onPlanted = useCallback(async ({ id, x, y, palette }) => {
    const { revealId: current, result: res, code, streak, board: onBoard } = liveRef.current;
    // Confetti is for a first-try find (a perfect 5k), or any right answer on
    // a board (its points are by speed).
    if (id !== current || !res?.correct || (!onBoard && res.points < 5000) || !confettiRef.current) return;
    try {
      const [colors, mod] = await Promise.all([palette || flagPalette(code), fireRef.current ? null : import('canvas-confetti')]);
      // Without its canvas, canvas-confetti would open its own over the page.
      if (!confettiRef.current || liveRef.current.revealId !== id) return;
      if (!fireRef.current && mod) {
        fireRef.current = mod.default.create(confettiRef.current, { resize: true, useWorker: true, disableForReducedMotion: true });
      }
      const phone = window.innerWidth <= 600;
      const count = Math.round((70 + 15 * Math.min(Math.max(streak - 1, 0), 4)) * (phone ? 0.6 : 1));
      // Two fans, up-left and up-right, so the burst spreads around the flag
      // instead of shooting off the top of the screen.
      for (const angle of [62, 118]) {
        fireRef.current?.({
          particleCount: Math.round(count / 2),
          angle,
          spread: 55,
          startVelocity: phone ? 24 : 30,
          gravity: 0.9,
          decay: 0.91,
          ticks: 230,
          scalar: phone ? 1.2 : 1.6,
          shapes: ['square'],
          colors,
          origin: { x: x / window.innerWidth, y: y / window.innerHeight },
        });
      }
    } catch {}
  }, []);
  useEffect(() => () => fireRef.current?.reset?.(), []);
  useEffect(() => {
    if (!board || !landed || !result?.correct) return;
    const btn = rootRef.current?.querySelector('.quizChoice--correct');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    onPlanted({ id: revealId, x: r.left + r.width / 2, y: r.top + r.height / 2, palette: BOARD_CONFETTI });
  }, [board, landed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Multiplayer reveal sound (singleplayer plays it on the Guess press).
  useEffect(() => {
    if (mp && revealed && mpPoints != null) playSfx('guess', { rate: 0.85 + 0.35 * (mpPoints / 5000) });
  }, [mp && revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the free screen area for the globe (the panel's footprint) ----
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    let last = null;
    const measure = () => {
      const host = el.offsetParent || document.body;
      const docked = isDocked();
      const next = docked
        // Docked: clear of the navbar and the Round box under it, unless the
        // planet (height-bound on a short screen) fits beside that box with
        // ~150px to spare each side: then only the navbar band is kept.
        ? dockedInsets(host, el)
        : { top: 56, right: 0, bottom: 0, left: el.offsetLeft + el.offsetWidth };
      if (last && Object.keys(next).every((k) => Math.abs(next[k] - last[k]) < 6)) return;
      last = next;
      setInsets(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // ---- the flag frame: as wide as the card, as tall as the flag needs ----
  // (capped at 3:2; CSS caps it lower on docked layouts). Height transitions,
  // except the run's first sizes (the default, then the first flag's): they
  // land under the card's fade-in, where an ease only drags the card about.
  const frameEasesRef = useRef(false);
  useLayoutEffect(() => {
    const box = panelRef.current?.querySelector('.quizPanel__stimulus');
    if (!box) return undefined;
    const fit = () => {
      // A board's text sizes itself (its CSS); only pictures get a frame.
      if (board) { box.style.height = ''; return; }
      const w = box.clientWidth;
      if (!w) return;
      const h = `${Math.round(Math.min(w / aspect.ar, w * 2 / 3))}px`;
      if (frameEasesRef.current) { box.style.height = h; return; }
      box.style.transition = 'none';
      box.style.height = h;
      void box.offsetHeight;
      box.style.transition = '';
    };
    fit();
    if (aspect.key) frameEasesRef.current = true;
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [aspect.ar, aspect.key, insets?.left, insets?.bottom]);

  // ---- the board's bubble: one height for the whole run ----
  // Measured from the run's own sentences at the bubble's width, so the card
  // never changes size between rounds (parties know only the current round:
  // the CSS minimum covers them).
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!board || mp || !panel || !rounds.length) return undefined;
    const measure = () => {
      const host = panel.querySelector('.quizPanel__stimulus');
      const bubble = host?.querySelector('.quizStimulus__text');
      if (!host || !bubble) return;
      const probe = bubble.cloneNode(false);
      probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:${bubble.offsetWidth}px;min-height:0`;
      host.append(probe);
      let max = 0;
      for (const r of rounds) {
        probe.textContent = r.text || '';
        probe.lang = r.lang || '';
        max = Math.max(max, probe.offsetHeight);
      }
      probe.remove();
      if (max) panel.style.setProperty('--board-text-h', `${Math.ceil(max)}px`);
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [board, mp, rounds]);

  // ---- Space: Guess, then Next (the classic game's key) ----
  const spaceRef = useRef(null);
  spaceRef.current = () => {
    if (leaving) return false;
    if (guessing && !isChoice && pin) { onGuess(); return true; }
    if (!mp && spPhase === 'reveal' && landed) { playSfx('click_2'); nextSp(); return true; }
    return false;
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== ' ') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || e.target?.isContentEditable) return;
      e.preventDefault();
      if (!e.repeat) spaceRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---- clock + chip ----
  const remainingMs = mp ? mpRemaining : spRemaining;
  const deadline = mp
    ? (gd.state === 'guess' && gd.timePerRound !== NO_TIMER_MS ? gd.nextEvtTime : null)
    : (spTimeMs && spPhase === 'guess' ? roundStartRef.current + spTimeMs : null);
  const timed = mp ? gd.timePerRound !== NO_TIMER_MS : !!spTimeMs;
  const critical = remainingMs != null && remainingMs <= 5000 && guessing && !pin;
  // The ticking bed follows the round clock, pin or not (GameUI's ruling).
  const tickingWindow = remainingMs != null && remainingMs <= 5000 && (mp ? gd.state === 'guess' : spPhase === 'guess');
  useEffect(() => {
    if (!tickingWindow) return undefined;
    playSfx('ticking', { pitchJitter: 0, volume: 0.6 });
    return () => stopSfx('ticking');
  }, [tickingWindow]);
  useEffect(() => { if (mp || spTimeMs) preloadSfx('ticking'); }, [mp, spTimeMs]);

  const score = mp ? (me?.score ?? 0) : history.reduce((s, h) => s + h.points, 0);
  // The total waits until the round's points have flown into it.
  const chipScore = result && chipFor !== revealId ? Math.max(0, score - (result.points || 0)) : score;
  useEffect(() => {
    if (!landed || !result || !revealId) return undefined;
    const id = revealId;
    const points = result.points || 0;
    if (!points || prefersReducedMotion()) { setChipFor(id); return undefined; }
    let ghost = null;
    let lift = null;
    let flight = null;
    const t = setTimeout(() => {
      const root = rootRef.current;
      const from = root?.querySelector('.quizResult.is-landed .quizResult__points');
      const to = root?.querySelector('.quizChip .counter-value');
      if (!from || !to) { setChipFor(id); return; }
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();
      const dx = tr.left + tr.width / 2 - (fr.left + fr.width / 2);
      const dy = tr.top + tr.height / 2 - (fr.top + fr.height / 2);
      ghost = document.createElement('div');
      ghost.className = points === 5000 ? 'quizGhost quizGhost--gold' : 'quizGhost';
      ghost.style.left = `${fr.left + fr.width / 2}px`;
      ghost.style.top = `${fr.top + fr.height / 2}px`;
      const inner = document.createElement('span');
      inner.textContent = `+${points.toLocaleString()}`;
      ghost.append(inner);
      root.append(ghost);
      // X and Y on separate curves: it lifts first, then arcs into the chip.
      lift = ghost.animate([{ transform: 'translate(-50%, -50%)' }, { transform: `translate(calc(-50% + ${dx}px), -50%)` }], { duration: 650, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
      flight = inner.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { opacity: 1, offset: 0.85 },
        { transform: `translateY(${dy}px) scale(.45)`, opacity: 0 },
      ], { duration: 650, easing: 'cubic-bezier(.6,-.3,.4,1)', fill: 'forwards' });
      flight.onfinish = () => {
        ghost?.remove();
        ghost = null;
        setChipFor(id);
        const row = root.querySelector('.quizChip .timer__main-row');
        row?.classList.remove('quizChip--bump');
        void row?.offsetWidth;
        row?.classList.add('quizChip--bump');
      };
    }, result.correct ? 200 : 1300);
    return () => { clearTimeout(t); lift?.cancel(); flight?.cancel(); ghost?.remove(); ghost = null; setChipFor(id); };
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Streak and personal best (singleplayer): told in the note line, never as
  // a badge. "New best" fires once, on the round that passes it.
  const doneRows = !mp && result ? history : history.slice(0, roundIdx);
  const streak = mp ? 0 : trailingHits(doneRows);
  const scoreBefore = result ? score - (result.points || 0) : score;
  const passedBest = !mp && best > 0 && result && scoreBefore <= best && score > best;
  liveRef.current = { revealId, result, code: location?.country, streak, board };

  if (!spec) return null;

  const mpStartingRound1 = mp && gd.state === 'getready' && gd.curRound === 1;
  const mpEnded = mp && gd.state === 'end';
  const showResult = !!result && landed;

  let note = null;
  let noteTone = '';
  if (result) {
    const countryTarget = spec.target === 'country';
    const clicked = result.guessCountry && result.guessCountry !== 'Unknown' ? result.guessCountry : null;
    if (passedBest) { note = text('quizNewBest'); noteTone = ' quizResult__note--best'; }
    else if (result.correct) {
      note = countryTarget && streak >= 2
        ? withSlot(text('onCountryStreak', { streak: SLOT }), <b className="quizResult__streak">{streak}</b>)
        : text('quizCorrect');
    } else if (isChoice) note = result.choice ? text('quizYouPicked', { language: languageName(result.choice, lang) }) : text('quizNoAnswer');
    else if (clicked) {
      // What was clicked, with its flag: the learning moment of a miss.
      const twin = spec.stimulus === 'flag' && areFlagTwins(clicked, location?.country);
      note = withSlot(
        text(twin ? 'quizTwinFlag' : 'quizYouClicked', { country: SLOT }),
        <><img className="quizResult__flag" src={flagSrc(clicked, 80)} alt="" draggable={false} />{nameFromCode(clicked, lang)}</>,
      );
    } else if (pin) note = text('quizMissedOcean');
    else note = text('quizNoAnswer');
  }

  // A board keeps its prompt until the landing (the buttons carry the verdict
  // at the pick), then its result row takes the prompt's band.
  const showText = !!result && (landed || !board);
  const nextLabel = roundIdx + 1 >= rounds.length ? text('viewResults') : text('nextRound');
  let textNode = null;
  if (location && !mpStartingRound1) {
    if (showText && board) {
      textNode = <BoardResult location={location} result={result} lang={lang} text={text} nextLabel={nextLabel} onNext={mp ? null : nextSp} />;
    } else {
      textNode = showText
        ? <QuizResult spec={spec} location={location} result={result} note={note} noteTone={noteTone} landed={landed} text={text} lang={lang} />
        : <p className="quizPanel__prompt">{text(MODE_PROMPT_KEYS[spec.id])}</p>;
    }
  }

  let actionKey = 'none';
  let actionNode = null;
  if (location && !mpStartingRound1) {
    if (board && location.choices) {
      actionKey = `choices:${roundKey}`;
      actionNode = (
        <ChoiceButtons
          choices={location.choices}
          correct={location.lang}
          picked={mp ? (me?.choice ?? choice) : choice}
          revealed={revealed}
          disabled={!guessing}
          labelFor={(id) => languageName(id, lang)}
          onPick={onChoice}
        />
      );
    } else if (showResult && !mp) {
      actionKey = `next:${roundKey}`;
      actionNode = (
        <button type="button" className="quizNext" onClick={nextSp}>
          {nextLabel}
        </button>
      );
    } else if (isChoice && location.choices) {
      actionKey = `choices:${roundKey}`;
      actionNode = (
        <ChoiceButtons
          choices={location.choices}
          correct={location.lang}
          picked={mp ? (me?.choice ?? choice) : choice}
          revealed={revealed}
          disabled={!guessing}
          labelFor={(id) => languageName(id, lang)}
          onPick={onChoice}
        />
      );
    } else if (mp && me?.final && (gd.state === 'guess' || !showResult)) {
      actionKey = `waiting:${roundKey}`;
      actionNode = <p className="quizPanel__waiting">{text('waiting')}...</p>;
    } else if (mp ? gd.state === 'guess' : spPhase === 'guess') {
      actionKey = `guess:${roundKey}`;
      actionNode = (
        <button
          type="button"
          className={`miniMap__btn guessBtn quizGuess${!pin || !guessing ? ' unavailable' : ' quizGuess--ready'}`}
          disabled={!pin || !guessing}
          onClick={onGuess}
          data-no-click-sfx={!mp || undefined}
        >
          {text('guess')}
        </button>
      );
    }
  }

  return (
    <div ref={rootRef} className={`quizGame quizGame--${spec.input}${board ? ' quizGame--board' : ''}${mp ? ' quizGame--mp' : ''}${leaving ? ' quizGame--leaving' : ''}`}>
      <div className="quizBackdrop" aria-hidden />
      {!board && <QuizGlobe
        region={mp ? (gd.region || 'all') : region}
        leaving={leaving}
        pin={spec.input === 'map' ? pin : null}
        reveal={reveal}
        roundKey={resetKey}
        insets={insets}
        interactive={guessing && !isChoice}
        onPick={onPick}
        onLanded={setLandedId}
        onPlanted={onPlanted}
      />}
      <canvas ref={confettiRef} className="quizConfetti" aria-hidden />

      {total > 0 && !mpEnded && (
        <span className={`timer timer--two-line shown quizChip${timed ? ' quizChip--timed' : ''}${critical ? ' critical' : ''}`}>
          <span key={roundNumber} className="timer__round-label quizChip__round">{text('round', { r: roundNumber, mr: total })}</span>
          <span className="timer__main-row">
            {timed ? (
              // Kept while the clock is stopped (hidden), so the chip never
              // changes width between rounds.
              <span className="quizChip__clock" style={deadline ? undefined : { visibility: 'hidden' }}>
                <span className="timer__countdown">
                  {deadline ? <Countdown deadline={deadline} timeOffset={mp ? timeOffset : 0} template={`${DIGIT_SLOT}s`} /> : '0s'}
                </span>
                {' '}&middot;{' '}
              </span>
            ) : null}
            <AnimatedCounter value={chipScore} showIncrement={false} /> {text('points')}
          </span>
        </span>
      )}

      <section className={`quizPanel${collecting ? ' quizPanel--collect' : ''}`} ref={panelRef}>
        {!mp && total > 0 && <QuizRail rows={history.slice(0, roundIdx)} total={total} />}
        <div className="quizPanel__stimulus">
          <Swap id={`stim:${roundKey}`} ms={500} animateHeight={board}>
            {location && !mpStartingRound1 ? (
              <ModeStimulus
                quiz={spec}
                location={location}
                revealed={revealed}
                waveKey={showResult && result.correct ? 1 : 0}
                onAspect={(ar) => onAspect(roundKey, ar)}
              />
            ) : null}
          </Swap>
        </div>
        <div className="quizPanel__text">
          <Swap id={showText ? `result:${roundKey}` : `prompt:${roundKey}`} animateHeight={isChoice}>{textNode}</Swap>
        </div>
        <div className="quizPanel__action">
          <Swap id={actionKey} animateHeight={isChoice}>{actionNode}</Swap>
        </div>
        {mp && gd.teamGame && <TeamScorebar gameData={gd} />}
        {mp && showResult && !mpEnded && (
          <div className="quizPanel__players">
            <PlayerList multiplayerState={multiplayerState} fadingOut={false} />
          </div>
        )}
      </section>

      {mpStartingRound1 && (
        <BannerText text={text('gameStartingIn', { t: Math.max(1, Math.ceil((mpRemaining ?? (gd.nextEvtTime - Date.now() - timeOffset)) / 1000)) })} shown={true} />
      )}

      {!mp && spPhase === 'done' && (
        <QuizSummary
          history={history}
          total={score}
          best={Math.max(best, score)}
          onPlayAgain={() => { if (leaving) return; onPlayAgainSp?.(); startSp(); }}
          onQuizzes={onExit}
        />
      )}

      {mpEnded && !gd.duel && !gd.teamGame && (
        <RoundOverScreen
          history={gd.history || EMPTY}
          duel={false}
          multiplayerState={multiplayerState}
          gameId={gd.code}
          points={me?.score || 0}
          maxPoints={gd.rounds * 5000}
          button2Text={gd.host ? text('back') : null}
          button2Press={gd.host ? () => backBtnPressed() : null}
          session={session}
          options={options}
        />
      )}
      {mpEnded && (gd.duel || gd.teamGame) && !gd.public && (
        <RoundOverScreen
          history={gd.history || EMPTY}
          duel={true}
          data={gd.duelEnd ?? deriveTeamEndFallback(gd)}
          multiplayerState={multiplayerState}
          gameId={gd.code}
          button2Text={gd.host ? text('back') : null}
          button2Press={gd.host ? () => backBtnPressed() : null}
          session={session}
          options={options}
        />
      )}
    </div>
  );
}
