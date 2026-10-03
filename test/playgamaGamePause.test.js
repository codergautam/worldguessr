import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const gameUI = () => read('components/gameUI.js');

// Execute the production timeout effect, including its timeout/score branch.
// A frozen host page must not silently submit a daily or single-player round.
function mountRoundTimer({ paused, multiplayer = false, country = false }) {
  const source = gameUI();
  const start = source.indexOf('  // Singleplayer countdown timer');
  const end = source.indexOf('\n  useEffect(() => {\n    if(multiplayerState?.inGame) return;', start);
  if (start < 0 || end < 0) throw new Error('GameUI timer boundary changed');
  const answer = vi.fn();
  const countryGuess = vi.fn();
  const context = {
    useRef: (value) => ({ current: value }), useEffect: (callback) => callback(),
    setInterval, clearInterval, Date, Math,
    pinPoint: null, loading: false, singlePlayerRound: { round: 1, locations: [] },
    gameOptions: { timePerRound: 60 }, roundStartTime: Date.now() - 59000,
    gameOptionsModalShown: false, mapModal: false, showAnswer: false,
    playgamaPaused: paused, getPlaygamaPaused: () => paused,
    multiplayerState: multiplayer ? { inGame: true } : undefined,
    countryGuesser: country, submitCountryGuess: countryGuess,
    setSpFinal5() {}, setSpHasTime() {}, setRoundStartTime() {},
    setShowAnswer: answer, setSinglePlayerRound() {}, setCountryStreak() {},
    setLostCountryStreak() {}, countryStreak: 2, latLong: { lat: 1, long: 2 },
  };
  runInNewContext(source.slice(start, end), context);
  return { answer, countryGuess };
}

afterEach(() => vi.useRealTimers());

