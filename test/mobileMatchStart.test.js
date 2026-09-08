import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const ts = require('../mobile/node_modules/typescript');
const compiled = new Map();
const noop = () => {};

// Execute the real screen bodies in Node, retaining state/refs across renders.
// Native children are opaque leaves: these tests check whether a spinner is
// mounted at all, including before effects and native entrance animations run.
function screenHarness(file, options = {}) {
  const state = {
    gameQueued: 'publicDuel', queuedAt: 1234, inGame: false, gameData: null,
    ...options.state,
  };
  const dimensions = { width: 390, height: 844, ...options.dimensions };
  const cells = [];
  let cursor = 0;
  let pendingEffects = [];
  const react = {
    memo: (component) => component,
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useRef: (initial) => {
      const index = cursor++;
      return cells[index] ??= { current: initial };
    },
    useState: (initial) => {
      const index = cursor++;
      cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cells[index].value, (next) => {
        cells[index].value = typeof next === 'function' ? next(cells[index].value) : next;
      }];
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      const prior = cells[index];
      if (!prior || !deps || deps.some((dep, i) => !Object.is(dep, prior.deps[i]))) {
        pendingEffects.push(() => {
          prior?.cleanup?.();
          cells[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  class AnimatedValue {
    constructor(value) { this.value = value; }
    interpolate() { return this; }
    setValue(value) { this.value = value; }
    stopAnimation() {}
  }
  const animation = { start: noop, stop: noop };
  let pendingAnimations = [];
  const entrance = { delay: () => entrance, duration: () => entrance, reduceMotion: () => entrance };
  const store = Object.assign((selector) => selector(state), { getState: () => state });
  const fixedStore = (values) => (selector) => selector(values);
  const theme = new Proxy({}, { get: () => 8 });
  const navigation = { addListener: () => noop, isFocused: () => true };
  const mocks = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      View: 'View', Text: 'Text',
      StyleSheet: { create: (styles) => styles, absoluteFill: {}, absoluteFillObject: {} },
      useWindowDimensions: () => dimensions,
      Animated: {
        Value: AnimatedValue, View: 'AnimatedView', Text: 'AnimatedText',
        createAnimatedComponent: (component) => `Animated${component}`,
        timing: (value, config) => ({ start: (callback) => {
          pendingAnimations.push(() => {
            value.setValue(config.toValue);
            callback?.({ finished: true });
          });
        }, stop: noop }),
        spring: () => animation, loop: () => animation, sequence: () => animation, delay: noop,
      },
      Easing: { out: (value) => value, cubic: noop, quad: noop },
      Platform: { OS: 'android', select: (values) => values.android },
      InteractionManager: { runAfterInteractions: (callback) => {
        callback();
        return { cancel: noop };
      } },
    },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'ReanimatedView' },
      FadeIn: entrance, FadeInDown: entrance, FadeOut: entrance, ReduceMotion: { Never: 'never' },
    },
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    },
    'expo-router': {
      useRouter: () => ({ back: noop }), useNavigation: () => navigation,
      useLocalSearchParams: () => ({ id: 'multiplayer' }),
    },
    'expo-image': { Image: 'ExpoImage' },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    shared: { colors: theme, t: (key) => key, localeString: 'en' },
    theme: { spacing: theme, fontSizes: theme, borderRadius: theme },
    responsive: { isTabletSize: () => false, gameUiScale: () => 1 },
    multiplayerStore: { useMultiplayerStore: store },
    authStore: { useAuthStore: fixedStore({ isAuthenticated: true }) },
    settingsStore: { useSettingsStore: fixedStore({ language: 'en' }) },
    onboardingStore: { useOnboardingStore: fixedStore({ worldStreak: 0 }) },
    websocket: { wsService: { getTimeOffset: () => options.timeOffset ?? 0 } },
    sound: { playSfx: noop, preloadSfx: noop, stopSfx: noop },
    seenLocations: { markSeenLoc: noop },
    repeatGuard: { isOfficialMapSlug: () => false },
    useCountryGuesserGame: {
      __esModule: true, default: () => ({}), subModeFromDefaultMode: () => null,
    },
    GameSurface: {
      __esModule: true, default: 'GameSurface', getExpandedMapHeight: () => 300,
      useMapRowHudClearance: () => ({ rowClearRight: 0 }),
    },
    DuelHUD: { __esModule: true, default: 'DuelHUD', BAR_WIDTH: 300, BAR_MAX_FRACTION: 0.45 },
    getMyTeam: { __esModule: true, default: () => undefined },
  };
  const filename = fileURLToPath(new URL(`../mobile/app/${file}`, import.meta.url));
  if (!compiled.has(filename)) {
    compiled.set(filename, ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText);
  }
  const loadedModule = { exports: {} };
  runInNewContext(compiled.get(filename), {
    module: loadedModule, exports: loadedModule.exports, Date, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    require: (specifier) => {
      const name = specifier.split('/').at(-1);
      return mocks[specifier] ?? mocks[name] ?? { __esModule: true, default: name };
    },
  }, { filename });
  return {
    state, dimensions,
    render: (props = {}) => { cursor = 0; return loadedModule.exports.default(props); },
    renderChildFirstFrame: (node) => {
      cells.length = 0;
      cursor = 0;
      pendingEffects = [];
      return node.type(node.props);
    },
    flushEffects: () => {
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach((effect) => effect());
    },
    finishAnimations: () => {
      const animations = pendingAnimations;
      pendingAnimations = [];
      animations.forEach((finish) => finish());
    },
    unmount: () => cells.forEach((cell) => cell.cleanup?.()),
  };
}

