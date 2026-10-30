// The Quizzes page, in the home menu's own style. Wide screens: the modes are
// rows on the green wash (a plate slides to the shown one; past five modes
// they fall into groups and the rows shrink to fit), and the card on the
// right shows that mode: a live preview, what it is, its rules, the region,
// Play and Party. Narrow screens: the list is the page and a tap opens the
// same card as a bottom sheet.
//
// `leaving` plays the exit (the entrance in reverse); Play plays a launch
// exit instead, so the round screen seems to grow out of the card.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IoChevronDown, IoChevronForward, IoClose, IoEarthOutline, IoGridOutline, IoLocateOutline,
  IoPeopleOutline, IoPlay, IoReorderThreeOutline, IoTimerOutline,
} from 'react-icons/io5';
import { useTranslation } from '@/components/useTranslations';
import { REGIONS } from '../../shared/modes/catalog.js';
import { poolSize } from '../../shared/modes/rounds.js';
import { quizOf, QUIZ_IDS, MODE_LABEL_KEYS, MODE_PROMPT_KEYS, MODE_BLURB_KEYS, poolCountKey, modeFacts, groupKey } from '../modes/quizClient';
import { continentKey } from '../utils/continentLocale';
import { hubView } from './hubPreviews';
import gameStorage from '../utils/localStorage';
import { readBest } from './runStore';

// One region for the map quizzes (Flags and Shapes).
const REGION_KEY = 'wg_quiz_region';
// Hover shows a row's mode after a short intent delay, and after a longer
// one while the pointer heads for the card, so crossing other rows on the
// way there keeps the mode the player is going to.
const HOVER_INTENT_MS = 90;
const AIM_MS = 320;
// Narrow screens: the list is the page, the card a bottom sheet. Same query
// in styles/quiz.css.
const SHEET_QUERY = '(max-width: 860px) and (min-height: 521px), (max-width: 1024px) and (orientation: portrait)';
// With a mouse, hover shows a mode, so a click on its row plays it.
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
const matches = (q) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
// Past this many modes the rows fall into groups (the catalog's `group`).
const GROUP_AFTER = 5;
const GROUPED = QUIZ_IDS.length > GROUP_AFTER;
const GROUPS = GROUPED ? [...new Set(QUIZ_IDS.map((id) => quizOf(id).group))] : [null];
const ORDER = GROUPS.flatMap((g) => QUIZ_IDS.filter((id) => !g || quizOf(id).group === g));
// Wide screens: the tallest row (px) that lets the list fit; below ROW_MIN
// the list scrolls instead.
const ROW_MAX = GROUPED ? 64 : 96;
const ROW_MIN = 42;
// The page's entrance (styles: the card lands last, 0.18s + 0.75s).
const ENTRANCE_MS = 1000;
const FACT_ICONS = { quizFactRounds: IoReorderThreeOutline, quizFactTries: IoLocateOutline, quizFactChoices: IoGridOutline, quizFactTimer: IoTimerOutline };
// The open sheet's mode for this tab, so a reload can bring the sheet back.
const SHEET_KEY = 'wg_quiz_sheet';
function sheetStore(id) {
  try {
    if (id === undefined) return window.sessionStorage.getItem(SHEET_KEY);
    if (id) window.sessionStorage.setItem(SHEET_KEY, id);
    else window.sessionStorage.removeItem(SHEET_KEY);
  } catch {}
  return null;
}
let reloadHandled = false;
// Is the current history entry an open sheet's (by its state, or by the
// tab's copy once Next has replaced that state)? useQuizScreens replaces
// such an entry instead of stacking on it.
export function onSheetEntry() {
  return !!(window.history.state?.wgQuizSheet || sheetStore());
}

