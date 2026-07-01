/**
 * Convert seconds to human-readable time format
 * @param seconds - Number of seconds
 * @returns Formatted time string (e.g., "1 minute 30 seconds")
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const minutesPart = minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''}` : '';
  const secondsPart = remainingSeconds > 0 ? `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : '';

  return `${minutesPart} ${secondsPart}`.trim();
}

/**
 * Convert milliseconds to human-readable time format
 * @param duration - Duration in milliseconds
 * @returns Formatted time string (e.g., "2h", "30m", "15s")
 */
export function msToTime(duration: number): string {
  const portions: string[] = [];

  const msInDay = 1000 * 60 * 60 * 24;
  const days = Math.trunc(duration / msInDay);
  if (days > 0) {
    portions.push(days + 'd');
    duration = duration - (days * msInDay);
  }

  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) {
    portions.push(hours + 'h');
    duration = duration - (hours * msInHour);
  }

  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) {
    portions.push(minutes + 'm');
    duration = duration - (minutes * msInMinute);
  }

  const seconds = Math.trunc(duration / 1000);
  if (seconds > 0) {
    portions.push(seconds + 's');
  }

  return portions[0] || '0s';
}

/**
 * Format a number with locale-aware separators
 * @param num - Number to format
 * @returns Formatted number string (e.g., "1,234,567")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Abbreviate a count to a compact K/M/B label so large counts stay short in
 * tight UI (community map stats, the bottom-right "X online" badge, …). Kept the
 * canonical home for the formatter the community-map tiles already used:
 *   494 → "494"   ·   1000 → "1K"   ·   3949 → "3.9K"   ·   3963 → "4K"
 *   38949 → "39K"   ·   1_500_000 → "1.5M"
 * Sub-1000 shows verbatim; above that it keeps one significant decimal while the
 * scaled value is < 10 ("3.9K" but "39K") and strips trailing zeros ("4K").
 */
export function formatCompact(n: number): string {
  if (!n || isNaN(n)) return '0';
  if (n < 1000) return n.toString();
  const units = ['K', 'M', 'B'];
  const tier = (Math.log10(n) / 3) | 0;
  const suffix = units[tier - 1];
  const scale = Math.pow(10, tier * 3);
  const scaled = n / scale;
  const precision = Math.max(0, 1 - Math.floor(Math.log10(scaled)));
  const s = scaled.toFixed(precision).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${s}${suffix}`;
}
