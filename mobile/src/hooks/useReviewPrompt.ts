import { useCallback, useEffect, useRef, useState } from 'react';
import { useReviewPromptStore } from '../store/reviewPromptStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { prewarmStoreReview, requestStoreReview } from '../services/storeReview';
import { submitAppFeedback } from '../services/feedback';
import { logEvent } from '../services/analytics';

/**
 * Glue between a results surface and the rate-us flow. Call it once per results
 * screen with a `trigger` that turns true exactly when an eligible game has
 * just finished — on the rising edge it counts the game and, if the user is
 * due, shows the star modal a beat after results render.
 *
 * HAPPY-MOMENT GATE REMOVED (Aug 23, dialed-parity ruling): every eligible
 * finished game may ask, win or lose. Eligibility lives in the store (install
 * age >= 5 min AND >= 1 completed game, plus decline back-offs); ask volume is
 * the review-count lever, and the star split already diverts 1-4★ moods to
 * in-app feedback, so the store sheet only ever sees 5★ intent. Surfaces that
 * must never prompt (history views, private parties, error/DQ daily submits)
 * gate the `trigger` itself.
 *
 * The `handled` ref makes the count fire at most once per mount, so re-renders of
 * a long-lived results screen (e.g. the daily screen) never double-count.
 *
 *   const { visible, onRate, onDismiss } = useReviewPrompt(justFinished);
 *   <ReviewPromptModal visible={visible} onRate={onRate} onDismiss={onDismiss} />
 */

/**
 * Let the results screen settle before sliding the prompt up. This value is
 * pinched from BOTH sides — move it only with a reason:
 *  • too early (~1.4s, tried): users were still reading their score or
 *    mid-tap toward Continue and reflex-closed the ask;
 *  • too late (2.6s, tried): most players leave results fast — home or Play
 *    Again lands before the timer and the prompt rarely fired at all (user
 *    report Aug 23).
 * 1.8s clears the reflex zone while catching normal-speed players. Anyone
 * who still navigates away first costs nothing: the timer is cleaned up
 * before markShown() ever runs, so their ask is saved for next game.
 */
const SHOW_DELAY_MS = 1800;

/**
 * Shared star-tap behaviour for the automatic and the settings-row prompt.
 * 5 → native store flow. 1–4 → keep feedback in-app; if they hit "Send" we POST
 * it to the server (→ Discord) in the BACKGROUND and confirm with a toast, so
 * the modal closes instantly and stays responsive.
 *
 * 5★ ORDER CONTRACT (iOS conversion root-cause fix, Aug 23): the store request
 * is dispatched while the rating card is STILL ON SCREEN and the scene is
 * static; the caller hides the card only after this promise settles. iOS
 * silently discards a requestReview() that arrives during a view-controller
 * transition — the old flow closed a native <Modal> first and dispatched into
 * (or, via a 2s fallback timer, long after) its dismissal, which was
 * structurally dead on iOS and produced the 800-vs-30 Android/iOS review
 * split. ReviewPromptModal is now a plain inline overlay, so no native
 * transition exists here at all. NEVER hide the card before the request is
 * dispatched, and NEVER defer the request behind Modal onDismiss again
 * (Fabric provably never emits it when the Modal unmounts with its screen).
 *
 * PACING: the thanks step is not a read-and-wait beat — the modal dispatches
 * this ~350ms after the 5★ resolves (STORE_DISPATCH_DELAY_MS, a finger-lift
 * guard), so the native sheet lands about a second after the tap, over the
 * still-visible thanks card. Only builds with NO native sheet hold the card
 * up longer, below, so the acknowledgement stays readable there.
 */

/**
 * With no native sheet in the build (Expo Go / stale dev client, TestFlight),
 * the confetti celebration is the entire acknowledgement — hold the card this
 * long before the caller's .finally hides it, so the burst reads as a beat
 * instead of a flash. Production store builds skip this wait: the sheet is
 * already animating in over the confetti.
 */
const NO_SHEET_CELEBRATION_HOLD_MS = 1100;

