// Singleplayer country rounds (Flags, Shapes): one card with the flag (or
// outline) and the question, the classic Round / Points chip, the globe. A
// click on a country is the guess. A wrong one flashes rose and shows its
// name where it was clicked. A find says so at once, then the globe flies to
// the country, paints it in how it went and plants its flag (confetti on a
// first try), the points fly into the chip, and the next round starts by
// itself. Three wrong tries draw a ring around the answer; the round ends
// when the player finds it there (no points). The ocean, a country already
// tried this round and a country found earlier cost nothing. Parties and
// choice modes play on QuizGame.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/components/useTranslations';
import { generateRounds } from '../../shared/modes/rounds.js';
import { scoreGuessDetailed, haversineKm, MAX_TRIES } from '../../shared/modes/score.js';
import { quizOf, quizRoundFields, MODE_PROMPT_KEYS, preloadStimulus, flagSrc } from '../modes/quizClient';
import { loadShapes, shapeFor } from '../modes/loadShapes';
import ClothFlag from '../modes/ClothFlag';
import nameFromCode from '../utils/nameFromCode';
import { playSfx } from '../utils/audio';
import AnimatedCounter from '../AnimatedCounter';
import QuizSummary from './QuizSummary';
import { isHit } from './QuizRail';
import { flagPalette } from './flagPalette';
import { loadCountries, countryBounds, countryIndex, countryAt } from './loadCountries';
import { isDocked, dockedInsets } from './layout';
import { readBest, saveBest, postRun } from './runStore';

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

const EMPTY = [];
// From the flight's landing to the next round (the points reach the chip
// first: they leave at +120 and fly for 550). A click skips all of it.
const NEXT_MS = 700;
const GHOST_DELAY_MS = 120;
const GHOST_MS = 550;
// A name on the globe stays this long (QuizGlobe fades it at 2.2s).
const LABEL_KEEP_MS = 3000;

// How a round went: first try, a later try, or found inside the ring.
const tierOfAttempt = (attempt) => (attempt === 1 ? 'first' : attempt <= MAX_TRIES ? 'few' : 'missed');
const tierOfRow = (row) => (row.points >= 5000 ? 'first' : row.points > 0 ? 'few' : 'missed');
const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The ring's radius: the country's own size, never a speck, never a hemisphere.
function hintKm(code, lat, lng) {
  const b = countryBounds(code);
  if (!b) return 450;
  const half = haversineKm(b[0][1], b[0][0], b[1][1], b[1][0]) / 2;
  const off = haversineKm(lat, lng, (b[0][1] + b[1][1]) / 2, (b[0][0] + b[1][0]) / 2);
  return Math.min(1500, Math.max(220, (half + off) * 1.3));
}

// The outline to find, loaded with shapes.json.
function Outline({ code, text }) {
  const [shape, setShape] = useState(() => shapeFor(code));
  useEffect(() => {
    let on = true;
    setShape(shapeFor(code));
    loadShapes().then((data) => { if (on) setShape(data?.shapes?.[code] ?? null); }).catch(() => {});
    return () => { on = false; };
  }, [code]);
  if (!shape) return null;
  return (
    <svg className="quizFind__outline" viewBox={shape.viewBox} role="img" aria-label={text('quizShapeAlt')}>
      <path d={shape.d} fillRule="evenodd" />
    </svg>
  );
}

