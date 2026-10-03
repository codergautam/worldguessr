// Bridge storage is asynchronous; the existing gameStorage API is synchronous.
// The 6x boot gate restores this mirror before mounting any game consumers
// (docs, Storage → "restore the player's state before showing gameplay").
// One versioned save also remembers deleted keys, so old local values cannot
// reappear on the next launch. All persistence goes through Bridge: the docs
// forbid localStorage for saves; the one-time read of known legacy keys below
// is a migration, not a save.
//
// A failed restore never blocks play (moderation rejects "technical messages,
// errors, freezing"): the game runs from memory, Bridge writes stay disabled
// so defaults can never overwrite an unread cloud save, and the read is
// retried in the background. When it recovers, the cloud save is the base and
// this session's changes overlay it.
const SAVE_KEY = 'wg_6x_save_v1';
const LEGACY_KEYS = [
  'options', 'lang', 'onboarding', 'singleplayerDefaultMode',
  'countryStreak', 'countryGuessrStreak', 'continentGuessrStreak',
  'multiplayerEmotesEnabled', 'multiplayerChatEnabled',
  'sfxVolume', 'musicVolume', 'shownDiscordModal', 'rejoinCode',
];
// Set by the settings menu when the player picks a language; the boot gate
// lets "lang" beat platform.language only when this marker is present.
export const EXPLICIT_LANGUAGE_KEY = 'wg_6x_lang_explicit';
// Session-only keys live in the mirror but never in the Bridge save. wg_seen
// (components/utils/seenLocations.js) is a ~25 KB cache that changes every
// round; the docs say to save on meaningful progress, not every frame.
const SESSION_ONLY_KEYS = new Set(['wg_seen']);
const RECOVERY_DELAYS_MS = [30000, 60000, 120000, 240000, 480000];

let values = new Map();
let storage = null;         // Bridge storage once a restore succeeded
let mode = 'uninitialized'; // 'uninitialized' | 'memory' | 'bridge'
let dirtyKeys = new Set();  // keys changed before the Bridge save was readable
let initialization = null;
let recoveryTimer = null;
let recovering = false;
let revision = 0;
let savedRevision = 0;
let writes = Promise.resolve();

export function getPlaygamaStorageMode() {
  return mode;
}

function encode(save) {
  const persisted = {};
  for (const [key, value] of save) {
    if (!SESSION_ONLY_KEYS.has(key)) persisted[key] = value;
  }
  return JSON.stringify({ version: 1, values: persisted });
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

function usable(nextStorage) {
  return typeof nextStorage?.get === 'function' && typeof nextStorage?.set === 'function';
}

async function restore(nextStorage) {
  const result = await nextStorage.get([SAVE_KEY]);
  if (!Array.isArray(result) || result.length !== 1) throw new Error('Invalid Playgama storage response');
  const raw = result[0];
  const restored = raw == null ? legacyValues() : decode(raw);
  // Persist even an empty migration so deleted local keys stay deleted. A
  // failed write keeps us in memory mode: never play on empty defaults that
  // could subsequently overwrite an unread cloud save.
  if (raw == null) await nextStorage.set([SAVE_KEY], [encode(restored)]);
  return restored;
}

// This session's changes (made while the save was unreadable) overlay a
// restored map, deletions included. Returns whether any of them must reach
// the Bridge save (session-only keys never do).
function overlayDirty(target) {
  let persistable = false;
  for (const key of dirtyKeys) {
    if (values.has(key)) target.set(key, values.get(key));
    else target.delete(key);
    if (!SESSION_ONLY_KEYS.has(key)) persistable = true;
  }
  for (const key of SESSION_ONLY_KEYS) {
    if (values.has(key)) target.set(key, values.get(key));
  }
  return persistable;
}

// Cloud save is the base; the session's changes overlay it.
function adopt(restored, nextStorage) {
  const changed = overlayDirty(restored);
  values = restored;
  storage = nextStorage;
  mode = 'bridge';
  dirtyKeys = new Set();
  if (changed) persistChange();
}

// One recovery attempt; resolves true when the save was adopted. A failure
// arms the next timed attempt, giving up after RECOVERY_DELAYS_MS.
async function recover(nextStorage, attempt) {
  if (mode !== 'memory' || recovering) return false;
  recovering = true;
  try {
    const restored = await restore(nextStorage);
    if (mode !== 'memory') return false;
    adopt(restored, nextStorage);
    console.log('[Playgama] storage recovered');
    return true;
  } catch (error) {
    console.warn('[Playgama] storage retry failed', error?.message);
    scheduleRecovery(nextStorage, attempt + 1);
    return false;
  } finally {
    recovering = false;
  }
}

function scheduleRecovery(nextStorage, attempt) {
  if (attempt >= RECOVERY_DELAYS_MS.length) {
    console.warn('[Playgama] storage did not recover; this session stays in memory');
    return;
  }
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    void recover(nextStorage, attempt);
  }, RECOVERY_DELAYS_MS[attempt]);
}

// The SDK became available only after the game mounted (the boot gate saw
// no bridge). Attach its save now: an immediate attempt, then the timed
// retries. Resolves true once the save was adopted.
export function attachPlaygamaStorage(bridge) {
  const nextStorage = bridge?.storage;
  if (mode !== 'memory' || !usable(nextStorage) || recoveryTimer || recovering) return Promise.resolve(false);
  return recover(nextStorage, 0);
}

export function initializePlaygamaStorage(bridge) {
  if (mode !== 'uninitialized') return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    const nextStorage = bridge?.storage;
    if (usable(nextStorage)) {
      try {
        const restored = await restore(nextStorage);
        adopt(restored, nextStorage);
        return;
      } catch (error) {
        console.warn('[Playgama] storage restore failed; playing from memory until it recovers', error?.message);
      }
    } else {
      console.warn('[Playgama] storage unavailable; playing from memory');
    }
    // Pre-init writes (dirtyKeys) overlay the migrated legacy values too, and
    // stay dirty so they overlay the cloud save when it recovers.
    const fallback = legacyValues();
    overlayDirty(fallback);
    values = fallback;
    mode = 'memory';
    if (usable(nextStorage)) scheduleRecovery(nextStorage, 0);
  })();
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

function recordChange(key) {
  if (mode === 'bridge') {
    if (!SESSION_ONLY_KEYS.has(key)) persistChange();
  } else {
    dirtyKeys.add(key);
  }
}

export function setPlaygamaStorageItem(key, value) {
  key = String(key);
  value = String(value);
  if (values.get(key) === value) return;
  values.set(key, value);
  recordChange(key);
}

export function removePlaygamaStorageItem(key) {
  key = String(key);
  const existed = values.delete(key);
  // Before the save is readable, a removal must still overlay the cloud
  // value on recovery even when nothing was held locally.
  if (mode !== 'bridge') { dirtyKeys.add(key); return; }
  if (existed) recordChange(key);
}