function hooksFor(source, globals = {}) {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const context = {
    Date, Math, process: { env: { NEXT_PUBLIC_6X: 'true' } }, ...globals,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) {
      const i = cursor++;
      slots[i] ??= { value: typeof value === 'function' ? value() : value };
      return [slots[i].value, (next) => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: callback() };
      });
    },
  };
  const renderSource = runInNewContext(`(function () { ${source}\n })`, context);
  return {
    context,
    render(next = {}) {
      Object.assign(context, next);
      cursor = 0;
      pending = [];
      const result = renderSource();
      pending.forEach(effect => effect());
      return result;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function mountPauseHook(initialPaused = false) {
  let paused = initialPaused;
  let listener;
  const unsubscribe = vi.fn(() => { listener = undefined; });
  const subscribe = vi.fn(fn => { listener = fn; return unsubscribe; });
  const source = read('components/usePlaygamaPause.js')
    .replace(/^import .*;\n/gm, '').replace('export default function', 'function');
  const hooks = hooksFor(`${source}\nreturn usePlaygamaPause(onResume);`, {
    onResume: vi.fn(), getPlaygamaPaused: () => paused, subscribePlaygamaPause: subscribe,
  });
  hooks.render();
  return {
    ...hooks, subscribe, unsubscribe,
    emit(value) { paused = value; listener?.(); },
  };
}

describe('Playgama local game clocks', () => {
  it.each([false, true])('does not time out a paused round (country=%s)', (country) => {
    vi.useFakeTimers();
    const round = mountRoundTimer({ paused: true, country });
    vi.advanceTimersByTime(90000);
    expect(round.answer).not.toHaveBeenCalled();
    expect(round.countryGuess).not.toHaveBeenCalled();
  });

  it('still resolves an unpaused round at its real deadline', () => {
    vi.useFakeTimers();
    const round = mountRoundTimer({ paused: false });
    vi.advanceTimersByTime(999);
    expect(round.answer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(round.answer).toHaveBeenCalledWith(true);
  });

  it('records the pause synchronously and compensates once, even across rerenders', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const hook = mountPauseHook();
    hook.emit(true);
    vi.setSystemTime(30000);
    hook.emit(true);
    const onResume = vi.fn();
    expect(hook.render({ onResume })).toBe(true);
    vi.setSystemTime(70000);
    hook.emit(false);
    expect(onResume).toHaveBeenCalledExactlyOnceWith({ pausedAt: 10000, resumedAt: 70000 });
    expect(hook.render()).toBe(false);
    hook.emit(false);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(hook.subscribe).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(hook.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('handles a round mounted while the platform is already paused', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const hook = mountPauseHook(true);
    vi.setSystemTime(15000);
    hook.emit(false);
    expect(hook.context.onResume).toHaveBeenCalledExactlyOnceWith({ pausedAt: 5000, resumedAt: 15000 });
  });

  it.each([
    { start: 1000, expected: 41000, showAnswer: false, multiplayer: false },
    { start: 30000, expected: 50000, showAnswer: false, multiplayer: false },
    { start: null, expected: null, showAnswer: false, multiplayer: false },
    { start: 1000, expected: 1000, showAnswer: true, multiplayer: false },
    { start: 1000, expected: 1000, showAnswer: false, multiplayer: true },
  ])('preserves clock time on resume: %j', ({ start, expected, showAnswer, multiplayer }) => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let roundStart = start;
    let resume;
    const source = gameUI();
    const first = source.indexOf('  const onboardingClock =');
    const last = source.indexOf('  const [lostCountryStreak', first);
    const hooks = hooksFor(source.slice(first, last), {
      onboarding: undefined, multiplayerState: multiplayer ? { inGame: true } : undefined,
      clearInterval, singlePlayerTimerRef: { current: null }, onboardingTimerRef: { current: null },
      showAnswer, setRoundStartTime: fn => { roundStart = fn(roundStart); },
      onboardingRevealStartedAt: { current: 0 },
      usePlaygamaPause: callback => { resume = callback; return false; },
    });
    hooks.render();
    resume({ pausedAt: 10000, resumedAt: 50000 });
    expect(roundStart).toBe(expected);
  });

  it('extends tutorial deadlines and elapsed-time origins by the actual pause', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let onboarding = { round: 1, startTime: 1000, nextRoundTime: 61000 };
    let resume;
    const source = gameUI();
    const first = source.indexOf('  const onboardingClock =');
    const last = source.indexOf('  const [lostCountryStreak', first);
    const reveal = { current: 5000 };
    const hooks = hooksFor(source.slice(first, last), {
      onboarding, multiplayerState: undefined, showAnswer: false,
      clearInterval, singlePlayerTimerRef: { current: null }, onboardingTimerRef: { current: null },
      setRoundStartTime() {}, setOnboarding: fn => { onboarding = fn(onboarding); },
      onboardingRevealStartedAt: reveal,
      usePlaygamaPause: callback => { resume = callback; return false; },
    });
    hooks.render();
    resume({ pausedAt: 10000, resumedAt: 50000 });
    expect(onboarding.nextRoundTime).toBe(101000);
    expect(onboarding.startTime).toBe(41000);
    expect(reveal.current).toBe(45000);
  });

  it('keeps the multiplayer display tied to the server deadline during platform pause', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const source = gameUI();
    const first = source.indexOf('  const mpClockRef =');
    const last = source.indexOf('\n  useEffect(() => {\n    // fetch clue', first);
    const critical = vi.fn();
    const hooks = hooksFor(source.slice(first, last), {
      setInterval, clearInterval, timeOffset: 0, playgamaPaused: true,
      multiplayerState: { inGame: true, gameData: { nextEvtTime: 20000, state: 'guess' } },
      setMpFinal5: critical, setMpOver120() {}, setGetreadyCountdown() {},
    });
    hooks.render();
    vi.advanceTimersByTime(5000);
    expect(critical).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(5000);
    expect(critical).toHaveBeenLastCalledWith(false);
    expect(hooks.context.multiplayerState.gameData.nextEvtTime).toBe(20000);
    hooks.unmount();
  });
});

describe('Playgama round lifecycle', () => {
  const fixture = () => {
    const source = gameUI();
    const first = source.indexOf('  // Report the actual round');
    const last = source.indexOf('\n  const ', source.indexOf('  }, []);', first));
    const send = vi.fn();
    const hooks = hooksFor(source.slice(first, last), {
      multiplayerState: undefined, dailyMode: true, onboarding: undefined, countryGuesser: false,
      singlePlayerRound: { round: 1 }, gameOptions: { location: 'daily' },
      loading: true, showAnswer: false, welcomeOverlayShown: false, gameOptionsModalShown: false,
      mapModal: false, explanationModalShown: false, playgamaPaused: false,
      sendPlaygamaMessage: send,
    });
    return { ...hooks, messages: () => send.mock.calls.map(([message]) => message), send };
  };

  it('reports Daily starts, settings/host pauses, reveals, next rounds and departure once', () => {
    const game = fixture();
    game.render();
    expect(game.messages()).toEqual([]);
    game.render({ loading: false });
    game.render();
    game.render({ gameOptionsModalShown: true });
    game.render({ playgamaPaused: true });
    game.render({ gameOptionsModalShown: false });
    game.render({ playgamaPaused: false });
    game.render({ showAnswer: true });
    game.render();
    game.render({ singlePlayerRound: { round: 2 }, showAnswer: false, loading: true });
    game.render({ loading: false });
    game.unmount();
    expect(game.messages()).toEqual([
      'level_started', 'level_paused', 'level_resumed', 'level_completed', 'level_started', 'level_failed',
    ]);
    expect(game.send.mock.calls[0][1]).toEqual({ world: 'daily', level: '1' });
  });

  it('never reports a waiting/getready/results screen as active multiplayer gameplay', () => {
    const game = fixture();
    const state = phase => ({ inGame: true, gameData: { code: 'abc', curRound: 1, state: phase } });
    game.render({ loading: false, dailyMode: false, singlePlayerRound: undefined, multiplayerState: state('getready') });
    expect(game.messages()).toEqual([]);
    game.render({ multiplayerState: state('guess') });
    game.render({ multiplayerState: state('end') });
    game.unmount();
    expect(game.messages()).toEqual(['level_started', 'level_completed']);
  });

  it('completes the prior multiplayer round when the server increments into getready', () => {
    const game = fixture();
    const state = (phase, curRound) => ({ inGame: true, gameData: { code: 'abc', curRound, state: phase } });
    game.render({ loading: false, dailyMode: false, singlePlayerRound: undefined, multiplayerState: state('guess', 1) });
    game.render({ multiplayerState: state('getready', 2) });
    game.render({ multiplayerState: state('guess', 2) });
    game.render({ multiplayerState: state('getready', 3) });
    game.render({ multiplayerState: state('end', 3) });
    game.unmount();
    expect(game.messages()).toEqual(['level_started', 'level_completed', 'level_started', 'level_completed']);
  });

  it('does not emit Playgama lifecycle events on the regular site', () => {
    const game = fixture();
    game.render({ loading: false, process: { env: {} } });
    game.unmount();
    expect(game.messages()).toEqual([]);
  });
});

describe('Playgama tutorial reveal', () => {
  it.each([true, false])('preserves auto-advance delay (pause render committed=%s)', (commitPause) => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const source = read('components/endBanner.js');
    const clockStart = source.indexOf('    const autoAdvanceDeadline =');
    const clockEnd = source.indexOf('    const shouldAutoAdvanceOnboarding', clockStart);
    const clearStart = source.indexOf('    function clearAutoAdvance()');
    const clearEnd = source.indexOf('    const points', clearStart);
    const effectStart = source.indexOf('    // Auto-advance for onboarding');
    const effectEnd = source.indexOf('    const isLastRound =', effectStart);
    let paused = false;
    let resume;
    const advance = vi.fn();
    const hooks = hooksFor(source.slice(clockStart, clockEnd) + source.slice(clearStart, clearEnd)
      + source.slice(effectStart, effectEnd), {
      setTimeout, clearTimeout, setInterval, clearInterval,
      ONBOARDING_AUTO_ADVANCE_SECONDS: 7,
      shouldAutoAdvanceOnboarding: true, guessed: true,
      onboarding: { round: 1, locations: [1, 2, 3], mode: 'country' },
      autoAdvanceTimer: { current: null }, autoAdvanceTimeout: { current: null },
      revealStartedAt: { current: 0 }, fullResetRef: { current: advance },
      setAutoAdvanceCountdown() {}, logOnboardingAdvance() {}, playSfx() {},
      getPlaygamaPaused: () => paused,
      usePlaygamaPause: callback => { resume = callback; return paused; },
    });
    hooks.render();
    vi.advanceTimersByTime(2000);
    paused = true;
    if (commitPause) hooks.render();
    vi.advanceTimersByTime(50000);
    expect(advance).not.toHaveBeenCalled();
    resume({ pausedAt: 12000, resumedAt: 62000 });
    paused = false;
    hooks.render();
    vi.advanceTimersByTime(4999);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledExactlyOnceWith({ source: 'endBannerAutoAdvance' });
    hooks.unmount();
  });
});
