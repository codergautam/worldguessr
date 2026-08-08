import { test, expect } from 'vitest';
import { expectedScore } from '../components/utils/eloSystem.js';

// Harness smoke test only. This proves vitest resolves plain ESM out of
// components/utils/ with no transform step; the real rating suites live
// alongside this file and are owned elsewhere.
test('vitest resolves ESM from components/utils', () => {
  expect(expectedScore(800, 800)).toBe(0.5);
});