async function performRate(
  stars: number,
  opts?: { comment?: string; sendFeedback?: boolean },
): Promise<void> {
  useReviewPromptStore.getState().recordRated(stars);
  logEvent('app_review_rate', { stars, store_prompt: stars === 5 });

  if (stars === 5) {
    // 5★ also lands in Discord — silent (no toast, errors swallowed) since
    // the user is already headed to the native store flow.
    submitAppFeedback(5, '').catch(() => {});
    // Both platforms dispatch immediately, card still visible. Resolves right
    // after the iOS sheet request / when the Android Play flow completes;
    // requestStoreReview never rejects; unavailable = silent no-op.
    const path = await requestStoreReview();
    if (path === 'unavailable') {
      await new Promise((resolve) => setTimeout(resolve, NO_SHEET_CELEBRATION_HOLD_MS));
    }
    return;
  }

  if (opts?.sendFeedback) {
    const comment = opts.comment?.trim() ?? '';
    logEvent('app_review_feedback', { stars, has_comment: comment.length > 0 });
    submitAppFeedback(stars, comment)
      .then(() =>
        useMultiplayerStore
          .getState()
          .pushToast({ key: 'rateUsFeedbackSent', toastType: 'success' }),
      )
      .catch(() =>
        useMultiplayerStore
          .getState()
          .pushToast({ key: 'rateUsFeedbackError', toastType: 'error' }),
      );
  }
}

export function useReviewPrompt(trigger: boolean) {
  const loaded = useReviewPromptStore((s) => s.loaded);
  const [visible, setVisible] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!trigger || !loaded || handledRef.current) return;
    handledRef.current = true;

    const store = useReviewPromptStore.getState();
    store.recordCompletedGame();
    if (!store.shouldPrompt()) return;

    const timer = setTimeout(() => {
      const s = useReviewPromptStore.getState();
      s.markShown();
      logEvent('app_review_shown', { completed_games: s.completedGames, source: 'results' });
      // Warm the availability check now, so a 5★ tap goes straight to
      // requestReview() with no native round trip in front of it.
      prewarmStoreReview();
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trigger, loaded]);

  const onRate = useCallback(
    (stars: number, opts?: { comment?: string; sendFeedback?: boolean }) => {
      if (stars === 5) {
        // Card stays up until the store request has been dispatched (see the
        // 5★ ORDER CONTRACT above), then fades out.
        performRate(stars, opts).finally(() => setVisible(false));
      } else {
        setVisible(false);
        performRate(stars, opts);
      }
    },
    [],
  );

  // User dismissed without rating. Back off; the store stops asking after three.
  const onDismiss = useCallback(() => {
    setVisible(false);
    const store = useReviewPromptStore.getState();
    store.recordDismissed();
    logEvent('app_review_dismiss', { decline_count: store.declineCount });
  }, []);

  return { visible, onRate, onDismiss };
}

/**
 * The settings-row variant: the USER opens the prompt, so no eligibility gating
 * and — crucially — closing it is NOT a decline (a voluntary look must not
 * spend the limited auto-ask budget). Still star-gated through the same modal,
 * so a 1-4★ mood is diverted to private feedback and never reaches the store.
 * markShown() starts the retry clock so the automatic ask doesn't pile on
 * right after a manual one.
 */
export function useManualReviewPrompt() {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    useReviewPromptStore.getState().markShown();
    logEvent('app_review_shown', { source: 'settings' });
    prewarmStoreReview();
    setVisible(true);
  }, []);

  const onRate = useCallback(
    (stars: number, opts?: { comment?: string; sendFeedback?: boolean }) => {
      if (stars === 5) {
        // Same order contract as the automatic prompt: request first, hide after.
        performRate(stars, opts).finally(() => setVisible(false));
      } else {
        setVisible(false);
        performRate(stars, opts);
      }
    },
    [],
  );

  const onDismiss = useCallback(() => setVisible(false), []);

  return { visible, open, onRate, onDismiss };
}
