// What the Quizzes page shows of each quiz mode: a live Preview for the card
// (props: mode, region, on — `on` while it is the shown mode; the caller keys
// it by mode and region) and a small Tile for the list (props: mode).
// hubView(spec) picks, in order: a view made for the mode's pool (the
// languages chat), one made for its stimulus kind (the flag hand, the
// outlines), else the generic view, which previews the mode's own rounds
// through ModeStimulus (the game's renderer). So every mode shows its real
// content with no entry here; an entry is only for a nicer custom look.

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { IoGridOutline, IoImageOutline, IoLanguageOutline, IoTextOutline } from 'react-icons/io5';
import { generateRounds } from '../../shared/modes/rounds.js';
import ModeStimulus from '../modes/ModeStimulus';
import { QUIZ_COUNTRIES } from '../../shared/modes/data/countries.js';
import { QUIZ_LANGUAGES } from '../../shared/modes/data/languages.js';
import { flagSrc, quizOf } from '../modes/quizClient';
import { loadShapes, shapeFor } from '../modes/loadShapes';

const inRegion = (c, region) => region === 'all' || c.continent === region;
const countriesIn = (stimulus, region) => QUIZ_COUNTRIES.filter((c) => inRegion(c, region) && (stimulus !== 'outline' || c.shapeOk));

// A preview steps every PERIOD ms while its mode is selected, the first time
// after LEAD ms, so a newly selected mode moves at once.
const PERIOD = { flag: 2200, outline: 2600, text: 3400, rounds: 2600 };
const LEAD = { flag: 1200, outline: 1200, text: 500, rounds: 1200 };

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Recognisable countries first: the big ones, unless the region has too few.
// The mode's tile leads when the region has it, so the preview opens on the
// picture its row shows.
function previewPool(mode, stimulus, region) {
  const all = countriesIn(stimulus, region);
  const big = all.filter((c) => c.tier === 1);
  const pool = big.length >= 6 ? big : all.filter((c) => c.tier <= 2);
  const codes = shuffled((pool.length >= 3 ? pool : all).map((c) => c.code));
  const lead = codes.indexOf(seededCode(mode, stimulus));
  if (lead > 0) [codes[0], codes[lead]] = [codes[lead], codes[0]];
  return codes;
}

// While `on`: calls `step` after `lead` ms, then every `ms`. Never under
// reduced motion.
function useCycle(on, ms, lead, step) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!on || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let id = setTimeout(function tick() {
      stepRef.current();
      id = setTimeout(tick, ms);
    }, lead);
    return () => clearTimeout(id);
  }, [on, ms, lead]);
}

// A five-slot conveyor: -2 (gone left), -1, 0 (front), 1, 2 (waiting right).
// Items keep their key while they move, so CSS transitions carry each card
// from slot to slot; one leaves on the left as one arrives on the right.
let itemSerial = 0;
function conveyorInit(list) {
  return { list, front: 0, items: [-1, 0, 1, 2].map((pos) => ({ key: ++itemSerial, code: list[(pos + list.length) % list.length], pos })) };
}
function conveyorStep(s) {
  const front = (s.front + 1) % s.list.length;
  const items = s.items.map((it) => ({ ...it, pos: it.pos - 1 })).filter((it) => it.pos >= -2);
  items.push({ key: ++itemSerial, code: s.list[(front + 2) % s.list.length], pos: 2 });
  return { ...s, front, items };
}

function useConveyor(list, on, period, lead) {
  const [state, step] = useReducer(conveyorStep, list, conveyorInit);
  useCycle(on, period, lead, step);
  return state;
}

function Deck({ state, kind, render }) {
  return (
    <div className={`quizzesPage__deck quizzesPage__deck--${kind}`}>
      {state.items.map((it) => (
        <div key={it.key} className="quizzesPage__item" data-pos={it.pos}>{render(it.code)}</div>
      ))}
    </div>
  );
}

