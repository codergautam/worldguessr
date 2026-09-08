/**
 * Race-safe navigation helpers around expo-router's imperative API.
 */
import { router, useNavigationContainerRef } from 'expo-router';

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

type RootNavRef = ReturnType<typeof useNavigationContainerRef>;

// The slice of a react-navigation stack state this helper reads and rebuilds.
// Structural on purpose: @react-navigation/* is not resolvable from app code
// (pnpm keeps it under expo-router's own node_modules).
type NavState = {
  key: string;
  type: string;
  stale: boolean;
  index: number;
  routeNames: string[];
  routes: Array<{ key: string; name: string; params?: object; state?: unknown }>;
};

/** An initialized navigator state of any kind (the tab navigator is type 'tab'). */
function isReadyState(s: unknown): s is NavState {
  const st = s as Partial<NavState> | null | undefined;
  return !!st && st.stale === false && typeof st.key === 'string' && Array.isArray(st.routes) && Array.isArray(st.routeNames);
}

function isReadyStack(s: unknown): s is NavState {
  return isReadyState(s) && s.type === 'stack';
}

/**
 * The app's root stack (app/_layout.tsx). expo-router mounts that layout
 * inside a one-screen stack of its own (`__root`, expo-router/build/
 * ExpoRoot.js Content()), so the container's root state is the wrapper and
 * the app stack is its first route's nested `state`. Accepts an unwrapped
 * root too, in case a later expo-router drops the slot.
 */
function appStack(root: unknown): NavState | null {
  if (!isReadyStack(root)) return null;
  const inner = root.routes[0]?.state;
  if (isReadyStack(inner) && inner.routes[0]?.name === '(tabs)') return inner;
  return root.routes[0]?.name === '(tabs)' ? root : null;
}

/**
 * Swap the app's root stack for [tab root, `name`] in ONE navigation action.
 *
 * WHY THIS EXISTS
 * ---------------
 * Play Again used to be dismissAllSafe + a deferred push. The pop lands on
 * the home tab and the push can only ride a later drain of expo-router's
 * routing queue, so home got a painted frame or two between the finished
 * game and the next one: the "home flash". A RESET that keeps the anchored
 * tab route object as-is (same key, same nested state, so nothing under it
 * remounts) and appends the next screen swaps the top of the stack in one
 * commit. react-native-screens animates it as a push of the new top (its own
 * `animation` option) while the finished game and results drop away beneath.
 *
 * WHICH STACK
 * -----------
 * The first cut of this helper read the container's root state and looked
 * for '(tabs)' at index 0. That root is expo-router's `__root` slot (see
 * appStack above), so the check failed on every call and each caller fell
 * back, silently, to the very hop this exists to remove. The stack that
 * holds '(tabs)', 'queue' and 'game/[id]' is one level down.
 *
 * Dispatched straight on the container ref, NOT through expo-router's queued
 * imperative API, so the store update that triggered it and the stack swap
 * land in the same React commit (the container's state store is synchronous,
 * like ours; a nested navigator writes its state into the parent's route
 * object on the spot). Two rules for callers:
 *  - Every removed route's `beforeRemove` listener can veto the whole reset.
 *    Only call this over screens that let an unfocused removal through
 *    (game/[id] does: its guard returns early unless it is the focused
 *    screen, which it never is under results).
 *  - A dismissAllSafe queued in the same tick would drain AFTER this reset
 *    and pop the fresh top straight back to home, so the helper refuses then.
 *
 * Returns true when the stack now ends on `name`. Returns false, having
 * changed nothing, when the stack is not the expected [(tabs), ...] shape or
 * `name` is not one of its screens; the caller then falls back to the
 * two-beat hop. Every refusal logs its reason in dev, so a device run shows
 * which path actually ran.
 */
export function resetRootStackTo(
  navRef: RootNavRef,
  name: string,
  params?: Record<string, unknown>,
): boolean {
  const bail = (reason: string): false => {
    if (__DEV__) console.warn('[nav] resetRootStackTo fell back:', reason);
    return false;
  };
  if (dismissPending) return bail('a dismissAll is pending this tick');
  const nav = navRef.current;
  if (!nav || !nav.isReady()) return bail('container not ready');
  const app = appStack(nav.getRootState());
  if (!app) return bail('no app stack under the container root');
  const anchor = app.routes[0];
  if (anchor?.name !== '(tabs)') return bail(`stack root is ${anchor?.name ?? 'empty'}, not (tabs)`);
  // The tab navigator reads its state off this route object. Without it the
  // tabs re-init with fresh keys and every tab screen remounts: worse than
  // the flash this helper removes, so refuse instead.
  if (!isReadyState(anchor.state)) return bail('(tabs) route carries no tab state');
  if (!app.routeNames.includes(name)) return bail(`${name} is not a root screen`);
  nav.dispatch({
    type: 'RESET',
    // The target must be the app stack's own key: expo-router's stack router
    // override drops any action whose target names another navigator.
    target: app.key,
    // Spreading the live state keeps `stale: false` and `routeNames`, which
    // is what makes BaseRouter honour `index`, keep the anchor's key and
    // nested state, and mint a fresh key for the appended route (so a
    // replayed game/[id] mounts new instead of reusing the finished one).
    payload: {
      ...app,
      index: 1,
      routes: [anchor, params ? { name, params } : { name }],
    },
  });
  // Synchronous state store: a vetoed or unhandled reset shows up right here.
  const after = appStack(nav.getRootState());
  const top = after?.routes[after.routes.length - 1];
  if (after?.routes.length === 2 && top?.name === name) return true;
  return bail(`reset did not land (top is ${top?.name ?? 'none'})`);
}
