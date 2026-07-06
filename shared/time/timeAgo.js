// Relative "time ago" formatter shared by web (game history, friends list)
// and mobile (formatTimeAgo wrapper in src/components/account/shared.tsx).
// Takes the caller's translator because web (useTranslations hook) and mobile
// (plain t()) resolve strings differently. Pure — no platform APIs.
//
// Deliberately NEVER an exact date — coarse casual buckets all the way up
// ("3w ago", "a month ago", "a year ago"). Exact timestamps would leak
// precise activity times on public surfaces (friends list, game history).
export function timeAgo(text, date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return text('justNow');
  if (minutes < 60) return text('minutesAgo', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return text('anHourAgo');
  if (hours < 24) return text('hoursAgo', { hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return text('daysAgo', { days });
  if (days < 30) return text('weeksAgo', { weeks: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  if (months === 1) return text('aMonthAgo');
  if (months < 12) return text('monthsAgo', { months });
  const years = Math.floor(days / 365);
  return years <= 1 ? text('aYearAgo') : text('yearsAgo', { years });
}
