import { useCallback, useEffect, useRef, useState } from 'react';
import { useReviewPromptStore } from '../store/reviewPromptStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { requestStoreReview } from '../services/storeReview';
import { submitAppFeedback } from '../services/feedback';
import { logEvent } from '../services/analytics';

/**
 * Glue between a results surface and the rate-us flow. Call it once per results
 * screen with a `trigger` that turns true exactly when an eligible (non-party)
 * game has just finished — on the rising edge it counts the game and, if the
 * user is due AND the moment is a happy one, shows the star modal a beat after
 * results render.
 *
 * `happy` is the moment-quality gate: pass true only at a genuine high point
 * (a win, a personal best, a strong score). Pass undefined while the verdict is
 * still unknown (async duel-end payload, in-flight daily submit) — the latch
 * waits for a definite answer, so a game is never mis-filed as unhappy just
 * because its result hadn't arrived yet. Unhappy games still count toward the
 * eligibility threshold; they just never show the ask. Asking at a low point
 * converts to dismissals (burning the limited decline budget) and 1-4★ moods —
 * and the OS rations the native sheet, so every ask spent on a frustrated
 * player is one that can't be spent on a delighted one.
 *
 * The `handled` ref makes the count fire at most once per mount, so re-renders of
 * a long-lived results screen (e.g. the daily screen) never double-count.
 *
 *   const { visible, onRate, onDismiss } = useReviewPrompt(justFinished, wonGame);
 *   <ReviewPromptModal visible={visible} onRate={onRate} onDismiss={onDismiss} />
 */

/** Let the results screen settle before sliding the prompt up (happy pause). */
const SHOW_DELAY_MS = 1400;

/**
 * Shared star-tap behaviour for the automatic and the settings-row prompt.
 * 5 → native store sheet. 1–4 → keep feedback in-app; if they hit "Send" we POST
 * it to the server (→ Discord) in the BACKGROUND and confirm with a toast, so
 * the modal closes instantly and stays responsive.
 */
function performRate(stars: number, opts?: { comment?: string; sendFeedback?: boolean }) {
  useReviewPromptStore.getState().recordRated(stars);
  logEvent('app_review_rate', { stars, store_prompt: stars === 5 });

  if (stars === 5) {
    // 5★ also lands in Discord — silent (no toast, errors swallowed) since
    // the user is already headed to the native store sheet.
    submitAppFeedback(5, '').catch(() => {});
    requestStoreReview();
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

export function useReviewPrompt(trigger: boolean, happy: boolean | undefined = true) {
  const loaded = useReviewPromptStore((s) => s.loaded);
  const [visible, setVisible] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!trigger || !loaded || happy === undefined || handledRef.current) return;
    handledRef.current = true;

    const store = useReviewPromptStore.getState();
    store.recordCompletedGame();
    if (!happy) return; // counted, but not a moment worth spending an ask on
    if (!store.shouldPrompt()) return;

    const timer = setTimeout(() => {
      const s = useReviewPromptStore.getState();
      s.markShown();
      logEvent('app_review_shown', { completed_games: s.completedGames, source: 'results' });
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trigger, loaded, happy]);

  const onRate = useCallback(
    (stars: number, opts?: { comment?: string; sendFeedback?: boolean }) => {
      setVisible(false);
      performRate(stars, opts);
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
    setVisible(true);
  }, []);

  const onRate = useCallback(
    (stars: number, opts?: { comment?: string; sendFeedback?: boolean }) => {
      setVisible(false);
      performRate(stars, opts);
    },
    [],
  );

  const onDismiss = useCallback(() => setVisible(false), []);

  return { visible, open, onRate, onDismiss };
}
