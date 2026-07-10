import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceOnboardingState } from '../components/utils/onboardingState.js';

function activeOnboarding(overrides = {}) {
  return {
    round: 1,
    mode: 'classic',
    points: 1200,
    startTime: 1000,
    locations: [{ id: 1 }, { id: 2 }, { id: 3 }],
    gameResults: [{ points: 1200 }],
    ...overrides,
  };
}

test('advances a live tutorial without dropping accumulated results', () => {
  const previous = activeOnboarding();
  const next = advanceOnboardingState(previous, 2000);

  assert.equal(next.round, 2);
  assert.equal(next.completed, undefined);
  assert.deepEqual(next.gameResults, previous.gameResults);
  assert.notStrictEqual(next, previous);
});

test('completes the final round with its full history', () => {
  const results = [{ points: 1000 }, { points: 0 }, { points: 1000 }];
  const previous = activeOnboarding({ round: 3, gameResults: results });
  const next = advanceOnboardingState(previous, 4500);

  assert.equal(next.completed, true);
  assert.equal(next.round, 3);
  assert.equal(next.mode, 'classic');
  assert.equal(next.timeTaken, 3500);
  assert.deepEqual(next.locations, results);
  assert.deepEqual(next.gameResults, results);
});

test('returns completed state unchanged so racing advances cannot erase history', () => {
  const completed = advanceOnboardingState(
    activeOnboarding({ round: 3, gameResults: [{ points: 5000 }] }),
    3000,
  );
  const raced = advanceOnboardingState(completed, 4000);

  assert.strictEqual(raced, completed);
  assert.deepEqual(raced.locations, [{ points: 5000 }]);
  assert.deepEqual(raced.gameResults, [{ points: 5000 }]);
});
