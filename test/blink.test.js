import { describe, expect, it } from 'vitest';
import {
  blinkPhaseAt, isBlinkTimer, blinkCovers, timerStops, timerForMode, nearestTimerStopIndex,
  ROUND_TIMER_STOPS, REGULAR_TIMER_STOPS, MIN_REGULAR_TIMER_SECONDS,
  BLINK_COUNTDOWN_MS, BLINK_COUNTDOWN_STEP_MS as STEP,
} from '../shared/game/blink.js';

describe('blink rounds', () => {
  it('a timer of 5s or less is a blink round', () => {
    expect(isBlinkTimer(0)).toBe(false);
    expect(isBlinkTimer(1)).toBe(true);
    expect(isBlinkTimer(5)).toBe(true);
    expect(isBlinkTimer(10)).toBe(false);
  });

  it('counts 3, 2, 1, reveals for the timer, then blurs', () => {
    expect(blinkPhaseAt(0, 2000)).toEqual({ phase: 'countdown', count: 3, nextChangeMs: STEP });
    expect(blinkPhaseAt(STEP + STEP / 2, 2000)).toEqual({ phase: 'countdown', count: 2, nextChangeMs: STEP / 2 });
    expect(blinkPhaseAt(BLINK_COUNTDOWN_MS - 1, 2000).count).toBe(1);
    expect(blinkPhaseAt(BLINK_COUNTDOWN_MS, 2000)).toEqual({ phase: 'reveal', count: 0, nextChangeMs: 2000 });
    expect(blinkPhaseAt(BLINK_COUNTDOWN_MS + 2000, 2000)).toEqual({ phase: 'blurred', count: 0, nextChangeMs: null });
  });
});

describe('blink pano cover', () => {
  it('covers the pano while it loads, so it never shows sharp before the countdown', () => {
    expect(blinkCovers({ phase: 'loading', count: 0 })).toBe(true);
  });

  it('covers the countdown and after the reveal; shows only the reveal and the answer', () => {
    expect(blinkCovers({ phase: 'countdown', count: 3 })).toBe(true);
    expect(blinkCovers({ phase: 'blurred', count: 0 })).toBe(true);
    expect(blinkCovers({ phase: 'reveal', count: 0 })).toBe(false);
    expect(blinkCovers({ phase: 'answer', count: 0 })).toBe(false);
  });

  it('never covers a non-blink round', () => {
    expect(blinkCovers(null)).toBe(false);
    expect(blinkCovers(undefined)).toBe(false);
  });
});

describe('round timer stops outside classic singleplayer', () => {
  it('the regular stops start at the ws server floor (timePerRound >= 10)', () => {
    expect(MIN_REGULAR_TIMER_SECONDS).toBe(10);
    expect(REGULAR_TIMER_STOPS.every((s) => s >= 10)).toBe(true);
    expect(REGULAR_TIMER_STOPS.some(isBlinkTimer)).toBe(false);
  });

  it('offers blink stops only where blink rounds run', () => {
    expect(timerStops(true)).toBe(ROUND_TIMER_STOPS);
    expect(timerStops(true)[0]).toBe(0.3);
    expect(timerStops(false)).toBe(REGULAR_TIMER_STOPS);
    expect(timerStops(false).some(isBlinkTimer)).toBe(false);
  });

  it('runs a stored blink value as the regular minimum where blink is off', () => {
    for (const s of [0.3, 0.5, 1, 2, 3, 5]) expect(timerForMode(s, false)).toBe(10);
    for (const s of [0.3, 2, 5]) expect(timerForMode(s, true)).toBe(s);
  });

  it('leaves regular values and "timer off" alone', () => {
    expect(timerForMode(0, false)).toBe(0);
    expect(timerForMode(10, false)).toBe(10);
    expect(timerForMode(45, false)).toBe(45);
    expect(timerForMode(300, true)).toBe(300);
  });

  it('places an off-stop value on the nearest stop, not the first', () => {
    expect(nearestTimerStopIndex(REGULAR_TIMER_STOPS, 45)).toBe(REGULAR_TIMER_STOPS.indexOf(40));
    expect(nearestTimerStopIndex(REGULAR_TIMER_STOPS, 15)).toBe(REGULAR_TIMER_STOPS.indexOf(10));
    expect(nearestTimerStopIndex(REGULAR_TIMER_STOPS, 2)).toBe(0);
    expect(nearestTimerStopIndex(ROUND_TIMER_STOPS, 2)).toBe(ROUND_TIMER_STOPS.indexOf(2));
    expect(nearestTimerStopIndex(ROUND_TIMER_STOPS, 9999)).toBe(ROUND_TIMER_STOPS.length - 1);
  });
});