function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  if (!tree || typeof tree !== 'object') return [];
  return [
    ...(tree.type === type || tree.type?.name === type ? [tree] : []),
    ...nodes(tree.props?.children, type),
  ];
}

function gameHarness(overrides = {}) {
  return screenHarness('game/[id].tsx', {
    timeOffset: 200,
    state: {
      gameQueued: false, inGame: true,
      gameData: {
        code: 'test', state: 'getready', curRound: 1, rounds: 5,
        nextEvtTime: Date.now() + 2900, public: true, duel: false,
        players: [{ id: 'me', username: 'Player' }, { id: 'other', username: 'Opponent' }],
        myId: 'me', locations: [], ...overrides,
      },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('mobile match intro layering', () => {
  function pathTo(node, type, parents = []) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const path = pathTo(child, type, parents);
        if (path) return path;
      }
    }
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return [...parents, node];
    return pathTo(node.props?.children, type, [...parents, node]);
  }

  function opacityOf(path) {
    expect(path).not.toBeNull();
    return path.flatMap((node) => [node.props?.style, { opacity: node.props?.opacity }].flat(Infinity))
      .filter((style) => style?.opacity != null)
      .reduce((opacity, style) => opacity * (typeof style.opacity === 'number' ? style.opacity : style.opacity.value), 1);
  }

  function renderWithEffects(screen) {
    const tree = screen.render();
    screen.flushEffects();
    return tree;
  }

  function mountGame(overrides) {
    const screen = gameHarness({
      locations: [{ lat: 40, long: -73 }], timePerRound: 60, ...overrides,
    });
    renderWithEffects(screen);
    renderWithEffects(screen);
    return screen;
  }

  it.each([false, true])('shows the intro on the first waiting-to-getready frame while preloading invisibly (duel=%s)', (duel) => {
    const screen = mountGame({ state: 'waiting', curRound: 0, duel, locations: [] });
    screen.state.gameData = {
      ...screen.state.gameData, state: 'getready', curRound: 1,
      locations: [{ lat: 40, long: -73 }],
    };
    const cover = duel ? 'GetReadyOverlay' : 'GameLoadingOverlay';
    expect(opacityOf(pathTo(renderWithEffects(screen), cover))).toBe(1);
    renderWithEffects(screen);
    const tree = renderWithEffects(screen);
    const [pano] = nodes(tree, 'StreetViewWebView');
    expect(pano).toBeDefined();
    expect(pano.props.showInitialLoader).toBe(false);
    expect(opacityOf(pathTo(tree, 'StreetViewWebView'))).toBe(0);
    expect(opacityOf(pathTo(tree, cover))).toBe(1);
    // A stale/in-flight scene fade must not expose the native WebView itself.
    for (const node of pathTo(tree, 'StreetViewWebView')) {
      for (const style of [node.props?.style].flat(Infinity)) style?.opacity?.setValue?.(1);
    }
    expect(opacityOf(pathTo(tree, 'StreetViewWebView'))).toBe(0);
    pano.props.onLoad();
    expect(opacityOf(pathTo(renderWithEffects(screen), 'StreetViewWebView'))).toBe(0);
    screen.unmount();
  });

  it.each([
    { duel: false, loaded: true }, { duel: false, loaded: false },
    { duel: true, loaded: true }, { duel: true, loaded: false },
  ])('keeps the intro above the scene until its ready reveal finishes (duel=$duel, loaded=$loaded)', ({ duel, loaded }) => {
    const screen = mountGame({ duel });
    const [pano] = nodes(screen.render(), 'StreetViewWebView');
    if (loaded) {
      pano.props.onLoad();
      renderWithEffects(screen);
    }
    screen.state.gameData = { ...screen.state.gameData, state: 'guess', nextEvtTime: Date.now() + 60200 };
    let tree = renderWithEffects(screen);
    const cover = duel ? 'GetReadyOverlay' : 'GameLoadingOverlay';
    expect(opacityOf(pathTo(tree, cover))).toBe(1);
    if (duel) {
      expect(nodes(tree, 'GameLoadingOverlay')).toHaveLength(0);
      expect(nodes(tree, 'GetReadyOverlay')[0].props.nextEvtTime).toBe(0);
    } else {
      expect(nodes(tree, 'GameLoadingOverlay')[0].props.countdown).toBe(0);
    }
    if (!loaded) {
      expect(opacityOf(pathTo(tree, 'StreetViewWebView'))).toBe(0);
      vi.advanceTimersByTime(50);
      pano.props.onLoad();
      tree = renderWithEffects(screen);
      expect(opacityOf(pathTo(tree, cover))).toBe(1);
    }
    vi.advanceTimersByTime(400);
    screen.finishAnimations();
    tree = renderWithEffects(screen);
    expect(nodes(tree, 'GetReadyOverlay')).toHaveLength(0);
    expect(nodes(tree, 'GameLoadingOverlay')).toHaveLength(0);
    expect(opacityOf(pathTo(tree, 'StreetViewWebView'))).toBe(1);
    screen.unmount();
  });

  it.each([false, true])('uses a real loading cover when joining guess directly (duel=%s)', (duel) => {
    const screen = mountGame({ duel, state: 'guess', joinedInProgress: true });
    const tree = screen.render();
    expect(nodes(tree, 'GetReadyOverlay')).toHaveLength(0);
    expect(nodes(tree, 'GameLoadingOverlay')[0].props.countdown).toBeUndefined();
    expect(opacityOf(pathTo(tree, 'GameLoadingOverlay'))).toBe(1);
    expect(opacityOf(pathTo(tree, 'StreetViewWebView'))).toBe(0);
    screen.unmount();
  });

  it('keeps the outgoing panorama visible while the next round preloads behind its answer map', () => {
    const screen = mountGame({ state: 'guess' });
    nodes(screen.render(), 'StreetViewWebView')[0].props.onLoad();
    renderWithEffects(screen);
    vi.advanceTimersByTime(400);
    screen.finishAnimations();
    expect(opacityOf(pathTo(renderWithEffects(screen), 'StreetViewWebView'))).toBe(1);

    screen.state.gameData = {
      ...screen.state.gameData, state: 'getready', curRound: 2,
      locations: [...screen.state.gameData.locations, { lat: 41, long: -74 }],
    };
    expect(opacityOf(pathTo(renderWithEffects(screen), 'StreetViewWebView'))).toBe(1);
    renderWithEffects(screen);
    const tree = renderWithEffects(screen);
    expect(nodes(tree, 'StreetViewWebView')[0].props.lat).toBe(41);
    expect(nodes(tree, 'StreetViewWebView')[0].props.covered).toBe(true);
    expect(opacityOf(pathTo(tree, 'StreetViewWebView'))).toBe(1);
    expect(nodes(tree, 'GetReadyOverlay')).toHaveLength(0);
    expect(nodes(tree, 'GameLoadingOverlay')).toHaveLength(0);
    screen.unmount();
  });
});
describe('mobile queue screen presentation latch', () => {
  it.each([
    { mode: 'publicDuel', label: 'RANKEDDUEL' },
    { mode: '2v2', label: 'TWOVTWO' },
  ])('preserves an already visible $mode search and its clock during assignment', ({ mode, label }) => {
    const screen = screenHarness('queue.tsx', { state: { gameQueued: mode } });
    screen.render();
    screen.flushEffects();
    vi.advanceTimersByTime(1800);
    const before = screen.render();
    const anchor = nodes(before, 'ElapsedClock')[0].props.anchor;
    expect(anchor).not.toBeNull();
    Object.assign(screen.state, { gameQueued: false, queuedAt: null, inGame: true, gameData: { state: 'getready' } });
    const after = screen.render();
    expect(nodes(after, 'ExpoImage')).toHaveLength(1);
    expect(nodes(after, 'Text').some((node) => node.props.children === label)).toBe(true);
    expect(nodes(after, 'ElapsedClock')[0].props.anchor).toBe(anchor);
    screen.unmount();
  });
});

describe('mobile countdown first frame', () => {
  it.each([0, 2.7])('renders %ss from the provided clock without inventing a fresh 5', (seconds) => {
    const screen = screenHarness('../src/components/ui/MatchCountdown.tsx');
    const tree = screen.render({ seconds });
    expect(nodes(tree, 'AnimatedText')[0].props.children).toBe(Math.ceil(seconds));
    // Interpolation is a native leaf in this harness; inspect its source value.
    expect(nodes(tree, 'AnimatedCircle')[0].props.strokeDashoffset.value).toBe(seconds / 5);
  });

  it.each([0, 2.7])('starts the ranked countdown number at the actual %ss remaining', (seconds) => {
    const screen = screenHarness('../src/components/multiplayer/GetReadyOverlay.tsx');
    const tree = screen.render({
      nextEvtTime: Date.now() + 200 + seconds * 1000, timeOffset: 200,
      round: 1, totalRounds: 5, generated: 5,
    });
    const [countdown] = nodes(tree, 'Countdown');
    expect(countdown.props.seconds).toBe(seconds);
    const counter = screen.renderChildFirstFrame(countdown);
    expect(nodes(counter, 'Text')[0].props.children).toBe(Math.ceil(seconds));
  });
});

describe('mobile first game frame', () => {
  it('keeps only the backdrop during a 2v2 teardown before navigation settles', () => {
    const tree = screenHarness('game/[id].tsx', {
      state: { gameQueued: '2v2', inGame: false, gameData: null },
    }).render();
    expect(nodes(tree, 'SiteBackground')).toHaveLength(1);
    expect(nodes(tree, 'GameLoadingOverlay')).toHaveLength(0);
  });

  it.each([false, true])('shows the actual round-1 countdown before effects (joinedInProgress=%s)', (joinedInProgress) => {
    const tree = gameHarness({ joinedInProgress }).render();
    const [overlay] = nodes(tree, 'GameLoadingOverlay');
    expect(overlay).toBeDefined();
    expect(overlay.props.countdown).toBe(2.7);
    expect(overlay.props.interactive).toBe(true);
  });

  it.each([false, true])('mounts only the ranked matchup cover during getready (joinedInProgress=%s)', (joinedInProgress) => {
    const tree = gameHarness({ duel: true, joinedInProgress }).render();
    expect(nodes(tree, 'GetReadyOverlay')).toHaveLength(1);
    expect(nodes(tree, 'GameLoadingOverlay')).toHaveLength(0);
  });

  it('keeps a plain loading cover when reconnecting during an active round', () => {
    const tree = gameHarness({ state: 'guess', curRound: 2, duel: true, joinedInProgress: true }).render();
    const [overlay] = nodes(tree, 'GameLoadingOverlay');
    expect(overlay).toBeDefined();
    expect(overlay.props.countdown).toBeUndefined();
    expect(overlay.props.interactive).toBe(true);
    expect(nodes(tree, 'GetReadyOverlay')).toHaveLength(0);
  });
});