function useMatch(query) {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

export default function QuizzesPage({ initialMode, onPlay, onParty, partyEnabled = true, leaving = false, historyOk = true, backRef }) {
  const { t: text } = useTranslation('common');
  const [mode, setMode] = useState(() => (QUIZ_IDS.includes(initialMode) ? initialMode : ORDER[0]));
  const [region, setRegionState] = useState('all');
  const [best, setBest] = useState({});
  const [launching, setLaunching] = useState(false);
  // Scrolling waits for the entrance: mid-slide the card counts as content
  // below the fold, and a scrollbar would flash in and out.
  const [settled, setSettled] = useState(false);
  const [sheet, setSheet] = useState(false);
  // Phones mark a row once one was opened (or on the way back from a run).
  const [marked, setMarked] = useState(() => QUIZ_IDS.includes(initialMode));
  const narrow = useMatch(SHEET_QUERY);
  const open = sheet && narrow;
  const busy = leaving || launching;

  const rowsRef = useRef({});
  const listRef = useRef(null);
  const railRef = useRef(null);
  const titleRef = useRef(null);
  const markerRef = useRef(null);
  const showRef = useRef(null);
  const scrimRef = useRef(null);
  const trackRef = useRef(null);
  const hoverRef = useRef(null);
  const aimRef = useRef({ x: null, y: 0, vx: 0, vy: 0 });
  const dragRef = useRef(null);
  const swallowRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const openRef = useRef(open);
  openRef.current = open;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  // A preview mounts the first time its mode shows and then stays.
  const seenRef = useRef(new Set());
  seenRef.current.add(mode);
  const [pill, setPill] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), ENTRANCE_MS);
    const saved = gameStorage.getItem(REGION_KEY);
    if (REGIONS.includes(saved)) setRegionState(saved);
    const b = {};
    for (const id of QUIZ_IDS) b[id] = readBest(id);
    setBest(b);
    // Browser Back closes the sheet; Forward reopens it. A reload loses the
    // entry's state (Next replaces it), so the first hub after a reload
    // reopens the sheet from the tab's copy.
    const reloaded = window.performance?.getEntriesByType?.('navigation')[0]?.type === 'reload';
    const restore = historyOk && reloaded && !reloadHandled ? sheetStore() : null;
    reloadHandled = true;
    const fromHistory = (fallback) => {
      const id = window.history.state?.wgQuizSheet || fallback;
      const on = QUIZ_IDS.includes(id);
      if (on) setMode(id);
      setSheet(on);
      sheetStore(on ? id : null);
    };
    fromHistory(restore);
    const onPop = () => fromHistory(null);
    window.addEventListener('popstate', onPop);
    return () => {
      clearTimeout(t);
      clearTimeout(hoverRef.current);
      window.removeEventListener('popstate', onPop);
      sheetStore(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const quiz = quizOf(mode);

  // One region for every map quiz (Flags and Shapes), so a row can start its
  // quiz at once.
  const setRegion = (value) => {
    setRegionState(value);
    try { gameStorage.setItem(REGION_KEY, value); } catch {}
  };

  // The region pill slides to the chosen chip (chips differ in width).
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const place = () => {
      const chip = track.querySelector('[aria-pressed="true"]');
      if (!chip) return;
      setPill({ x: chip.offsetLeft, w: chip.offsetWidth });
      const scroller = track.parentElement;
      const left = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(track);
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [region]);

  // The plate goes to the shown row (rows differ in height on phones, and
  // group headings sit between them).
  const placeMarker = (jump) => {
    const marker = markerRef.current;
    const row = rowsRef.current[modeRef.current];
    if (!marker || !row) return;
    if (jump) marker.style.transition = 'none';
    marker.style.transform = `translateY(${row.offsetTop}px)`;
    marker.style.height = `${row.offsetHeight}px`;
    if (jump) {
      marker.getBoundingClientRect();
      marker.style.transition = '';
    }
  };
  useLayoutEffect(() => placeMarker(false), [mode]);

  // Wide screens: rows share the rail's height, so 3 modes stay big and 12
  // stay readable; the list scrolls only when even ROW_MIN does not fit.
  useLayoutEffect(() => {
    const list = listRef.current;
    const fit = () => {
      list.classList.remove('is-scroll');
      list.style.maxHeight = '';
      list.style.removeProperty('--qh-fit');
      if (!matches(SHEET_QUERY)) {
        const rail = railRef.current;
        const avail = rail.clientHeight - titleRef.current.offsetHeight - (parseFloat(getComputedStyle(rail).rowGap) || 0);
        let h = ROW_MAX;
        list.style.setProperty('--qh-fit', `${h}px`);
        while (h > ROW_MIN && list.scrollHeight > avail) {
          h -= 2;
          list.style.setProperty('--qh-fit', `${h}px`);
        }
        if (list.scrollHeight > avail + 1) {
          list.classList.add('is-scroll');
          list.style.maxHeight = `${avail}px`;
        }
      }
      placeMarker(true);
    };
    fit();
    // After layout, so the rail and the title already have their new size.
    const ro = new ResizeObserver(fit);
    ro.observe(railRef.current);
    ro.observe(titleRef.current);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [narrow]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = (id) => {
    clearTimeout(hoverRef.current);
    if (!busy) setMode(id);
  };
  const play = (id) => {
    clearTimeout(hoverRef.current);
    if (busy) return;
    setMode(id);
    setLaunching(true);
    onPlay(id, quizOf(id)?.supportsRegion ? region : 'all');
  };
  const party = (id) => {
    clearTimeout(hoverRef.current);
    if (busy) return;
    onParty(id, region);
  };

  // ---- the sheet (narrow screens) ----
  // It has its own history entry, so Back (browser, phone, navbar) closes it.
  const openSheet = (id) => {
    if (busy) return;
    setMode(id);
    setMarked(true);
    setSheet(true);
    sheetRef.current = true;
    if (historyOk && !onSheetEntry()) window.history.pushState({ wgQuizzes: true, wgQuizSheet: id }, '');
    if (historyOk) sheetStore(id);
  };
  // Once per sheet: a second tap before the re-render must not go Back twice.
  const closeSheet = () => {
    if (!sheetRef.current) return;
    sheetRef.current = false;
    setSheet(false);
    const back = historyOk && onSheetEntry();
    sheetStore(null);
    if (back) window.history.back();
  };
  // A sheet the layout no longer shows (a phone turned to landscape, a
  // window made wider) ends, with its history entry.
  useEffect(() => {
    if (sheet && !narrow && !busy) closeSheet();
  }, [sheet, narrow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!backRef) return undefined;
    backRef.current = () => {
      if (!openRef.current) return false;
      closeSheet();
      return true;
    };
    return () => { backRef.current = null; };
  });
  // Focus moves into the open sheet and back to its row; Escape closes it.
  useEffect(() => {
    if (!open) return undefined;
    const sheetEl = showRef.current;
    const rows = rowsRef.current;
    sheetEl?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (sheetEl?.contains(document.activeElement)) rows[modeRef.current]?.focus({ preventScroll: true });
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Swipe down to close; the region picker keeps its own touch.
  const onSheetTouchStart = (e) => {
    if (!openRef.current || e.target.closest('select')) return;
    dragRef.current = { y0: e.touches[0].clientY, t0: performance.now(), dy: 0 };
  };
  const onSheetTouchMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y0);
    if (drag.dy > 6) {
      const el = showRef.current;
      el.style.transition = 'none';
      el.style.transform = `translateY(${drag.dy}px)`;
      scrimRef.current.style.opacity = String(Math.max(0, 1 - drag.dy / el.offsetHeight));
    }
  };
  const resetDrag = () => {
    dragRef.current = null;
    showRef.current.style.transition = '';
    showRef.current.style.transform = '';
    scrimRef.current.style.opacity = '';
  };
  const onSheetTouchEnd = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const v = drag.dy / Math.max(1, performance.now() - drag.t0);
    swallowRef.current = drag.dy > 8;
    resetDrag();
    if (drag.dy > 120 || (drag.dy > 36 && v > 0.55)) closeSheet();
  };

  // ---- rows ----
  // The pointer's heading, for the longer hover delay while it aims at the
  // card (the line along its motion meets the card's near edge).
  const onRailMove = (e) => {
    const a = aimRef.current;
    if (a.x !== null) {
      a.vx = a.vx * 0.5 + (e.clientX - a.x) * 0.5;
      a.vy = a.vy * 0.5 + (e.clientY - a.y) * 0.5;
    }
    a.x = e.clientX;
    a.y = e.clientY;
  };
  const aimingAtCard = () => {
    const a = aimRef.current;
    const card = showRef.current?.getBoundingClientRect();
    if (!card || a.vx <= 0.5) return false;
    const y = a.y + a.vy * ((card.left - a.x) / a.vx);
    return y >= card.top && y <= card.bottom;
  };
  const onRowEnter = (id) => (e) => {
    if (e.pointerType !== 'mouse' || narrow) return;
    clearTimeout(hoverRef.current);
    hoverRef.current = setTimeout(() => show(id), aimingAtCard() ? AIM_MS : HOVER_INTENT_MS);
  };
  // Phones open the sheet; a mouse plays (hover already showed the mode);
  // a touch on a wide screen shows the mode, and Play is in the card.
  const onRowClick = (id) => (e) => {
    if (busy) return;
    if (matches(SHEET_QUERY)) { openSheet(id); return; }
    const pointer = e.nativeEvent?.pointerType;
    if (matches(HOVER_QUERY) && pointer !== 'touch' && pointer !== 'pen') play(id);
    else show(id);
  };
  // Up/Down move along the rows (on wide screens focus shows each mode).
  const onRowsKey = (e) => {
    const i = ORDER.findIndex((id) => rowsRef.current[id] === document.activeElement);
    if (i < 0) return;
    const n = ORDER.length;
    const to = { ArrowDown: (i + 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    rowsRef.current[ORDER[to]]?.focus();
  };

  const countFor = (id) => text(poolCountKey(id), { count: poolSize({ mode: id, region: quizOf(id).supportsRegion ? region : 'all' }) });
  const [bestPre, bestPost] = text('quizBest', { score: '\u0001' }).split('\u0001');
  const regionName = (r) => (r === 'all' ? text('allCountries') : text(continentKey(r)));
  const name = text(MODE_LABEL_KEYS[mode]);
  const { Tile: ShownTile } = hubView(quiz);

  let rowIndex = 0;
  const row = (id) => {
    const i = rowIndex++;
    const q = quizOf(id);
    const { Tile } = hubView(q);
    const on = id === mode;
    return (
      <button
        key={id}
        ref={(el) => { rowsRef.current[id] = el; }}
        type="button"
        className={`quizzesPage__mode${on ? ' quizzesPage__mode--on' : ''}`}
        // one Tab stop for the list (arrows move along it); on phones focus
        // does not pick a mode, so every row keeps its stop
        tabIndex={on || narrow ? 0 : -1}
        style={{ '--i': i }}
        onClick={onRowClick(id)}
        onFocus={() => { if (!matches(SHEET_QUERY)) show(id); }}
        onPointerEnter={onRowEnter(id)}
        onPointerLeave={() => clearTimeout(hoverRef.current)}
        disabled={busy}
      >
        <span className={`quizzesPage__tile quizzesPage__tile--${q.stimulus}`}><Tile mode={id} /></span>
        <span className="quizzesPage__label">
          <span className="quizzesPage__name">{text(MODE_LABEL_KEYS[id])}</span>
          <span className="quizzesPage__sub">{text(MODE_PROMPT_KEYS[id])}</span>
        </span>
        <span className="quizzesPage__end">
          {best[id] > 0 && <span className="quizzesPage__meta">{best[id].toLocaleString()}</span>}
          {/* a mouse plays from the row; it says where */}
          <span className="quizzesPage__go" aria-hidden="true">
            <span className="quizzesPage__goPlay">{text('quizPlay')}<IoPlay /></span>
            {q.supportsRegion && region !== 'all' && <span className="quizzesPage__goWhere">{regionName(region)}</span>}
          </span>
        </span>
        <IoChevronForward className="quizzesPage__chev" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div
      className={`quizzesPage${GROUPED ? ' quizzesPage--many' : ''}${settled ? ' quizzesPage--settled' : ''}${open ? ' quizzesPage--sheet' : ''}${leaving && !launching ? ' quizzesPage--leaving' : ''}${launching ? ' quizzesPage--launch' : ''}`}
      style={{ '--n': ORDER.length }}
    >
      <div className="quizzesPage__wash" aria-hidden="true" />
      <div className="quizzesPage__layout">
        <section
          ref={railRef}
          className="quizzesPage__rail"
          onPointerMove={onRailMove}
          onPointerLeave={() => { aimRef.current = { x: null, y: 0, vx: 0, vy: 0 }; }}
          inert={open || undefined}
        >
          <h1 ref={titleRef} className="quizzesPage__title wg_font">{text('quizModes')}</h1>
          <div ref={listRef} className="quizzesPage__modes" onKeyDown={onRowsKey}>
            <span
              ref={markerRef}
              className={`quizzesPage__marker${narrow && !marked ? ' is-off' : ''}`}
              style={{ '--i': ORDER.indexOf(mode) }}
              aria-hidden="true"
            />
            {GROUPS.map((g) => {
              const ids = ORDER.filter((id) => !g || quizOf(id).group === g);
              return (
                <div key={g || 'all'} className="quizzesPage__group">
                  {g && <p className="quizzesPage__ghead" style={{ '--i': rowIndex }}>{text(groupKey(g))}</p>}
                  {ids.map(row)}
                </div>
              );
            })}
          </div>
        </section>

        <div ref={scrimRef} className="quizzesPage__scrim" onClick={closeSheet} aria-hidden="true" />
        <section
          ref={showRef}
          className="quizzesPage__show"
          aria-live={narrow ? undefined : 'polite'}
          role={narrow ? 'dialog' : undefined}
          aria-modal={open || undefined}
          aria-label={narrow ? name : undefined}
          tabIndex={narrow ? -1 : undefined}
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
          onTouchCancel={() => { if (dragRef.current) resetDrag(); }}
          onClickCapture={(e) => {
            if (!swallowRef.current) return;
            swallowRef.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <span className="quizzesPage__grab" aria-hidden="true" />
          <div className="quizzesPage__shead">
            <span className={`quizzesPage__tile quizzesPage__tile--${quiz.stimulus}`}><ShownTile mode={mode} /></span>
            <span className="quizzesPage__htxt">
              <span className="quizzesPage__sname wg_font">{name}</span>
              {best[mode] > 0 && <span className="quizzesPage__ssub">{bestPre}<b>{best[mode].toLocaleString()}</b>{bestPost}</span>}
            </span>
            <button type="button" className="quizzesPage__close" onClick={closeSheet} aria-label={text('close')}>
              <IoClose aria-hidden="true" />
            </button>
          </div>

          <div className="quizzesPage__stage">
            {ORDER.filter((id) => seenRef.current.has(id)).map((id) => {
              const q = quizOf(id);
              const { Preview } = hubView(q);
              const on = id === mode && !busy && (!narrow || open);
              return (
                <div key={id} className={`quizzesPage__layer quizzesPage__layer--${q.stimulus}${id === mode ? ' quizzesPage__layer--on' : ''}`} aria-hidden="true">
                  <Preview key={region} mode={id} region={region} on={on} />
                </div>
              );
            })}
          </div>

          {/* Every mode's text in one cell, the shown one visible: the card
              keeps the height of the longest, so it never changes size. */}
          <div className="quizzesPage__about">
            {ORDER.map((id) => {
              const q = quizOf(id);
              return (
                <div key={id} className={`quizzesPage__aboutMode${id === mode ? ' is-on' : ''}`} aria-hidden={id !== mode}>
                  <div className="quizzesPage__info">
                    <h2 className="quizzesPage__ask">{text(MODE_PROMPT_KEYS[id])}</h2>
                    {best[id] > 0 && <p className="quizzesPage__best">{bestPre}<b>{best[id].toLocaleString()}</b>{bestPost}</p>}
                  </div>
                  <p className="quizzesPage__blurb">{text(MODE_BLURB_KEYS[id])}</p>
                  <ul className="quizzesPage__facts">
                    {modeFacts(id).map((f) => {
                      const Icon = FACT_ICONS[f.key];
                      return <li key={f.key}><Icon aria-hidden="true" />{text(f.key, { n: f.n })}</li>;
                    })}
                    {q.supportsRegion && <li><IoEarthOutline aria-hidden="true" />{countFor(id)}</li>}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* The region choice; a mode without regions folds it shut and the
              stage above takes the room (an eased height, never a jump). */}
          <div className={`quizzesPage__option${quiz.supportsRegion ? '' : ' is-folded'}`}>
            <div className={`quizzesPage__regions${quiz.supportsRegion ? ' is-on' : ''}`} inert={!quiz.supportsRegion || undefined}>
              <div className="quizzesPage__chips">
                <div ref={trackRef} className="quizzesPage__track" role="group" aria-label={text('quizRegion')}>
                  <span className="quizzesPage__pill" style={pill ? { width: pill.w, transform: `translateX(${pill.x}px)` } : { opacity: 0 }} aria-hidden="true" />
                  {REGIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="quizzesPage__chip"
                      aria-pressed={r === region}
                      onClick={() => !busy && setRegion(r)}
                    >
                      {regionName(r)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Phones: the strip would scroll half the regions out of
                  sight, so the same choice is one row that opens the phone's
                  own list. */}
              <label className="quizzesPage__regionPick">
                <span className="quizzesPage__regionLabel">{text('quizRegion')}</span>
                <select value={region} onChange={(e) => !busy && setRegion(e.target.value)} aria-label={text('quizRegion')}>
                  {REGIONS.map((r) => <option key={r} value={r}>{regionName(r)}</option>)}
                </select>
                <IoChevronDown className="quizzesPage__regionChevron" aria-hidden="true" />
              </label>
            </div>
          </div>

          <div className="quizzesPage__actions">
            <button type="button" className="quizzesPage__play" onClick={() => play(mode)} disabled={busy}>
              {text('quizPlay')}
              <IoPlay aria-hidden="true" />
            </button>
            {partyEnabled && (
              <button type="button" className="quizzesPage__party" onClick={() => party(mode)} disabled={busy}>
                <IoPeopleOutline aria-hidden="true" />
                {text('quizParty')}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
