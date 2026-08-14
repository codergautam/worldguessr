import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_POST_GUESS_SECONDS,
  RANKED_DUEL_POST_GUESS_SECONDS,
  postGuessSecondsFor,
} from '../ws/roundTimer.js';

describe('post-guess round timer', () => {
  it('gives ranked 1v1 opponents 15 seconds', () => {
    expect(postGuessSecondsFor({ public: true, duel: true })).toBe(15);
    expect(RANKED_DUEL_POST_GUESS_SECONDS).toBe(15);
  });

  it('keeps casual and team modes at 20 seconds', () => {
    expect(postGuessSecondsFor({ public: true, duel: false })).toBe(20);
    expect(postGuessSecondsFor({ public: false, duel: true })).toBe(20);
    expect(postGuessSecondsFor({ public: true, duel: true, teamDuel: true })).toBe(20);
    expect(postGuessSecondsFor({ public: true, duel: true, teamGame: true })).toBe(20);
    expect(DEFAULT_POST_GUESS_SECONDS).toBe(20);
  });

  it.each(['en', 'es', 'fr', 'de', 'ru'])('keeps the %s ranked toast dynamic', (locale) => {
    const path = new URL(`../public/locales/${locale}/common.json`, import.meta.url);
    const copy = JSON.parse(readFileSync(path, 'utf8'));
    expect(copy.opponentLocked).toContain('{{s}}');
    expect(copy.opponentLocked).not.toContain('20');
  });
});
