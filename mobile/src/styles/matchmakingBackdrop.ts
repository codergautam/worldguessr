/**
 * THE matchmaking backdrop: SiteBackground photo + this 3-stop dark-green
 * veil. One constant, three consumers — the queue screen (app/queue.tsx), the
 * duel VS intro (GetReadyOverlay), and the casual round-1 countdown
 * (GameLoadingOverlay in countdown mode).
 *
 * The whole point of sharing it is the SEAM: queue → get-ready is a 300ms
 * native route cross-fade (queue stays mounted underneath on the 1v1 push
 * path), and it is only invisible because both sides paint IDENTICAL pixels.
 * A drifted copy of these colors in any one consumer reintroduces the jarring
 * darkness jump this constant exists to kill. Change it here or not at all.
 */
export const MATCHMAKING_VEIL_COLORS = [
  'rgba(6, 16, 10, 0.72)',
  'rgba(6, 16, 10, 0.86)',
  'rgba(6, 16, 10, 0.96)',
] as const;
