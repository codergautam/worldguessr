import { describe, expect, it } from 'vitest';
import { formatGameTimerDisplay } from '../mobile/src/components/game/gameTimerFormat.ts';

describe('mobile game timer formatting', () => {
  it('keeps exactly one minute in seconds notation', () => {
    expect(formatGameTimerDisplay(60)).toEqual({ value: '60', unit: 'seconds' });
  });

  it('switches to suffix-free clock notation only above one minute', () => {
    expect(formatGameTimerDisplay(61)).toEqual({ value: '1:01', unit: 'clock' });
    expect(formatGameTimerDisplay(62)).toEqual({ value: '1:02', unit: 'clock' });
    expect(formatGameTimerDisplay(120)).toEqual({ value: '2:00', unit: 'clock' });
  });

  it('rounds fractional time up consistently with the countdown', () => {
    expect(formatGameTimerDisplay(60.1)).toEqual({ value: '1:01', unit: 'clock' });
    expect(formatGameTimerDisplay(9.9)).toEqual({ value: '9.9', unit: 'seconds' });
  });
});
