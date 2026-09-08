// Bridge storage is asynchronous; the existing gameStorage API is synchronous.
// The 6x boot gate restores this mirror before mounting any game consumers.
// One versioned save also remembers deleted keys, so old local values cannot
// reappear on the next launch. All subsequent persistence goes through Bridge.
const SAVE_KEY = 'wg_6x_save_v1';
const LEGACY_KEYS = [
  'options', 'lang', 'onboarding', 'singleplayerDefaultMode',
  'countryStreak', 'countryGuessrStreak', 'continentGuessrStreak',
  'multiplayerEmotesEnabled', 'multiplayerChatEnabled',
  'sfxVolume', 'musicVolume', 'shownDiscordModal', 'rejoinCode',
  'wg_seen', 'wg_guest_id',
];

let values = new Map();
let storage = null;
let initialization = null;
let revision = 0;
let savedRevision = 0;
let writes = Promise.resolve();

function encode(save) {
  return JSON.stringify({ version: 1, values: Object.fromEntries(save) });
}

function decode(raw) {
  const save = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!save || save.version !== 1 || !save.values || typeof save.values !== 'object' || Array.isArray(save.values)) {
    throw new Error('Invalid Playgama save');
  }
  const entries = Object.entries(save.values);
  if (entries.some(([, value]) => typeof value !== 'string')) throw new Error('Invalid Playgama save values');
  return new Map(entries);
}

function legacyValues() {
  const restored = new Map();
  // Read-only migration of this game's known keys, never auth credentials or
  // per-day API caches. Leave originals intact if a platform save fails.
  for (const key of LEGACY_KEYS) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) restored.set(key, value);
    } catch (e) { /* local storage unavailable */ }
  }
  return restored;
}

export function initializePlaygamaStorage(bridge) {
  if (storage) return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    const nextStorage = bridge?.storage;
    if (typeof nextStorage?.get !== 'function' || typeof nextStorage?.set !== 'function') {
      throw new Error('Playgama storage is unavailable');
    }
    const result = await nextStorage.get([SAVE_KEY]);
    if (!Array.isArray(result) || result.length !== 1) throw new Error('Invalid Playgama storage response');
    const raw = result[0];
    const restored = raw == null ? legacyValues() : decode(raw);
    // Persist even an empty migration so deleted local keys stay deleted.
    // A failed read/write rejects the boot gate; never play on empty defaults
    // that could subsequently overwrite an unread cloud save.
    if (raw == null) await nextStorage.set([SAVE_KEY], [encode(restored)]);
    values = restored;
    storage = nextStorage;
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

export function getPlaygamaStorageItem(key) {
  return values.get(String(key)) ?? null;
}

// Every save waits for its predecessor, then snapshots the newest state.
// Multiple synchronous changes coalesce; a failed save leaves the revision
// dirty for the next write or the boot gate's visibility/pagehide flush.
export function flushPlaygamaStorage() {
  if (!storage) return Promise.resolve();
  writes = writes.catch(() => {}).then(async () => {
    if (savedRevision === revision) return;
    const writingRevision = revision;
    await storage.set([SAVE_KEY], [encode(values)]);
    savedRevision = writingRevision;
  });
  return writes;
}

function persistChange() {
  revision++;
  void flushPlaygamaStorage().catch((error) => {
    console.warn('[Playgama] save failed; will retry on the next flush', error?.message);
  });
}

export function setPlaygamaStorageItem(key, value) {
  if (!storage) throw new Error('Playgama storage is not initialized');
  key = String(key);
  value = String(value);
  if (values.get(key) === value) return;
  values.set(key, value);
  persistChange();
}

export function removePlaygamaStorageItem(key) {
  if (!storage) throw new Error('Playgama storage is not initialized');
  if (!values.delete(String(key))) return;
  persistChange();
}
