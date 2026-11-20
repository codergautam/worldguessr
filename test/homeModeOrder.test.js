import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ts = require('../mobile/node_modules/typescript');
const React = require('react');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Execute the actual menu JSX, including its visibility gates and callbacks.
// As in the mobile screen tests, native/Next children are opaque leaves;
// these checks do not exercise layout, effects, or native navigation.
function fragment(source, predicate) {
  const file = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (!result && predicate(node, file)) result = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw new Error('Home menu source moved; update the fixture');
  return result.getText(file);
}

const attribute = (node, file, name) => ts.isJsxElement(node)
  ? node.openingElement.attributes.properties.find((prop) => prop.name?.getText(file) === name)
    ?.initializer?.getText(file) : undefined;
const web = read('components/home.js');
const mobile = read('mobile/app/(tabs)/home.tsx');
const webMenu = fragment(web, (node, file) => attribute(node, file, 'className') === '"home__menu"');
const mobileMenu = fragment(mobile, (node, file) => attribute(node, file, 'style')?.includes('styles.modeMenu'));
const mobileHandler = fragment(mobile, (node, file) => ts.isVariableDeclaration(node)
  && node.name.getText(file) === 'handleModePress');
const webMaps = fragment(web, (node, file) => attribute(node, file, 'aria-label') === '{text("communityMaps")}');
const mobileMaps = fragment(mobile, (node, file) => attribute(node, file, 'accessibilityLabel') === "{t('communityMaps')}");

function evaluate(source, scope) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(compiled, { React, ...scope });
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const order = ['singleplayer', 'rankedDuel', 'unrankedDuel', 'twovtwo', 'createGame', 'joinGame', 'dailyChallenge'];
const label = (node) => node.type === 'DailyMenuItem' ? 'dailyChallenge'
  : ['findDuel', 'multiplayerMatch'].includes(node.props.label) ? 'unrankedDuel' : node.props.label;

function menuFixture({ authenticated = true, hideAccounts = false, teamSupport = true,
  streak = 0, maintenance = false, connected = true } = {}) {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  const tags = [...new Set([webMenu, mobileMenu, webMaps, mobileMaps].flatMap((source) =>
    [...source.matchAll(/<([A-Z]\w*)/g)].map((match) => match[1])))];
  const scope = {
    ...Object.fromEntries(tags.map((name) => [name, name])),
    text: (key) => key, t: (key) => key,
    HIDE_ACCOUNT_UI: hideAccounts, TEAM_SUPPORT: teamSupport,
    session: authenticated ? { token: { secret: 'test' } } : null, isAuthenticated: authenticated,
    maintenance, connected, loading: false, ws: {}, multiplayerState: { connected },
    styles: {}, isCompact: false, accent: {}, dailyStatus: { streak, variant: 'done' },
    navSlideOutThen: (callback) => callback(), crazyMidgame: (callback) => callback(),
    setMiniMapShown: () => {}, hasEnteredSingleplayer: { current: false },
    lastSingleplayerScreen: { current: null }, gameStorage: { getItem: () => null },
    setScreen: record('screen'), openLoginUpsell: record('login'),
    setConnectionErrorModalShown: record('connection'), handleMultiplayerAction: record('multiplayer'),
    enterDailyMode: record('daily'), setMapModal: record('maps'),
    singleplayerOpeningRef: { current: false }, singleplayerDefaultModeRef: { current: Promise.resolve(null) },
    AsyncStorage: { getItem: async () => null }, SINGLEPLAYER_DEFAULT_MODE_KEY: 'test',
    runGameInterstitial: async () => {}, haptics: { light: () => {} },
    promptLoginUpsell: record('login'), Alert: { alert: record('connection') },
    router: { push: record('push'), navigate: record('navigate') },
    useMultiplayerStore: { getState: () => ({ rankedQueueLockedUntil: 0, joinQueue: record('queue') }) },
  };
  scope.handleModePress = evaluate(`const ${mobileHandler}; handleModePress;`, scope);
  const entries = (source) => nodes(evaluate(`(${source})`, scope))
    .filter((node) => ['ModeItem', 'HeroModeItem', 'DailyMenuItem'].includes(node.type));
  return {
    calls, web: entries(webMenu), mobile: entries(mobileMenu),
    webMaps: evaluate(`(${webMaps})`, scope), mobileMaps: evaluate(`(${mobileMaps})`, scope),
  };
}

