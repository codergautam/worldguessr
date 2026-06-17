import { HTTP_TIMEOUT_MS } from '../constants/config';

/**
 * Thrown when a request exceeds its time budget — the socket hung (DNS / TCP /
 * read stalled) rather than failing cleanly. Kept distinct from a generic network
 * error so a caller that cares can message "timed out" differently from "offline",
 * and so `instanceof TimeoutError` checks are possible. The message is developer-
 * facing (includes the URL) and is NOT meant to be shown raw to users — the app's
 * API layer (services/api.ts) translates it into a localized, user-safe string.
 */
export class TimeoutError extends Error {
  constructor(message = 'The request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * `fetch()` with a hard time budget. This is the single choke point EVERY network
 * call in the app routes through, which is what guarantees no request — and so no
 * loading spinner — can hang forever:
 *
 *   - Aborts the request after `timeoutMs` and rejects with a {@link TimeoutError}.
 *     A bare fetch() against a black-holed socket never settles; this makes it
 *     settle, so the caller's existing catch / finally / retry logic actually runs.
 *   - Composes with a caller-supplied `AbortSignal` (e.g. cancel-on-unmount): the
 *     request aborts when EITHER our timeout fires or the caller's signal aborts,
 *     and a caller-initiated abort re-throws as a plain AbortError (not a
 *     TimeoutError) so the caller can still recognise its own cancellation.
 *   - Always clears its timer and detaches its listener (`finally`), so a fast
 *     response leaks neither a pending timeout nor a handler.
 *
 * Prefer this over the global `fetch()` everywhere. Most callers get it for free
 * via `fetchApi()` in services/api.ts; reach for it directly only for one-off raw
 * requests that don't go through that layer.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Fold a caller-supplied signal into ours: aborting either one aborts the fetch.
  const external = options.signal ?? undefined;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort);
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    // We aborted because the budget elapsed (and the caller hadn't aborted first):
    // surface a clear, catchable TimeoutError instead of the opaque AbortError.
    if (
      err instanceof Error &&
      err.name === 'AbortError' &&
      !(external && external.aborted)
    ) {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  }
}
