export default function formatTime(seconds) {
  // seconds -> 1 minutes 30 seconds
  // if seconds is 90, return 1 minute 30 seconds
  // if seconds is 60, return 1 minute
  // if seconds is 61, return 1 minute 1 second
  // if seconds is 45, return 45 seconds
  // if seconds is 0, return 0 seconds

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''}` : ''} ${remainingSeconds > 0 ? `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`;
}