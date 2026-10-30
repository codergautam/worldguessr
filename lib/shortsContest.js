// The WorldGuessr Shorts contest: the 10 most-viewed shorts made after Oct 29
// 2026 win $100 each. Web only: one row on the player's own profile until the
// deadline, gone by itself after it.

export const SHORTS_CONTEST_URL = 'https://forms.gle/eo4QtJbqnALJkPEB6';

// Friday Nov 6 2026, 11:59 PM PST (UTC-8 once daylight time ends on Nov 1).
export const SHORTS_CONTEST_ENDS = Date.parse('2026-11-07T08:00:00Z');

export function shortsContestOn(now = Date.now()) {
  return now < SHORTS_CONTEST_ENDS;
}
