// Period keys for the stamps economy. Pure — no imports, no env, no I/O.
//
// Every periodic payout (daily ladder, weekly quests) is idempotent because it
// is keyed by one of these strings: the same user + the same reason + the same
// period key is a duplicate, and the writer rejects it. So these functions are
// the de-duplication primitive, which is why they are UTC-only. A local-time
// key would hand a player in UTC+13 a second "today" every day.

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Midnight UTC of the day containing ts, as a Date. */
export function startOfUtcDay(ts = Date.now()) {
  const d = new Date(ts);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Midnight UTC of the Monday that opens the ISO week containing ts, as a Date. */
export function startOfUtcWeek(ts = Date.now()) {
  const d = startOfUtcDay(ts);
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d;
}

/** 'YYYY-MM-DD' in UTC. */
export function dayKeyUTC(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * ISO-8601 week key, 'YYYY-Www', Monday-anchored and zero-padded.
 *
 * The year in the key is the ISO week-numbering year, NOT the calendar year of
 * ts: 2027-01-01 is a Friday and belongs to 2026-W53. Deriving the year from
 * getUTCFullYear() instead would collide two different weeks onto one key and
 * silently swallow a payout.
 */
export function weekKeyUTC(ts = Date.now()) {
  // Shift to the Thursday of this week: the ISO year is by definition the
  // calendar year that Thursday falls in.
  const thursday = startOfUtcDay(ts);
  const dayNum = (thursday.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  thursday.setUTCDate(thursday.getUTCDate() - dayNum + 3);

  const isoYear = thursday.getUTCFullYear();

  // Week 1 is the week containing Jan 4, i.e. the week whose Thursday is the
  // first Thursday of the ISO year.
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${pad2(week)}`;
}
