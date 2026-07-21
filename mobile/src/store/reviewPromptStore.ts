import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Drives the in-app "rate us" star prompt (see ReviewPromptModal / useReviewPrompt).
 *
 * Goal: nudge happy players toward a 5-star store review without nagging. The
 * prompt first appears once the player has finished 3 non-party games AND a
 * happy moment lands (a win / personal best — the moment gate lives in
 * useReviewPrompt), and is respectful of a "no": each decline backs off a
 * week, three declines → never ask again. Picking any star marks the prompt
 * `done` so we never ask again.
 *
 * Mirrors settingsStore.ts: a single JSON blob persisted under one AsyncStorage
 * key, loaded once at app start, written through on every mutation.
 */

const REVIEW_KEY = 'wg_review';

/**
 * ⚠️ TEMPORARY TESTING TOGGLE — set back to `false` before shipping.
 * When true, the prompt shows on EVERY results screen, ignoring the 3-game
 * threshold AND the rated/declined/week-retry gating, so the modal can be
 * triggered over and over. Flip to false to restore real behaviour.
 */
const TEST_ALWAYS_PROMPT: boolean = false;

/** First prompt only after this many finished (non-party) games. */
const PROMPT_AFTER_GAMES = 3;
/** Decline once and we wait this long before asking again. */
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Three declines and we stop asking forever. (Asks are happy-moment gated and
 *  therefore rare — a third well-timed attempt is worth one more chance.) */
const MAX_DECLINES = 3;

type ReviewStatus = 'pending' | 'done' | 'never';

interface PersistedReview {
  /** Non-party games finished (singleplayer, daily, ranked/unranked duels,
   *  plus the onboarding game — a finished first game is a finished game). */
  completedGames: number;
  /** pending = may still ask; done = rated; never = opted out / declined twice. */
  status: ReviewStatus;
  /** How many times the user dismissed the prompt without rating. */
  declineCount: number;
  /** Epoch ms the modal was last shown (gates the 1-week retry). */
  lastPromptAt: number | null;
}

interface ReviewState extends PersistedReview {
  /** True once AsyncStorage has been read. */
  loaded: boolean;
  load: () => Promise<void>;
  /** Count a finished, eligible (non-party) game. */
  recordCompletedGame: () => void;
  /** Whether the prompt should be shown right now. */
  shouldPrompt: () => boolean;
  /** Record that the modal was actually presented (starts the retry clock). */
  markShown: () => void;
  /** User picked a star — we're done, never ask again. */
  recordRated: (stars: number) => void;
  /** User dismissed without rating — back off, and stop after two declines. */
  recordDismissed: () => void;
}

const DEFAULTS: PersistedReview = {
  completedGames: 0,
  status: 'pending',
  declineCount: 0,
  lastPromptAt: null,
};

function persist(s: PersistedReview): void {
  const data: PersistedReview = {
    completedGames: s.completedGames,
    status: s.status,
    declineCount: s.declineCount,
    lastPromptAt: s.lastPromptAt,
  };
  AsyncStorage.setItem(REVIEW_KEY, JSON.stringify(data)).catch(() => {});
}

export const useReviewPromptStore = create<ReviewState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    let stored: Partial<PersistedReview> = {};
    try {
      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      if (raw) stored = (JSON.parse(raw) as Partial<PersistedReview>) ?? {};
    } catch {
      // Unreadable storage → start fresh from defaults.
    }
    set({
      completedGames:
        typeof stored.completedGames === 'number' ? stored.completedGames : DEFAULTS.completedGames,
      status: stored.status ?? DEFAULTS.status,
      declineCount:
        typeof stored.declineCount === 'number' ? stored.declineCount : DEFAULTS.declineCount,
      lastPromptAt: typeof stored.lastPromptAt === 'number' ? stored.lastPromptAt : null,
      loaded: true,
    });
  },

  recordCompletedGame: () => {
    if (get().status !== 'pending') return; // already rated / opted out → don't bother counting
    const completedGames = get().completedGames + 1;
    set({ completedGames });
    persist(get());
  },

  shouldPrompt: () => {
    const { loaded, status, completedGames, lastPromptAt } = get();
    if (!loaded) return false;
    if (TEST_ALWAYS_PROMPT) return true; // ⚠️ testing: show every time, no gating
    if (status !== 'pending') return false;
    if (completedGames < PROMPT_AFTER_GAMES) return false;
    if (lastPromptAt == null) return true; // first time eligible
    return Date.now() - lastPromptAt >= RETRY_AFTER_MS; // post-decline retry window
  },

  markShown: () => {
    set({ lastPromptAt: Date.now() });
    persist(get());
  },

  recordRated: () => {
    set({ status: 'done' });
    persist(get());
  },

  recordDismissed: () => {
    const declineCount = get().declineCount + 1;
    set({ declineCount, status: declineCount >= MAX_DECLINES ? 'never' : 'pending' });
    persist(get());
  },
}));
