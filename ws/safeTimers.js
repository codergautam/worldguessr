// Crash-safe timers for the websocket process. PURE — no imports, no process,
// no clock of its own beyond the one it wraps, same rule as ws/matchmakingV2.js
// and ws/queueEta.js. That purity is the only reason the behaviour below can be
// unit tested at all, and "does this actually swallow the throw" is exactly the
// kind of thing that must be pinned by a test rather than eyeballed in prod.
//
// WHY THIS EXISTS
// ---------------
// ws/ws.js installs `process.on('uncaughtException')` and that handler calls
// process.exit(1). The ws process holds every live duel in memory, so a single
// unhandled throw inside a timer callback does not degrade one player's
// experience — it ends the game for EVERY connected player, and the only
// recovery is the gamestate dump plus a restart.
//
// The 500ms queue tick is the sharp end of that. It walks every queued player,
// every live game and every disconnected player on each pass, so it touches the
// most objects and has the most opportunities for one of them to be in a shape
// nobody expected. That risk was already known: the widen loop inside it carries
// a hand-written `if (!player) continue` whose comment says a .send() on a
// vanished player "throws, killing the whole widen pass for everyone else still
// queued". That was one patched line. This is the policy.
//
// TWO LAYERS, BOTH WANTED
// -----------------------
// safeInterval is a BACKSTOP: it keeps the process alive, but the rest of that
// pass is still skipped. The loops inside the tick carry their own per-item
// try/catch so one bad player is skipped instead of everyone. Neither layer
// replaces the other.

/**
 * setInterval whose callback can never take the process down.
 *
 * SYNC AND ASYNC BOTH. A plain try/catch only catches synchronous throws — an
 * async callback rejects instead, which lands in the unhandledRejection handler
 * and never reaches the catch. Several timers here are async or return a
 * promise (location refresh, recent-plays bulk write), so if the callback hands
 * back a thenable its rejection is routed to the same onError. Without this the
 * helper would look protective while covering barely half the real risk.
 *
 * @param {string}   label  short name for the log line, e.g. 'queue'
 * @param {number}   ms     interval period
 * @param {Function} fn     callback; a throw OR a rejection is logged and swallowed
 * @param {object}   [deps] injection seam for tests: { setInterval, onError }
 * @returns whatever the underlying setInterval returns (a Timeout, or an id)
 */
export function safeInterval(label, ms, fn, deps = {}) {
  const timer = deps.setInterval || setInterval;
  const onError = deps.onError || ((l, e) => {
    console.error(`[tick:${l}] threw, continuing:`, e?.stack || e);
  });
  // A throwing onError would defeat the entire point of this module.
  const report = (e) => { try { onError(label, e); } catch { /* survive */ } };

  return timer(() => {
    try {
      const out = fn();
      // Duck-typed rather than `instanceof Promise`: mongoose queries and other
      // thenables are not Promise instances but reject just as fatally.
      if (out && typeof out.then === 'function' && typeof out.catch === 'function') {
        out.catch(report);
      }
    } catch (e) {
      // Never rethrow, never exit: a broken tick must degrade, not cascade.
      report(e);
    }
  }, ms);
}

/**
 * Run one loop iteration in isolation.
 *
 * Only for loop bodies that do NOT use `continue` — a callback cannot continue
 * its caller's loop. Bodies that do (most of the queue tick) wrap themselves in
 * an inline try/catch instead, which keeps `continue` working normally.
 *
 * @returns {boolean} true if the step completed, false if it threw.
 */
export function guardedStep(label, fn, deps = {}) {
  const onError = deps.onError || ((l, e) => {
    console.error(`[step:${l}] threw, skipping:`, e?.stack || e);
  });
  try {
    fn();
    return true;
  } catch (e) {
    try { onError(label, e); } catch { /* survive */ }
    return false;
  }
}