describe('home game mode order (#138)', () => {
  it.each([true, false])('keeps the same order on both platforms (authenticated=%s)', (authenticated) => {
    const menu = menuFixture({ authenticated });
    expect(menu.web.map(label)).toEqual(order);
    expect(menu.mobile.map(label)).toEqual(order);
  });

  it('preserves relative order on accountless web builds and mobile without team support', () => {
    const menu = menuFixture({ hideAccounts: true, teamSupport: false });
    expect(menu.web.map(label)).toEqual(order.filter((mode) => !['rankedDuel', 'twovtwo'].includes(mode)));
    expect(menu.mobile.map(label)).toEqual(order.filter((mode) => mode !== 'twovtwo'));
    expect(menu.web.find((node) => label(node) === 'unrankedDuel').props.label).toBe('multiplayerMatch');
  });

  it.each([0, 5])('keeps Daily last with a streak of %i and party entries disabled for maintenance', (streak) => {
    const menu = menuFixture({ streak, maintenance: true });
    expect(menu.web.map(label)).toEqual(order);
    expect(menu.mobile.map(label)).toEqual(order);
    expect(!!menu.mobile.at(-1).props.accessory).toBe(streak > 0);
    for (const entry of menu.web.filter((node) => ['createGame', 'joinGame'].includes(label(node)))) {
      expect(entry.props.disabled).toBe(true);
    }
  });

  it('keeps every web entry wired to its existing screen or multiplayer action', async () => {
    const targets = [
      ['screen', 'singleplayer'], ['multiplayer', 'publicDuel'], ['multiplayer', 'unrankedDuel'],
      ['multiplayer', 'createLobby', '2v2'], ['multiplayer', 'createLobby', 'party'],
      ['multiplayer', 'joinPrivateGame'], ['daily'],
    ];
    for (const [index, target] of targets.entries()) {
      const menu = menuFixture();
      await menu.web[index].props.onClick();
      expect(menu.calls).toEqual([target]);
    }
  });

  it('keeps every mobile entry wired through its production handler', async () => {
    const targets = [
      [['push', { pathname: '/game/[id]', params: { id: 'singleplayer', map: 'all', rounds: '5', mode: 'world' } }]],
      [['queue', 'publicDuel'], ['push', '/queue']], [['queue', 'unrankedDuel'], ['push', '/queue']],
      [['push', { pathname: '/party/create', params: { mode: '2v2' } }]],
      [['push', '/party/create']], [['push', '/party/join']], [['push', '/daily']],
    ];
    for (const [index, target] of targets.entries()) {
      const menu = menuFixture();
      await menu.mobile[index].props.onPress();
      expect(menu.calls).toEqual(target);
    }
  });

  it.each([false, true])('preserves ranked login and connection guards (authenticated=%s)', async (authenticated) => {
    for (const platform of ['web', 'mobile']) {
      const menu = menuFixture({ authenticated, connected: false });
      const entry = menu[platform][1];
      await (entry.props.onClick || entry.props.onPress)();
      expect(menu.calls).toHaveLength(1);
      expect(menu.calls[0][0]).toBe(authenticated ? 'connection' : 'login');
    }
  });

  it('retains Community Maps outside the mode lists with its platform-specific destinations', async () => {
    const menu = menuFixture();
    expect(menu.webMaps.props['aria-label']).toBe('communityMaps');
    expect(menu.mobileMaps.props.accessibilityLabel).toBe('communityMaps');
    expect([...menu.web, ...menu.mobile].map(label)).not.toContain('communityMaps');
    menu.webMaps.props.onClick();
    await menu.mobileMaps.props.onPress();
    expect(menu.calls).toEqual([['maps', true], ['navigate', '/(tabs)/maps']]);
  });
});
