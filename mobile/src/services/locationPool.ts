/**
 * One fetched location pool, kept between games so the app walks it the way the
 * web client walks allLocsArray: take the rounds off the front, drop them, and
 * only go back to the network when what is left cannot fill a game.
 *
 * Without this every game refetched, and inside the CDN window that refetch
 * returned the identical array, so "Play Again" was rolling the same 2,000 rows
 * over and over.
 *
 * Single slot on purpose. Switching maps replaces the pool rather than
 * accumulating one per slug, so the app holds at most one pool (~2,000
 * locations) no matter how much the player map-hops.
 */
export type PoolMeta = {
  maxDist: number;
  extent: [number, number, number, number] | null;
  name: string;
};

type Pool = { slug: string; locs: any[]; meta: PoolMeta };

let pool: Pool | null = null;

/** Rounds off the front of the pool, or null when it cannot fill a whole game. */
export function takeRounds(slug: string, count: number): { locs: any[]; meta: PoolMeta } | null {
  if (!pool || pool.slug !== slug || pool.locs.length < count) return null;
  return { locs: pool.locs.splice(0, count), meta: pool.meta };
}

export function fillPool(slug: string, locs: any[], meta: PoolMeta): void {
  pool = { slug, locs, meta };
}

/** Forces the next game to refetch. Used by the retry path. */
export function clearPool(): void {
  pool = null;
}
