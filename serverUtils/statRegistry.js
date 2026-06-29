// Tiny registry so in-memory collections can report their current size to a
// central stats endpoint. Modules call `registerStat('name', () => size)` at
// load time; the /debug/stats endpoint calls every reporter and returns the
// map. Whichever one grows between successive hits is your leak.

const reporters = new Map();

export function registerStat(name, fn) {
  reporters.set(name, fn);
}

export function getAllStats() {
  const out = {};
  for (const [name, fn] of reporters) {
    try {
      out[name] = fn();
    } catch (e) {
      out[name] = `error: ${e?.message || e}`;
    }
  }
  return out;
}
