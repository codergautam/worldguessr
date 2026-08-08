// Types for shared/stamps/receipt.js. Mobile consumes that module through the
// @shared alias under `strict`, so the contract is declared here rather than
// inferred: the JS is intentionally tolerant of junk input (a receipt is
// currency — malformed rows must vanish, never render as a zero), and inference
// from the implementation would hand callers a signature that forbids exactly
// the loose input it was written to survive.

export interface StampReceiptLine {
  reason: string;
  amount: number;
}

/**
 * Wire reason -> locale key, for the breakdown lines. An unmapped reason is a
 * miss by design: renderers drop the label and show the bare amount, so a new
 * server-side earn source degrades instead of crashing or leaking a raw slug.
 */
export declare const STAMP_REASON_KEYS: Record<string, string>;

/**
 * Collapse repeated reasons into one line each, first-seen order preserved.
 * Malformed entries are skipped. Accepts anything: null, undefined and
 * non-arrays all return [].
 */
export declare function mergeStampLines(lines?: unknown): StampReceiptLine[];
