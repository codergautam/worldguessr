/**
 * "Beat X% of other players" for a daily-challenge rank; null when there is
 * no rank or fewer than 2 plays. Identical to the server's submit derivation.
 */
export function derivePercentile(rank: number | null | undefined, totalPlays: number | null | undefined): number | null;
