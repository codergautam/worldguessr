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
 * user is due, shows the star modal a beat after results render.
 *
 * The `handled` ref makes the count fire at most once per mount, so re-renders of
 * a long-lived results screen (e.g. the daily screen) never double-count.
 *
 *   const { visible, onRate, onDismiss } = useReviewPrompt(justFinished);
 *   <ReviewPromptModal visible={visible} onRate={onRate} onDismiss={onDismiss} />
 */

/** Let the results screen settle before sliding the prompt up (happy pause). */
const SHOW_DELAY_MS = 1400;

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
      logEvent('app_review_shown', { completed_games: s.completedGames });
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trigger, loaded]);

  // User picked a star. 5 → native store sheet. 1–4 → keep feedback in-app; if
  // they hit "Send" we POST it to the server (→ Discord) in the BACKGROUND and
  // confirm with a toast, so the modal closes instantly and stays responsive.
  const onRate = useCallback(
    (stars: number, opts?: { comment?: string; sendFeedback?: boolean }) => {
      setVisible(false);
      useReviewPromptStore.getState().recordRated(stars);
      logEvent('app_review_rate', { stars, store_prompt: stars === 5 });

      if (stars === 5) {
        requestStoreReview();
        return;
      }

      if (opts?.sendFeedback) {
        const comment = opts.comment?.trim() ?? '';
        logEvent('app_review_feedback', { stars, comment: comment.slice(0, 100) });
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
    },
    [],
  );

  // User dismissed without rating. Back off; the store stops asking after two.
  const onDismiss = useCallback(() => {
    setVisible(false);
    const store = useReviewPromptStore.getState();
    store.recordDismissed();
    logEvent('app_review_dismiss', { decline_count: store.declineCount });
  }, []);

  return { visible, onRate, onDismiss };
}
