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
    local.set('wg_guest_id', 'guest-uuid');
    local.set('lang', 'es');
    local.set('wg_secret', 'must-stay-local');
    local.set('wg_daily_status_2026-09-08', 'cached-server-response');
    const bridge = platform();
    await adapter.initializePlaygamaStorage(bridge);
    const [keys, values] = bridge.storage.set.mock.calls[0];
    expect(keys).toEqual([SAVE_KEY]);
    expect(JSON.parse(values[0]).values).toEqual({ countryStreak: '17', wg_guest_id: 'guest-uuid', lang: 'es' });
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

  it('shares initialization and retries a failed read without overwriting unread progress', async () => {
    const waiting = deferred();
    const bridge = platform(snapshot({ countryStreak: '9' }));
    bridge.storage.get.mockReturnValueOnce(waiting.promise);
    const first = adapter.initializePlaygamaStorage(bridge);
    const second = adapter.initializePlaygamaStorage(bridge);
    expect(first).toBe(second);
    waiting.reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    expect(bridge.storage.set).not.toHaveBeenCalled();
    await adapter.initializePlaygamaStorage(bridge);
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('9');
  });

  it('rejects malformed saves instead of replacing them with empty progress', async () => {
    for (const saved of ['{bad', snapshot({ countryStreak: 12 }), JSON.stringify({ version: 2, values: {} })]) {
      const bridge = platform(saved);
      await expect(adapter.initializePlaygamaStorage(bridge)).rejects.toThrow();
      expect(bridge.storage.set).not.toHaveBeenCalled();
    }
  });

  it('requires a successful migration write before releasing the boot gate, and allows retry', async () => {
    local.set('countryStreak', '7');
    const bridge = platform();
    bridge.storage.set.mockRejectedValueOnce(new Error('save unavailable'));
    await expect(adapter.initializePlaygamaStorage(bridge)).rejects.toThrow('save unavailable');
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBeNull();
    await adapter.initializePlaygamaStorage(bridge);
    expect(adapter.getPlaygamaStorageItem('countryStreak')).toBe('7');
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
