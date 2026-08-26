// ChinaGuessr (temporary): whether the /china landing cover is up.
// pages/china.js writes it; the navbar reads it to label Back as Menu and to
// drop the reload button while the game is parked under the cover. A module
// store, so the navbar needs no new prop threaded through home.js.
import { useSyncExternalStore } from 'react';

let up = false;
const listeners = new Set();

export function setChinaLandingUp(next) {
  if (up === next) return;
  up = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const read = () => up;
const readServer = () => false;

export function useChinaLandingUp() {
  return useSyncExternalStore(subscribe, read, readServer);
}
