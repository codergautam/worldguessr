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
