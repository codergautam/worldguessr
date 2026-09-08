import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
const reactPreset = require('next/dist/compiled/babel/preset-react');
const source = readFileSync(new URL('../components/PlaygamaBootstrap.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default function', 'function')
  .replace('export function', 'function');
const code = transformSync(source, {
  presets: [[reactPreset, { runtime: 'classic' }]], babelrc: false, configFile: false,
}).code;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function events() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    }),
    removeEventListener: vi.fn((name, callback) => listeners.get(name)?.delete(callback)),
    dispatchEvent: vi.fn((event) => listeners.get(event.type)?.forEach(callback => callback(event))),
  };
}

// Execute the complete production component, including JSX branches and the
// real Retry callback, with controlled hooks and SDK/storage promises.
function mount(overrides = {}) {
  const slots = [];
  const lateUpdates = vi.fn();
  const game = React.createElement('game-marker');
  let cursor = 0;
  let pending = [];
  let mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const context = {
    React, setTimeout, clearTimeout,
    window: events(), document: events(),
    console: { warn: vi.fn() },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    loadPlaygamaBridge: vi.fn(async () => ({ platform: { language: 'es-MX' } })),
    initializePlaygamaStorage: vi.fn(async () => {}),
    flushPlaygamaStorage: vi.fn(async () => {}),
    refreshVolumesFromStorage: vi.fn(),
    usePlaygamaPause: () => false,
    useTranslation: () => ({ t: key => key }),
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        if (!mounted) lateUpdates();
        slots[i].value = typeof next === 'function' ? next(slots[i].value) : next;
      }];
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: callback() };
      });
    },
    ...overrides,
  };
  runInNewContext(code + '\nthis.Component = PlaygamaBootstrap; this.resolveLanguage = resolvePlaygamaLanguage;', context);
  return {
    ...context, game, lateUpdates,
    render(children = game) {
      cursor = 0;
      pending = [];
      const tree = context.Component({ children });
      pending.forEach(effect => effect());
      return tree;
    },
    unmount() {
      mounted = false;
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const gameVisible = tree => !!find(tree, node => node.type === 'game-marker');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

afterEach(() => vi.useRealTimers());

describe('6x Playgama startup gate', () => {
  it('keeps the game unmounted until both SDK and storage complete, then publishes language and refreshes volumes', async () => {
    const sdk = deferred();
    const storage = deferred();
    const gate = mount({
      loadPlaygamaBridge: vi.fn(() => sdk.promise),
      initializePlaygamaStorage: vi.fn(() => storage.promise),
    });
    expect(gameVisible(gate.render())).toBe(false);
    expect(gate.initializePlaygamaStorage).not.toHaveBeenCalled();
    const bridge = { platform: { language: 'ru-RU' } };
    sdk.resolve(bridge);
    await settle();
    expect(gate.initializePlaygamaStorage).toHaveBeenCalledWith(bridge);
    expect(gameVisible(gate.render())).toBe(false);
    expect(gate.window.language).toBeUndefined();
    expect(gate.refreshVolumesFromStorage).not.toHaveBeenCalled();
    storage.resolve();
    await settle();
    expect(gameVisible(gate.render())).toBe(true);
    expect(gate.window.language).toBe('ru');
    expect(gate.window.dispatchEvent.mock.calls[0][0].detail).toBe('ru');
    expect(gate.refreshVolumesFromStorage).toHaveBeenCalledTimes(1);
    gate.unmount();
  });

  it.each(['reject', 'null'])('never exposes the game when SDK startup returns %s', async (failure) => {
    const gate = mount({ loadPlaygamaBridge: vi.fn(() => failure === 'reject' ? Promise.reject(new Error('offline')) : Promise.resolve(null)) });
    gate.render();
    await settle();
    const tree = gate.render();
    expect(gameVisible(tree)).toBe(false);
    expect(tree.props.role).toBe('alert');
    expect(find(tree, node => node.type === 'button')).not.toBeNull();
    expect(gate.initializePlaygamaStorage).not.toHaveBeenCalled();
    gate.unmount();
  });

  it('retries a failed storage restore using the actual Retry button', async () => {
    const restore = vi.fn().mockRejectedValueOnce(new Error('save unavailable')).mockResolvedValueOnce(undefined);
    const gate = mount({ initializePlaygamaStorage: restore });
    gate.render();
    await settle();
    const failed = gate.render();
    expect(gameVisible(failed)).toBe(false);
    expect(gate.window.language).toBeUndefined();
    find(failed, node => node.type === 'button').props.onClick();
    gate.render();
    await settle();
    expect(gameVisible(gate.render())).toBe(true);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(gate.window.language).toBe('es');
    gate.unmount();
  });

  it('allows a slow successful restore to recover after the connection notice', async () => {
    vi.useFakeTimers();
    const storage = deferred();
    const gate = mount({ initializePlaygamaStorage: vi.fn(() => storage.promise) });
    gate.render();
    await settle();
    vi.advanceTimersByTime(30000);
    expect(gate.render().props.role).toBe('alert');
    storage.resolve();
    await settle();
    expect(gameVisible(gate.render())).toBe(true);
    gate.unmount();
  });

  it('does not publish language, touch volume caches, or update state after unmount', async () => {
    const storage = deferred();
    const gate = mount({ initializePlaygamaStorage: vi.fn(() => storage.promise) });
    gate.render();
    await settle();
    gate.unmount();
    storage.resolve();
    await settle();
    expect(gate.window.dispatchEvent).not.toHaveBeenCalled();
    expect(gate.refreshVolumesFromStorage).not.toHaveBeenCalled();
    expect(gate.lateUpdates).not.toHaveBeenCalled();
  });

  it('keeps the initialized gate and in-session language across page changes, and cleans up flush listeners', async () => {
    const gate = mount();
    gate.render();
    await settle();
    gate.render();
    gate.window.language = 'de';
    const nextPage = React.createElement('next-page-marker');
    expect(find(gate.render(nextPage), node => node.type === 'next-page-marker')).not.toBeNull();
    expect(gate.loadPlaygamaBridge).toHaveBeenCalledTimes(1);
    expect(gate.window.language).toBe('de');
    gate.document.dispatchEvent({ type: 'visibilitychange' });
    gate.window.dispatchEvent({ type: 'pagehide' });
    gate.window.dispatchEvent({ type: 'online' });
    expect(gate.flushPlaygamaStorage).toHaveBeenCalledTimes(3);
    gate.unmount();
    gate.window.dispatchEvent({ type: 'online' });
    expect(gate.flushPlaygamaStorage).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['en', 'en'], ['es-MX', 'es'], ['FR_ca', 'fr'], ['de', 'de'], ['ru-RU', 'ru'],
    ['ja', 'en'], [null, 'en'], ['', 'en'],
  ])('maps platform language %s to %s', (input, expected) => {
    const gate = mount();
    expect(gate.resolveLanguage(input)).toBe(expected);
  });

  it('restores Home preferences without replacing units/map settings, using the platform language on 6x', async () => {
    const home = readFileSync(new URL('../components/home.js', import.meta.url), 'utf8');
    const start = home.indexOf('const loadOptions = async () => {');
    const end = home.indexOf('useEffect(() => { loadOptions() }, [])', start);
    if (start < 0 || end < 0) throw new Error('Home loadOptions boundary changed');
    const saved = { units: 'imperial', mapType: 's', language: 'de', customPreference: true };
    const selected = vi.fn();
    const context = {
      process: { env: { NEXT_PUBLIC_6X: 'true' } },
      window: { language: 'es', location: { pathname: '/ru' }, localStorage: { getItem: vi.fn() } },
      gameStorage: { getItem: vi.fn(() => JSON.stringify(saved)) },
      stripBase: value => value,
      setOptions: selected,
    };
    await runInNewContext(home.slice(start, end) + '\nloadOptions();', context);
    expect(selected.mock.calls[0][0]).toEqual({ ...saved, language: 'es' });
    expect(context.window.localStorage.getItem).not.toHaveBeenCalled();
    // A user choice in this session survives a later Home mount.
    context.window.language = 'fr';
    await runInNewContext(home.slice(start, end) + '\nloadOptions();', { ...context });
    expect(selected.mock.calls[1][0].language).toBe('fr');
  });

  it('lets the translation hook recover the pre-mount language event and follow later choices on portal URLs', () => {
    const translation = readFileSync(new URL('../components/useTranslations.js', import.meta.url), 'utf8')
      .replace(/^import .*;\r?\n/gm, '').replaceAll('export function', 'function');
    let state = null;
    let effect;
    const portalWindow = { ...events(), language: 'ru' };
    const context = {
      process: { env: { NEXT_PUBLIC_6X: 'true' } },
      window: portalWindow, en: {}, es: {}, fr: {}, de: {}, ru: {},
      gameStorage: { getItem: vi.fn() }, useRouter: () => ({ asPath: '/es' }), stripBase: value => value,
      useState: () => [state, next => { state = next; }],
      useEffect: callback => { effect = callback; },
    };
    runInNewContext(translation + '\nthis.translate = useTranslation;', context);
    context.translate();
    const cleanup = effect();
    expect(context.translate().lang).toBe('ru');
    portalWindow.dispatchEvent({ type: 'langChange', detail: 'fr' });
    expect(context.translate().lang).toBe('fr');
    expect(context.gameStorage.getItem).not.toHaveBeenCalled();
    cleanup();
  });
});
