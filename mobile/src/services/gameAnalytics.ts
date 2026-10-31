import { logEvent } from './analytics';
import { useMultiplayerStore } from '../store/multiplayerStore';

// Game-loop and matchmaking funnel events. Kept in one module so the game and
// results screens each make a single call instead of carrying the bookkeeping.

interface ActiveGame {
  mode: string;
  map: string;
  round: number;
}

let active: ActiveGame | null = null;
// The game screen that started `active`. Play Again swaps in a fresh screen,
// and the old one's unmount must not abandon the new screen's game.
let activeOwner: object | null = null;

/**
 * Round `round` of a game is being played. Round 1 opens a new game (an
 * unfinished previous one, e.g. a map switch mid-game, counts as abandoned).
 */
export function trackGameRound(owner: object, mode: string, map: string, round: number): void {
  if (round === 1) {
    if (active) void logEvent('game_abandon', { ...active, reason: 'restart' });
    active = { mode, map, round };
    activeOwner = owner;
    void logEvent('game_start', { mode, map });
  } else if (active) {
    active.round = round;
  }
}

/** Live results screen mounted: the active game was played to the end. */
export function trackGameFinish(score: number): void {
  if (!active) return;
  void logEvent('game_finish', { mode: active.mode, map: active.map, rounds: active.round, score });
  active = null;
}

/** Game screen unmounted: an unfinished game it started was abandoned on its current round. */
export function trackGameExit(owner: object): void {
  if (!active || activeOwner !== owner) return;
  void logEvent('game_abandon', { ...active, reason: 'exit' });
  active = null;
}

// ── Matchmaking funnel ───────────────────────────────────────────────────────
// Derived from `gameQueued` transitions rather than the many call sites that
// set/clear it: leaving the queue into a real game is a match; leaving it any
// other way (cancel, join timeout, disconnect, back to the 2v2 staging lobby)
// is a cancel. A matched duel's first snapshot can still be state 'waiting'
// (the server adds players before start()), so the lobby flag decides.
let queueUnsub: (() => void) | null = null;

export function startQueueAnalytics(): void {
  if (queueUnsub) return;
  let joinedAt = 0;
  queueUnsub = useMultiplayerStore.subscribe((state, prev) => {
    if (state.gameQueued === prev.gameQueued) return;
    if (prev.gameQueued) {
      const wait_s = Math.round((Date.now() - joinedAt) / 1000);
      const matched = !!state.gameData && !state.gameData.is2v2Lobby;
      void logEvent(matched ? 'queue_matched' : 'queue_cancel', { queue: prev.gameQueued, wait_s });
    }
    if (state.gameQueued) {
      joinedAt = Date.now();
      void logEvent('queue_join', { queue: state.gameQueued });
    }
  });
}
