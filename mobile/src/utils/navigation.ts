/**
 * Race-safe navigation helpers around expo-router's imperative API.
 */
import { router } from 'expo-router';

/**
 * A race-safe replacement for `router.dismissAll()`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `dismissAll()` does NOT pop synchronously. It enqueues a single
 * `{ type: 'POP_TO_TOP' }` action onto expo-router's internal `routingQueue`,
 * which is drained later from expo-router's own effect
 * (`useImperativeApiEmitter` → `routingQueue.run` → `navigationRef.dispatch`).
 * That indirection causes two distinct crashes, both surfacing as:
 *
 *     ERROR  The action 'POP_TO_TOP' was not handled by any navigator.
 *
 *  1. NOTHING TO POP. If the focused navigator has no stack with more than one
 *     route, the dispatched POP_TO_TOP is unhandled.
 *
 *  2. DOUBLE-POP RACE. Our multiplayer exit paths call `leaveGame()`/`reset()`,
 *     which sets `inGame: false` synchronously. That re-renders the game screen,
 *     whose effect *also* calls `dismissAll()` — so a single user action
 *     enqueues TWO POP_TO_TOPs before the queue drains. The first pops to the
 *     stack root; the second is then unhandled. Guarding each individual call
 *     with `router.canDismiss()` does NOT fix this: both calls run before the
 *     queue drains, so both observe the same still-poppable state and both
 *     enqueue.
 *
 * This wrapper fixes both: it no-ops when there's nothing to dismiss, and it
 * coalesces every call made within a single drain window into ONE POP_TO_TOP.
 * The lock releases on the next macrotask, by which point the commit that
 * produced the racing calls (and expo-router's queue drain) has completed —
 * so the next genuine, separate navigation is never blocked.
 *
 * Always prefer this over `router.dismissAll()` for "exit to the tab root"
 * navigation (leaving a game, Play Again, Go Home, disconnect teardown, etc.).
 */
let dismissPending = false;

export function dismissAllSafe(): void {
  if (dismissPending) return; // already enqueued this tick — coalesce
  if (!router.canDismiss()) return; // nothing to pop — would be unhandled
  dismissPending = true;
  router.dismissAll();
  // Release after the current commit + passive effects (where the racing
  // reactive dismissAll fires and expo-router's queue drains) have all run.
  setTimeout(() => {
    dismissPending = false;
  }, 0);
}