// Keyed by region by the caller: a new region deals a new hand.
function FlagsPreview({ mode, region, on }) {
  const list = useMemo(() => previewPool(mode, 'flag', region), [mode, region]);
  const deck = useConveyor(list, on, PERIOD.flag, LEAD.flag);
  return (
    <>
      {/* the front flag's own colours, blurred, light the stage behind the
          hand; each card brings its light in and takes it away */}
      {deck.items.filter((it) => Math.abs(it.pos) <= 1).map((it) => (
        <img key={it.key} className={`quizzesPage__ambient${it.pos === 0 ? ' quizzesPage__ambient--on' : ''}`} src={flagSrc(it.code, 80)} alt="" aria-hidden="true" />
      ))}
      <Deck state={deck} kind="flags" render={(code) => <img className="quizzesPage__flag" src={flagSrc(code, 640)} alt="" draggable={false} decoding="async" />} />
    </>
  );
}

function Outline({ code }) {
  const shape = shapeFor(code);
  if (!shape) return null;
  return (
    <svg className="quizzesPage__shape" viewBox={shape.viewBox} aria-hidden="true">
      <path d={shape.d} fillRule="evenodd" />
    </svg>
  );
}

// shapes.json, loaded once per page (loadShapes caches it).
function useShapes() {
  const [ready, setReady] = useState(() => !!shapeFor('AU'));
  useEffect(() => {
    if (ready) return undefined;
    let live = true;
    loadShapes().then(() => { if (live) setReady(true); }).catch(() => {});
    return () => { live = false; };
  }, [ready]);
  return ready;
}

// Keyed by region by the caller, like the flags.
function ShapesPreview({ mode, region, on }) {
  const ready = useShapes();
  const list = useMemo(() => previewPool(mode, 'outline', region), [mode, region, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const deck = useConveyor(list, on, PERIOD.outline, LEAD.outline);
  return ready ? <Deck state={deck} kind="shapes" render={(code) => <Outline code={code} />} /> : null;
}

// One sentence of each sample, never a paragraph.
function firstSentence(text) {
  // A stop ends the sentence when a space follows; CJK stops always do.
  const m = /^.+?(?:[.!?।۔։።;:؛](?=\s|$)|[。！？])/u.exec(text);
  let s = m ? m[0] : text;
  if (s.length > 80) {
    const cut = s.lastIndexOf(' ', 78);
    s = `${s.slice(0, cut > 30 ? cut : 78)}…`;
  }
  return s;
}

// Words land one by one; a segmenter keeps Thai, Japanese and Chinese words
// whole. Opacity only, so shaping, line breaks and RTL order stay native.
function words(text, lang) {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return [text];
  try {
    return Array.from(new Intl.Segmenter(lang, { granularity: 'word' }).segment(text), (s) => s.segment);
  } catch {
    return [text];
  }
}

function Bubble({ msg, isNew }) {
  const ref = useRef(null);
  // A wrapped bubble keeps its max width; shrink it to its widest line like
  // a real chat bubble.
  useLayoutEffect(() => {
    const b = ref.current;
    let live = true;
    const hug = () => {
      if (!live) return;
      b.style.width = '';
      const range = document.createRange();
      range.selectNodeContents(b);
      const rects = Array.from(range.getClientRects());
      if (!rects.length) return;
      // rects carry the pop-in's scale; measure in layout pixels
      const scale = b.getBoundingClientRect().width / b.offsetWidth || 1;
      const w = (Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left))) / scale;
      const cs = getComputedStyle(b);
      b.style.width = `${Math.ceil(w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 1)}px`;
    };
    hug();
    document.fonts?.ready.then(hug);
    return () => { live = false; };
  }, []);
  let k = 0;
  return (
    <p ref={ref} className={`quizzesPage__bubble quizzesPage__bubble--${msg.side}${isNew ? ' quizzesPage__bubble--new' : ''}`} lang={msg.lang} dir="auto">
      {msg.words.map((w, j) => (/\S/.test(w)
        ? <span key={j} className="quizzesPage__word" style={{ animationDelay: `${0.22 + 0.05 * k++}s` }}>{w}</span>
        : w))}
    </p>
  );
}

