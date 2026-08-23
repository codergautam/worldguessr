import { Platform } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Drives the in-app "rate us" star prompt (see ReviewPromptModal / useReviewPrompt).
 *
 * Goal: nudge players toward a 5-star store review without nagging. The
 * prompt first appears once the install is at least 5 minutes old AND the
 * player has finished 1 non-party game (the happy-moment gate was REMOVED
 * Aug 23 — dialed-parity ruling: ask volume is the review-count lever, and
 * the star split keeps 1-4★ moods in-app), and it is respectful of a "no":
 * each decline backs off a week, three declines → never ask again. Picking
 * any star marks the prompt `done` so we never ask again.
 *
 * Mirrors settingsStore.ts: a single JSON blob persisted under one AsyncStorage
 * key, loaded once at app start, written through on every mutation.
 */

/**
 * iOS reads/writes a FRESH key (deliberate one-time reset, Aug 23): every
 * build before the inline-overlay fix silently swallowed the iOS store sheet,
 * so iOS users who tapped 5★ were marked 'done' — and decliners burned their
 * ask budget — without Apple ever seeing a rating. Switching the key wipes
 * that poisoned state and gives the fixed flow one clean shot at everyone.
 * Android stays on the original key: its flow always worked, and users there
 * who rated really rated — never re-ask them. The old iOS blob is left
 * orphaned under 'wg_review'; do NOT migrate anything from it.
 */
const REVIEW_KEY = Platform.OS === 'ios' ? 'wg_review_ios2' : 'wg_review';

/**
 * ⚠️ TEMPORARY TESTING TOGGLE — set back to `false` before shipping.
 * When true, the prompt shows on EVERY results screen, ignoring the 3-game
 * threshold AND the rated/declined/week-retry gating, so the modal can be
 * triggered over and over. Flip to false to restore real behaviour.
 */
const TEST_ALWAYS_PROMPT: boolean = false;

/** Min install age (measured from the first app open) before any prompt. */
const ELIGIBLE_AFTER_MS = 5 * 60 * 1000;
/** First prompt only after this many finished (non-party) games. */
const PROMPT_AFTER_GAMES = 1;
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
  /** pending = may still ask; done = rated; never = opted out / declined three times. */
  status: ReviewStatus;
  /** How many times the user dismissed the prompt without rating. */
  declineCount: number;
  /** Epoch ms the modal was last shown (gates the 1-week retry). */
  lastPromptAt: number | null;
  /** Epoch ms of the first app open (install-age gate). Stamped in load(). */
  firstOpenedAt: number | null;
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
  /** User dismissed without rating — back off, and stop after three declines. */
  recordDismissed: () => void;
}

const DEFAULTS: PersistedReview = {
  completedGames: 0,
  status: 'pending',
  declineCount: 0,
  lastPromptAt: null,
  firstOpenedAt: null,
};

function persist(s: PersistedReview): void {
  const data: PersistedReview = {
    completedGames: s.completedGames,
    status: s.status,
    declineCount: s.declineCount,
    lastPromptAt: s.lastPromptAt,
    firstOpenedAt: s.firstOpenedAt,
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
      // Install-age clock: stamped on the first load that lacks it (fresh
      // install, or an existing install migrating to this field — its clock
      // starts at the first post-update launch, which is fine).
      firstOpenedAt: typeof stored.firstOpenedAt === 'number' ? stored.firstOpenedAt : Date.now(),
      loaded: true,
    });
    if (typeof stored.firstOpenedAt !== 'number') persist(get());
  },

  recordCompletedGame: () => {
    if (get().status !== 'pending') return; // already rated / opted out → don't bother counting
    const completedGames = get().completedGames + 1;
    set({ completedGames });
    persist(get());
  },

  shouldPrompt: () => {
    const { loaded, status, completedGames, lastPromptAt, firstOpenedAt } = get();
    if (!loaded) return false;
    if (TEST_ALWAYS_PROMPT) return true; // ⚠️ testing: show every time, no gating
    if (status !== 'pending') return false;
    if (firstOpenedAt == null || Date.now() - firstOpenedAt < ELIGIBLE_AFTER_MS) return false;
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
