// Blink rounds, shared by web and mobile. Pure: no platform APIs.
// A round timer at or below BLINK_MAX_SECONDS is a blink round: the pano
// loads blurred, a 3-2-1 counts down in the center, the pano shows for the
// timer's seconds, then blurs again and the player guesses untimed.

export const BLINK_COUNTDOWN_STEP_MS = 650;
export const BLINK_COUNTDOWN_MS = 3 * BLINK_COUNTDOWN_STEP_MS;
export const BLINK_MAX_SECONDS = 5;

// Round-timer slider/stepper stops. The low end is the blink range.
export const ROUND_TIMER_STOPS = [0.3, 0.5, 1, 2, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
  130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300];

export function isBlinkTimer(timePerRound) {
  return timePerRound > 0 && timePerRound <= BLINK_MAX_SECONDS;
}

// Only singleplayer (classic and country/continent guesser) runs blink
// rounds. Everywhere else (onboarding, parties — the ws server rejects
// timePerRound < 10) a sub-10s value would be a real round clock that expires
// before anyone can answer, so those surfaces offer and run the regular stops
// only.
export const REGULAR_TIMER_STOPS = ROUND_TIMER_STOPS.filter((s) => s > BLINK_MAX_SECONDS);
export const MIN_REGULAR_TIMER_SECONDS = REGULAR_TIMER_STOPS[0];

export function timerStops(allowBlink) {
  return allowBlink ? ROUND_TIMER_STOPS : REGULAR_TIMER_STOPS;
}

// The round clock a surface actually runs for a stored timer value. The
// stored value is left alone (it is shared with singleplayer, where the
// player's blink choice must survive a trip through onboarding).
export function timerForMode(timePerRound, allowBlink) {
  return !allowBlink && isBlinkTimer(timePerRound) ? MIN_REGULAR_TIMER_SECONDS : timePerRound;
}

// Index of the stop nearest to `value`, so a value that is not a stop (a 45s
// party timer set on web, a stale stored value) still lands the slider or
// stepper in the right place instead of snapping to the first stop.
export function nearestTimerStopIndex(stops, value) {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - value) < Math.abs(stops[best] - value)) best = i;
  }
  return best;
}

// Whether the pano is hidden. Only the reveal window and the answer screen
// show it: covering 'loading' too is what stops the pano flashing sharp for
// the blur's ease-in when it first appears.
export function blinkCovers(blink) {
  return !!blink && blink.phase !== 'reveal' && blink.phase !== 'answer';
}

// elapsedMs: active (unpaused) time since the pano finished loading.
// count: the digit shown in the center during the countdown (3, 2, 1).
// nextChangeMs: time until the display next changes (null once blurred).
export function blinkPhaseAt(elapsedMs, revealMs) {
  if (elapsedMs < BLINK_COUNTDOWN_MS) {
    const rem = BLINK_COUNTDOWN_MS - elapsedMs;
    const count = Math.ceil(rem / BLINK_COUNTDOWN_STEP_MS);
    return { phase: 'countdown', count, nextChangeMs: rem - (count - 1) * BLINK_COUNTDOWN_STEP_MS };
  }
  const end = BLINK_COUNTDOWN_MS + revealMs;
  if (elapsedMs < end) return { phase: 'reveal', count: 0, nextChangeMs: end - elapsedMs };
  return { phase: 'blurred', count: 0, nextChangeMs: null };
}
