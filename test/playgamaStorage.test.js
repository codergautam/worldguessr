import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAVE_KEY = 'wg_6x_save_v1';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function platform(saved = null) {
  return {
    storage: {
      get: vi.fn(async () => [saved]),
      set: vi.fn(async () => {}),
    },
  };
}

function snapshot(values) {
  return JSON.stringify({ version: 1, values });
}

let adapter;
let local;
beforeEach(async () => {
  vi.resetModules();
  local = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key) => local.get(key) ?? null),
      setItem: vi.fn((key, value) => local.set(key, String(value))),
      removeItem: vi.fn((key) => local.delete(key)),
    },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  adapter = await import('../components/utils/playgamaStorage.js');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('6x Bridge storage', () => {
  it('restores cloud strings before synchronous readers use them, without writing defaults', async () => {
    const bridge = platform(snapshot({ countryStreak: '12', options: '{"units":"metric"}' }));
    await adapter.initializePlaygamaStorage(bridge);
    expect(bridge.storage.get).toHaveBeenCalledWith([SAVE_KEY]);
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('12');
    expect(adapter.getPlaygamaStorageItem('missing')).toBeNull();
    expect(bridge.storage.set).not.toHaveBeenCalled();
    expect(window.localStorage.getItem).not.toHaveBeenCalled();
  });

  it('also accepts the parsed JSON object returned by a platform', async () => {
    await adapter.initializePlaygamaStorage(platform({ version: 1, values: { sfxVolume: '0' } }));
    expect(adapter.getPlaygamaStorageItem('sfxVolume')).toBe('0');
  });

  it('migrates known old preferences/progress once, without exporting auth or deleting local originals', async () => {
    local.set('countryStreak', '17');
    local.set('wg_guest_id', 'not-a-game-key-on-web');
    local.set('lang', 'es');
    local.set('wg_secret', 'must-stay-local');
    local.set('wg_daily_status_2026-09-08', 'cached-server-response');
    const bridge = platform();
    await adapter.initializePlaygamaStorage(bridge);
    const [keys, values] = bridge.storage.set.mock.calls[0];
    expect(keys).toEqual([SAVE_KEY]);
    expect(JSON.parse(values[0]).values).toEqual({ countryStreak: '17', lang: 'es' });
    expect(local.get('countryStreak')).toBe('17');
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('does not resurrect legacy values when a cloud save has intentionally removed them', async () => {
    local.set('countryStreak', '17');
    const bridge = platform(snapshot({}));
    await adapter.initializePlaygamaStorage(bridge);
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBeNull();
    expect(window.localStorage.getItem).not.toHaveBeenCalled();
    expect(bridge.storage.set).not.toHaveBeenCalled();
  });

  it('shares initialization, plays from memory after a failed read, and adopts the cloud save under local changes when the retry succeeds', async () => {
    vi.useFakeTimers();
    const waiting = deferred();
    const bridge = platform(snapshot({ countryStreak: '9', musicVolume: '50' }));
    bridge.storage.get.mockReturnValueOnce(waiting.promise);
    const first = adapter.initializePlaygamaStorage(bridge);
    const second = adapter.initializePlaygamaStorage(bridge);
    expect(first).toBe(second);
    waiting.reject(new Error('offline'));
    await first;
    expect(adapter.getPlaygamaStorageMode()).toBe('memory');
    expect(bridge.storage.set).not.toHaveBeenCalled();
    adapter.setPlaygamaStorageItem('sfxVolume', 0);
    adapter.removePlaygamaStorageItem('musicVolume');
    await adapter.flushPlaygamaStorage();
    expect(bridge.storage.set).not.toHaveBeenCalled();
    expect(adapter.getPlaygamaStorageItem('sfxVolume')).toBe('0');
    await vi.advanceTimersByTimeAsync(30000);
    expect(adapter.getPlaygamaStorageMode()).toBe('bridge');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('9');
    expect(adapter.getPlaygamaStorageItem('sfxVolume')).toBe('0');
    expect(adapter.getPlaygamaStorageItem('musicVolume')).toBeNull();
    await adapter.flushPlaygamaStorage();
    expect(JSON.parse(bridge.storage.set.mock.calls.at(-1)[1][0]).values).toEqual({ countryStreak: '9', sfxVolume: '0' });
    vi.useRealTimers();
  });

  it('gives up recovery after five failed retries and stays in memory', async () => {
    vi.useFakeTimers();
    const bridge = platform();
    bridge.storage.get.mockRejectedValue(new Error('offline'));
    await adapter.initializePlaygamaStorage(bridge);
    expect(adapter.getPlaygamaStorageMode()).toBe('memory');
    await vi.advanceTimersByTimeAsync(30000 + 60000 + 120000 + 240000 + 480000 + 1000);
    expect(bridge.storage.get).toHaveBeenCalledTimes(6);
    expect(adapter.getPlaygamaStorageMode()).toBe('memory');
    expect(bridge.storage.set).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it.each(['{bad', snapshot({ countryStreak: 12 }), JSON.stringify({ version: 2, values: {} })])(
    'plays from memory on a malformed save (%s) without replacing it', async (saved) => {
      const bridge = platform(saved);
      await adapter.initializePlaygamaStorage(bridge);
      expect(adapter.getPlaygamaStorageMode()).toBe('memory');
      adapter.setPlaygamaStorageItem('countryStreak', 1);
      await adapter.flushPlaygamaStorage();
      expect(bridge.storage.set).not.toHaveBeenCalled();
    },
  );

  it('keeps migrated legacy values readable but unsaved when the migration write fails, then saves on recovery', async () => {
    vi.useFakeTimers();
    local.set('countryStreak', '7');
    const bridge = platform();
    bridge.storage.set.mockRejectedValueOnce(new Error('save unavailable'));
    await adapter.initializePlaygamaStorage(bridge);
    expect(adapter.getPlaygamaStorageMode()).toBe('memory');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('7');
    await vi.advanceTimersByTimeAsync(30000);
    expect(adapter.getPlaygamaStorageMode()).toBe('bridge');
    expect(bridge.storage.set).toHaveBeenCalledTimes(2);
    expect(JSON.parse(bridge.storage.set.mock.calls[1][1][0]).values).toEqual({ countryStreak: '7' });
    vi.useRealTimers();
  });

  it('attaches a late SDK save while in memory mode, cloud as base and session changes on top', async () => {
    await adapter.initializePlaygamaStorage(null);
    expect(adapter.getPlaygamaStorageMode()).toBe('memory');
    adapter.setPlaygamaStorageItem('countryStreak', 5);
    const bridge = platform(snapshot({ countryStreak: '1', lang: 'en' }));
    expect(await adapter.attachPlaygamaStorage(bridge)).toBe(true);
    expect(adapter.getPlaygamaStorageMode()).toBe('bridge');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('5');
    expect(adapter.getPlaygamaStorageItem('lang')).toBe('en');
    await adapter.flushPlaygamaStorage();
    expect(JSON.parse(bridge.storage.set.mock.calls.at(-1)[1][0]).values).toEqual({ countryStreak: '5', lang: 'en' });
    expect(await adapter.attachPlaygamaStorage(bridge)).toBe(false);
  });

  it('falls back to the timed retries when a late attach fails', async () => {
    vi.useFakeTimers();
    await adapter.initializePlaygamaStorage(null);
    const bridge = platform(snapshot({ countryStreak: '1' }));
    bridge.storage.get.mockRejectedValueOnce(new Error('offline'));
    expect(await adapter.attachPlaygamaStorage(bridge)).toBe(false);
    expect(adapter.getPlaygamaStorageMode()).toBe('memory');
    await vi.advanceTimersByTimeAsync(60000);
    expect(adapter.getPlaygamaStorageMode()).toBe('bridge');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('1');
    vi.useRealTimers();
  });

  it('does not write on recovery when the only session change is a session-only key', async () => {
    vi.useFakeTimers();
    const bridge = platform(snapshot({ countryStreak: '2' }));
    bridge.storage.get.mockRejectedValueOnce(new Error('offline'));
    await adapter.initializePlaygamaStorage(bridge);
    adapter.setPlaygamaStorageItem('wg_seen', 'ring');
    await vi.advanceTimersByTimeAsync(30000);
    expect(adapter.getPlaygamaStorageMode()).toBe('bridge');
    await adapter.flushPlaygamaStorage();
    expect(bridge.storage.set).not.toHaveBeenCalled();
    expect(adapter.getPlaygamaStorageItem('wg_seen')).toBe('ring');
    vi.useRealTimers();
  });

  it('overlays writes made before initialization on the restored save', async () => {
    adapter.setPlaygamaStorageItem('lang', 'fr');
    const bridge = platform(snapshot({ lang: 'en', countryStreak: '1' }));
    await adapter.initializePlaygamaStorage(bridge);
    expect(adapter.getPlaygamaStorageItem('lang')).toBe('fr');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('1');
    await adapter.flushPlaygamaStorage();
    expect(JSON.parse(bridge.storage.set.mock.calls.at(-1)[1][0]).values).toEqual({ lang: 'fr', countryStreak: '1' });
  });

  it('keeps the seen-locations cache in memory only, never in the Bridge save or the migration', async () => {
    local.set('wg_seen', 'legacy-cache');
    local.set('countryStreak', '3');
    const bridge = platform();
    await adapter.initializePlaygamaStorage(bridge);
    expect(JSON.parse(bridge.storage.set.mock.calls[0][1][0]).values).toEqual({ countryStreak: '3' });
    expect(adapter.getPlaygamaStorageItem('wg_seen')).toBeNull();
    adapter.setPlaygamaStorageItem('wg_seen', 'this-session');
    await adapter.flushPlaygamaStorage();
    expect(bridge.storage.set).toHaveBeenCalledTimes(1);
    expect(adapter.getPlaygamaStorageItem('wg_seen')).toBe('this-session');
  });

  it('serializes writes and persists changes made while an earlier save is pending', async () => {
    const bridge = platform(snapshot({ countryStreak: '2' }));
    await adapter.initializePlaygamaStorage(bridge);
    const waiting = deferred();
    bridge.storage.set.mockReturnValueOnce(waiting.promise);
    adapter.setPlaygamaStorageItem('countryStreak', 3);
    await vi.waitFor(() => expect(bridge.storage.set).toHaveBeenCalledTimes(1));
    adapter.setPlaygamaStorageItem('countryStreak', 4);
    adapter.setPlaygamaStorageItem('sfxVolume', 0);
    adapter.removePlaygamaStorageItem('countryStreak');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBeNull();
    expect(adapter.getPlaygamaStorageItem('sfxVolume')).toBe('0');
    expect(bridge.storage.set).toHaveBeenCalledTimes(1);
    waiting.resolve();
    await adapter.flushPlaygamaStorage();
    expect(JSON.parse(bridge.storage.set.mock.calls.at(-1)[1][0]).values).toEqual({ sfxVolume: '0' });
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('keeps failed writes dirty so a later flush saves the newest state', async () => {
    const bridge = platform(snapshot({ countryStreak: '2' }));
    await adapter.initializePlaygamaStorage(bridge);
    bridge.storage.set.mockRejectedValueOnce(new Error('offline'));
    adapter.setPlaygamaStorageItem('countryStreak', 3);
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('3');
    await adapter.flushPlaygamaStorage();
    expect(bridge.storage.set).toHaveBeenCalledTimes(2);
    expect(JSON.parse(bridge.storage.set.mock.calls[1][1][0]).values.countryStreak).toBe('3');
  });

  it('routes the existing synchronous wrapper through Bridge only in the 6x build', async () => {
    vi.stubEnv('NEXT_PUBLIC_6X', 'true');
    const bridge = platform(snapshot({ countryStreak: '4' }));
    await adapter.initializePlaygamaStorage(bridge);
    const { default: gameStorage } = await import('../components/utils/localStorage.js');
    gameStorage.setItem('countryStreak', 5);
    expect(gameStorage.getItem('countryStreak')).toBe('5');
    await adapter.flushPlaygamaStorage();
    expect(window.localStorage.setItem).not.toHaveBeenCalled();

    vi.stubEnv('NEXT_PUBLIC_6X', 'false');
    gameStorage.setItem('normal', 'local');
    expect(gameStorage.getItem('normal')).toBe('local');
    window.inCrazyGames = true;
    window.CrazyGames = { SDK: { data: { getItem: vi.fn(() => 'crazy-value') } } };
    expect(gameStorage.getItem('normal')).toBe('crazy-value');
  });
});