export default function QuizFind({ mode, region = 'all', session, onExit, onPlayAgainSp, leaving = false }) {
  const { t: text, lang } = useTranslation('common');
  const spec = quizOf(mode);
  const [rounds, setRounds] = useState(EMPTY);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState(EMPTY);
  const [phase, setPhase] = useState('loading'); // loading | guess | reveal | done
  const [wrong, setWrong] = useState(EMPTY); // this round's wrong countries
  const [hint, setHint] = useState(null); // out of tries: the ring
  const [note, setNote] = useState(null); // { key, tone, text }
  const [labels, setLabels] = useState(EMPTY);
  const [stamp, setStamp] = useState(null);
  const [splash, setSplash] = useState(null);
  const [found, setFound] = useState(null); // this round's find: { id, code, lat, lng, tier, points }
  const [landedId, setLandedId] = useState(null);
  const [chipFor, setChipFor] = useState(null); // the find whose points reached the chip
  const [runKey, setRunKey] = useState(0);
  const [insets, setInsets] = useState(null);
  const [best, setBest] = useState(0);
  const startRef = useRef(0);
  const rootRef = useRef(null);
  const cardRef = useRef(null);
  const confettiRef = useRef(null);
  const fireRef = useRef(null);
  const liveRef = useRef({});
  const round = rounds[idx] || null;

  useEffect(() => {
    loadCountries().catch(() => {});
    if (spec?.stimulus === 'outline') loadShapes().catch(() => {});
  }, [spec?.stimulus]);
  useEffect(() => () => fireRef.current?.reset?.(), []);

  const start = () => {
    if (!spec) return;
    const list = generateRounds({ mode: spec.id, count: spec.defaultRounds, region });
    setRounds(list);
    setIdx(0);
    setHistory(EMPTY);
    setWrong(EMPTY);
    setHint(null);
    setNote(null);
    setFound(null);
    setRunKey((k) => k + 1);
    setBest(readBest(spec.id));
    startRef.current = Date.now();
    setPhase('guess');
    preloadStimulus(list[0]);
    preloadStimulus(list[1]);
  };
  useEffect(start, [spec?.id, region]); // eslint-disable-line react-hooks/exhaustive-deps

  // The globe's free area: right of the card, or above it when it docks.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    let last = null;
    const measure = () => {
      const host = el.offsetParent || document.body;
      const next = isDocked()
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

  const say = (tone, words) => setNote({ key: Date.now(), tone, text: words });
  // `below`: under the point (a find's name, under its planted flag).
  const label = (pick, code, tone, below = false) => {
    const now = Date.now();
    setLabels((prev) => [...prev.filter((l) => now - l.at < LABEL_KEEP_MS), { key: `${now}:${code}`, at: now, lat: pick.lat, lng: pick.lng, text: nameFromCode(code, lang), tone, below }]);
  };

  const onPick = (p) => {
    if (phase !== 'guess' || !round || leaving) return;
    const key = Date.now();
    // Named by the polygons the score uses; the tile id until they load.
    const code = countryAt(p.lat, p.lng) || (countryIndex() ? null : p.country);
    if (!code) { setSplash({ lat: p.lat, lng: p.lng, key }); return; }
    const pick = { lat: p.lat, lng: p.lng, country: code };
    const earlier = code !== round.country && history.find((h) => h.country === code);
    // Already on the board, or already tried this round: its name, no cost.
    if (earlier) { label(pick, code, tierOfRow(earlier)); return; }
    if (wrong.includes(code)) { label(pick, code, 'wrong'); setStamp({ key, code, tone: 'wrong' }); return; }

    const attempt = hint ? MAX_TRIES + 1 : wrong.length + 1;
    const r = scoreGuessDetailed({ mode: spec.id, location: round, guess: pick, countryIndex: countryIndex(), attempt });
    if (!r.correct) {
      label(pick, code, 'wrong');
      setStamp({ key, code, tone: 'wrong' });
      playSfx('guess', { rate: 0.72, volume: 0.7 });
      if (hint) return;
      const tried = [...wrong, code];
      setWrong(tried);
      if (tried.length >= MAX_TRIES) {
        setHint({ key, lat: round.lat, lng: round.long, km: hintKm(round.country, round.lat, round.long) });
        say('missed', text('quizInCircle'));
      } else {
        say('wrong', tried.length === MAX_TRIES - 1 ? text('quizOneMoreTry') : text('quizNotQuite'));
      }
      return;
    }

    // Found: said at once, then the flight.
    const tier = tierOfAttempt(attempt);
    const row = {
      lat: round.lat, long: round.long, panoId: null,
      guessLat: p.lat, guessLong: p.lng,
      points: r.points, timeTaken: Math.round((Date.now() - startRef.current) / 1000),
      xpEarned: Math.min(Math.floor(r.points / 50), spec.maxXpPerRound),
      tries: Math.min(attempt, MAX_TRIES),
      ...quizRoundFields(round, { guessCountry: code }),
    };
    const rows = [...history, row];
    setHistory(rows);
    // Its name, as a wrong one's is: under the flag the flight plants, in
    // white (the country itself is painted in how it went).
    label({ lat: round.lat, lng: round.long }, code, 'found', true);
    let run = 0;
    for (let i = rows.length - 1; i >= 0 && isHit(rows[i]); i--) run++;
    if (tier === 'first') say('first', run >= 2 ? text('quizSpotOnRun', { n: run }) : text('quizSpotOn'));
    else say(tier, tier === 'few' ? text('quizThereItIs') : text('quizThatsTheOne'));
    playSfx('guess', { rate: tier === 'first' ? Math.min(1.4, 1.2 + 0.04 * Math.min(run - 1, 5)) : 1 });
    setHint(null);
    setFound({ id: `${runKey}:${idx}`, code, lat: p.lat, lng: p.lng, tier, points: r.points, run });
    setPhase('reveal');
  };

  // The flight the globe flies for a find.
  const reveal = useMemo(() => {
    if (!found || !round) return null;
    return {
      id: found.id,
      answerCodes: [round.country],
      answerPoint: { lat: round.lat, lng: round.long },
      bounds: countryBounds(round.country),
      guess: { lat: found.lat, lng: found.lng },
      correct: true,
      tier: found.tier,
      // Every find plants the country's flag (Shapes too: a player learns
      // the shape, the flag and the name together; the question never
      // shows it).
      flagCode: round.country,
    };
  }, [found?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  liveRef.current = { found };

  // A first-try find: confetti in the flag's colours, from where it was planted.
  const onPlanted = useCallback(async ({ id, x, y }) => {
    const f = liveRef.current.found;
    if (!f || f.id !== id || f.tier !== 'first' || !confettiRef.current) return;
    try {
      const [colors, mod] = await Promise.all([flagPalette(f.code), fireRef.current ? null : import('canvas-confetti')]);
      if (!confettiRef.current || liveRef.current.found?.id !== id) return;
      if (!fireRef.current && mod) {
        fireRef.current = mod.default.create(confettiRef.current, { resize: true, useWorker: true, disableForReducedMotion: true });
      }
      const phone = window.innerWidth <= 600;
      const count = Math.round((70 + 15 * Math.min(Math.max(f.run - 1, 0), 4)) * (phone ? 0.6 : 1));
      for (const angle of [62, 118]) {
        fireRef.current?.({
          particleCount: Math.round(count / 2), angle, spread: 55, startVelocity: phone ? 24 : 30,
          gravity: 0.9, decay: 0.91, ticks: 230, scalar: phone ? 1.2 : 1.6, shapes: ['square'], colors,
          origin: { x: x / window.innerWidth, y: y / window.innerHeight },
        });
      }
    } catch {}
  }, []);

  // The landing: the points fly from the country into the chip, then the
  // next round (or the summary) starts by itself.
  const landedAtRef = useRef(null);
  const onLanded = useCallback((id, at) => {
    landedAtRef.current = at || null;
    setLandedId(id);
  }, []);
  useEffect(() => {
    if (!found || landedId !== found.id) return undefined;
    const id = found.id;
    const timers = [];
    let ghost = null;
    let flight = null;
    const to = rootRef.current?.querySelector('.quizChip .counter-value');
    const from = landedAtRef.current;
    if (found.points && to && from && !prefersReducedMotion()) {
      timers.push(setTimeout(() => {
        const tr = to.getBoundingClientRect();
        ghost = document.createElement('div');
        ghost.className = found.points === 5000 ? 'quizGhost quizGhost--gold' : 'quizGhost';
        ghost.style.left = `${from.x}px`;
        ghost.style.top = `${from.y - 28}px`;
        const inner = document.createElement('span');
        inner.textContent = `+${found.points.toLocaleString()}`;
        ghost.append(inner);
        rootRef.current.append(ghost);
        const dx = tr.left + tr.width / 2 - from.x;
        const dy = tr.top + tr.height / 2 - (from.y - 28);
        ghost.animate([{ transform: 'translate(-50%, -50%)' }, { transform: `translate(calc(-50% + ${dx}px), -50%)` }], { duration: GHOST_MS, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
        flight = inner.animate([
          { transform: 'translateY(0) scale(1)', opacity: 1 },
          { opacity: 1, offset: 0.85 },
          { transform: `translateY(${dy}px) scale(.45)`, opacity: 0 },
        ], { duration: GHOST_MS, easing: 'cubic-bezier(.6,-.3,.4,1)', fill: 'forwards' });
        flight.onfinish = () => {
          ghost?.remove();
          ghost = null;
          setChipFor(id);
          const row = rootRef.current?.querySelector('.quizChip .timer__main-row');
          row?.classList.remove('quizChip--bump');
          void row?.offsetWidth;
          row?.classList.add('quizChip--bump');
        };
      }, GHOST_DELAY_MS));
    } else {
      setChipFor(id);
    }
    timers.push(setTimeout(() => goNextRef.current(), NEXT_MS));
    return () => { timers.forEach(clearTimeout); flight?.cancel(); ghost?.remove(); };
  }, [landedId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The way on: by itself after the landing, or at once when the player
  // clicks, taps or presses Space / Enter during the reveal (speed runs). The
  // skipped round keeps its points; the skipping click is never a guess.
  const goneRef = useRef(null);
  const goNextRef = useRef(null);
  goNextRef.current = () => {
    if (!found || goneRef.current === found.id) return;
    goneRef.current = found.id;
    setChipFor(found.id);
    if (idx + 1 >= rounds.length) {
      saveBest(spec.id, history.reduce((s, h) => s + h.points, 0));
      postRun({ session, spec, region, history });
      setPhase('done');
      return;
    }
    setIdx(idx + 1);
    setWrong(EMPTY);
    setFound(null);
    // The verdict belonged to the last flag: the new one starts clean.
    setNote(null);
    startRef.current = Date.now();
    setPhase('guess');
    preloadStimulus(rounds[idx + 2]);
  };
  useEffect(() => {
    if (phase !== 'reveal') return undefined;
    const onKey = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      goNextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);
  const skipReveal = (e) => {
    if (phase !== 'reveal' || leaving) return;
    e.stopPropagation();
    e.preventDefault();
    goNextRef.current();
  };

  // A globe that never loaded still moves the run on.
  useEffect(() => {
    if (!found) return undefined;
    const t = setTimeout(() => setLandedId(found.id), 4500);
    return () => clearTimeout(t);
  }, [found?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!spec) return null;
  const score = history.reduce((s, h) => s + h.points, 0);
  const chipScore = found && chipFor !== found.id ? score - found.points : score;
  const painted = history.map((h) => ({ code: h.country, tier: tierOfRow(h) }));
  const shown = round || rounds[rounds.length - 1];
  const total = rounds.length || spec.defaultRounds;

  return (
    <div ref={rootRef} className={`quizGame quizGame--map quizGame--find${leaving ? ' quizGame--leaving' : ''}`} onClickCapture={skipReveal}>
      <div className="quizBackdrop" aria-hidden />
      <QuizGlobe
        region={region}
        leaving={leaving}
        roundKey={`${runKey}:${idx}`}
        insets={insets}
        reveal={reveal}
        interactive={phase === 'guess' && !leaving}
        painted={painted}
        labels={labels}
        stamp={stamp}
        hint={hint}
        splash={splash}
        onPick={onPick}
        onLanded={onLanded}
        onPlanted={onPlanted}
      />
      <canvas ref={confettiRef} className="quizConfetti" aria-hidden />

      {phase !== 'done' && (
        <span className="timer timer--two-line shown quizChip">
          <span key={idx} className="timer__round-label quizChip__round">{text('round', { r: Math.min(idx + 1, total), mr: total })}</span>
          <span className="timer__main-row">
            <AnimatedCounter value={chipScore} showIncrement={false} /> {text('points')}
          </span>
        </span>
      )}

      <section ref={cardRef} className={`quizFind${phase === 'done' ? ' quizFind--done' : ''}`} aria-live="polite">
        <div className="quizFind__stim">
          {shown && (spec.stimulus === 'flag'
            ? <ClothFlag key={shown.country} className="quizFind__flag" src={flagSrc(shown.country, 640)} alt={text('quizFlagAlt')} waveKey={found ? 1 : 0} delay={found ? 60 : 420} />
            : <Outline key={shown.country} code={shown.country} text={text} />)}
        </div>
        <h2 className="quizFind__ask">{text(MODE_PROMPT_KEYS[spec.id])}</h2>
        <p key={note?.key} className={`quizFind__note${note ? ` quizFind__note--${note.tone}` : ''}`}>{note?.text}</p>
      </section>

      {phase === 'done' && (
        <QuizSummary
          history={history}
          total={score}
          best={Math.max(best, score)}
          onPlayAgain={() => { if (leaving) return; onPlayAgainSp?.(); start(); }}
          onQuizzes={onExit}
        />
      )}
    </div>
  );
}