let msgSerial = 0;
function LanguagesPreview({ on }) {
  const samples = useMemo(() => shuffled(QUIZ_LANGUAGES).map((l) => ({ lang: l.id, text: firstSentence(l.text) })), []);
  const make = (i) => {
    const s = samples[i % samples.length];
    return { key: ++msgSerial, lang: s.lang, words: words(s.text, s.lang), side: i % 2 ? 'r' : 'l' };
  };
  const [chat, setChat] = useState(() => ({ next: 3, msgs: [make(0), make(1), make(2)] }));
  const threadRef = useRef(null);
  useCycle(on, PERIOD.text, LEAD.text, () => setChat((c) => ({ next: c.next + 1, msgs: [...c.msgs.slice(-5), make(c.next)] })));
  // FLIP: the new bubble lands at the bottom and the thread slides up by its
  // height, instead of every bubble jumping. (The thread hangs from its
  // bottom edge, so the bubble dropped at the top moves nothing.)
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el || chat.next === 3) return;
    const grew = el.lastElementChild.offsetHeight + parseFloat(getComputedStyle(el).rowGap || 0);
    el.style.transition = 'none';
    el.style.transform = `translateY(${grew}px)`;
    el.getBoundingClientRect();
    el.style.transition = '';
    el.style.transform = '';
  }, [chat.next]);
  return (
    <div ref={threadRef} className="quizzesPage__thread">
      {chat.msgs.map((m, i) => <Bubble key={m.key} msg={m} isNew={i === chat.msgs.length - 1} />)}
    </div>
  );
}

// Any mode: a conveyor of its own rounds, drawn by the game's renderer.
// Manifest modes whose items are not loaded preview nothing (yet).
function RoundsPreview({ mode, region, on }) {
  const spec = quizOf(mode);
  const rounds = useMemo(() => {
    try { return generateRounds({ mode, count: 8, region }); } catch { return []; }
  }, [mode, region]);
  const deck = useConveyor(rounds.length ? rounds.map((_, i) => i) : [0], on, PERIOD.rounds, LEAD.rounds);
  if (!rounds.length) return null;
  return (
    <Deck
      state={deck}
      kind="rounds"
      render={(i) => <div className="quizzesPage__sample"><ModeStimulus quiz={spec} location={rounds[i]} /></div>}
    />
  );
}

// A tile is the mode's own content where it is a picture, seeded by the mode
// id (two flag modes do not share a tile); else an icon for its kind. An
// outline tile is a country about as wide as it is tall (a sliver of Chile
// reads as nothing at tile size); shapes must be loaded for that.
function seededCode(mode, stimulus) {
  let pool = QUIZ_COUNTRIES.filter((c) => c.tier === 1 && (stimulus !== 'outline' || c.shapeOk));
  if (stimulus === 'outline') {
    const squat = pool.filter((c) => {
      const [, , w, h] = (shapeFor(c.code)?.viewBox || '').split(' ').map(Number);
      return w / h > 0.75 && w / h < 1.6;
    });
    if (squat.length) pool = squat;
  }
  let h = 0;
  for (const ch of String(mode)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length]?.code || 'BR';
}
function FlagTile({ mode }) {
  return <img src={flagSrc(seededCode(mode, 'flag'), 80)} alt="" draggable={false} />;
}
function ShapeTile({ mode }) {
  return useShapes() ? <Outline code={seededCode(mode, 'outline')} /> : null;
}
function LanguageTile() {
  return <IoLanguageOutline />;
}
const KIND_ICONS = { text: IoTextOutline, image: IoImageOutline };
function KindTile({ mode }) {
  const Icon = KIND_ICONS[quizOf(mode)?.stimulus] || IoGridOutline;
  return <Icon />;
}

const POOL_VIEWS = {
  languages: { Preview: LanguagesPreview, Tile: LanguageTile },
};
const KIND_VIEWS = {
  flag: { Preview: FlagsPreview, Tile: FlagTile },
  outline: { Preview: ShapesPreview, Tile: ShapeTile },
};
const GENERIC = { Preview: RoundsPreview, Tile: KindTile };
export function hubView(spec) {
  return POOL_VIEWS[spec?.pool] || KIND_VIEWS[spec?.stimulus] || GENERIC;
}
