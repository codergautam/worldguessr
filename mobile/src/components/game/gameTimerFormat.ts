export interface GameTimerDisplay {
  value: string;
  unit: 'seconds' | 'clock';
}

/** Format the sub-minute countdown while preserving the final tenths phase. */
export function formatCountdown(value: number): string {
  return value >= 10 ? String(Math.ceil(value)) : value.toFixed(1);
}

/**
 * Keep the 60-second boundary in seconds notation. Only values strictly above
 * one minute become a clock, and clock notation never gets a seconds suffix.
 */
export function formatGameTimerDisplay(seconds: number): GameTimerDisplay {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;

  if (safeSeconds <= 60) {
    return { value: formatCountdown(safeSeconds), unit: 'seconds' };
  }

  const wholeSeconds = Math.ceil(safeSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return {
    value: `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`,
    unit: 'clock',
  };
}
