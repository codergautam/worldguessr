// Simple event bus for syncing heart state between map list and detail pages
type HeartUpdate = { mapId: string; hearted: boolean; hearts: number };
type Listener = (update: HeartUpdate) => void;

const listeners = new Set<Listener>();

export function onHeartUpdate(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitHeartUpdate(update: HeartUpdate) {
  listeners.forEach((fn) => fn(update));
}
