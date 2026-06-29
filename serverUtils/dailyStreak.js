import { daysBetween } from '../utils/dailyDate.js';

const GRACE_WINDOW_DAYS = 7;

export function pruneGraceDates(dates, today) {
  if (!Array.isArray(dates)) return [];
  return dates.filter(d => {
    const diff = daysBetween(d, today);
    return diff !== null && diff >= 0 && diff <= GRACE_WINDOW_DAYS;
  });
}

// Read-only check: would the stored streak still extend if the user played
// `today`? Mirrors the diff-based decision tree in applyStreak so a stale
// `dailyStreak` value can be zeroed before it's surfaced in any UI.
//
// Alive when:
//   diff 0 (played today) | diff 1 (yesterday) | diff 2 with grace available
// Dead otherwise. Pass { allowGrace: false } for guests.
export function isStreakAlive({ lastDate, graceDates, today }, opts = {}) {
  const allowGrace = opts.allowGrace !== false;
  if (!lastDate || !today) return false;
  const diff = daysBetween(lastDate, today);
  if (diff === null || diff < 0) return false;
  if (diff <= 1) return true;
  if (allowGrace && diff === 2 && pruneGraceDates(graceDates, today).length < 1) return true;
  return false;
}

export function effectiveStreak({ streak, lastDate, graceDates, today }, opts = {}) {
  if (!streak || streak <= 0) return 0;
  return isStreakAlive({ lastDate, graceDates, today }, opts) ? streak : 0;
}

// True when the user's streak is currently alive ONLY because of the grace
// window — i.e. they haven't played today, didn't play yesterday either, but
// the 2-day-gap-with-unused-grace branch in isStreakAlive is keeping the
// number on screen. Surfaces the "play today or you lose it" UX hint to the
// landing page / menu badge. Returns false for guests (allowGrace=false) or
// any case where the streak survives without leaning on grace.
export function isGraceDay({ streak, lastDate, graceDates, today }, opts = {}) {
  if (!streak || streak <= 0) return false;
  if (opts.allowGrace === false) return false;
  if (!lastDate || !today) return false;
  const diff = daysBetween(lastDate, today);
  if (diff !== 2) return false;
  return pruneGraceDates(graceDates, today).length < 1;
}

// Incremental streak update — called on every submit. Matches the original
// logic that used to live inline in api/dailyChallenge/submit.js.
//
// `opts.allowGrace` defaults true; pass false for guests (no grace).
export function applyStreak({ prevDate, currentStreak, graceDates, currentBest, today }, opts = {}) {
  const allowGrace = opts.allowGrace !== false;
  const graceBefore = allowGrace ? pruneGraceDates(graceDates, today) : [];
  let streak;
  let graceAfter = graceBefore;
  let graceUsedNow = false;

  if (!prevDate) {
    streak = 1;
  } else {
    const diff = daysBetween(prevDate, today);
    if (diff === null || diff <= 0) {
      streak = 1;
    } else if (diff === 1) {
      streak = (currentStreak || 0) + 1;
    } else if (allowGrace && diff === 2 && graceBefore.length < 1) {
      streak = (currentStreak || 0) + 1;
      graceAfter = [...graceBefore, today];
      graceUsedNow = true;
    } else {
      streak = 1;
    }
  }

  const best = Math.max(currentBest || 0, streak);
  return { streak, best, graceAfter, graceUsedNow };
}

function addDays(dateStr, n) {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + n * 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Used by the claim-guest-progress endpoint when merging a guest's history
// into a user's history. Walks the unioned history backwards from its most
// recent date, counting consecutive days, honoring the user's existing grace
// dates for 1-day gaps. Returns the streak tied to the most-recent date, and
// zeroes it out if the last play is more than 2 days behind today.
export function recomputeStreakFromHistory(history, today, userGraceDates = []) {
  const dateToEntry = new Map();
  for (const h of history || []) {
    if (!h?.date) continue;
    const existing = dateToEntry.get(h.date);
    if (!existing || (h.score || 0) > (existing.score || 0)) {
      dateToEntry.set(h.date, h);
    }
  }
  const uniqueDates = [...dateToEntry.keys()].sort();
  if (uniqueDates.length === 0) {
    return { streak: 0, lastDate: null, graceAfter: userGraceDates };
  }

  const lastDate = uniqueDates[uniqueDates.length - 1];
  const graceSet = new Set(userGraceDates);

  let count = 1;
  for (let i = uniqueDates.length - 2; i >= 0; i--) {
    const cur = uniqueDates[i + 1];
    const prev = uniqueDates[i];
    const gap = daysBetween(prev, cur);
    if (gap === 1) {
      count++;
    } else if (gap === 2 && graceSet.has(addDays(prev, 1))) {
      count++;
    } else {
      break;
    }
  }

  const daysSinceLast = daysBetween(lastDate, today);
  if (daysSinceLast === null || daysSinceLast > 2) {
    return { streak: 0, lastDate, graceAfter: userGraceDates };
  }
  return { streak: count, lastDate, graceAfter: userGraceDates };
}
