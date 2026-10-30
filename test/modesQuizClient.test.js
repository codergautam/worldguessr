// components/modes/quizClient.js: the pure client glue for the quiz modes
// (mode lookup, landing paths, the round record fields, flag URLs).
import { describe, it, expect } from 'vitest';
import {
  quizOf,
  QUIZ_PATHS,
  quizModeFromPath,
  quizRoundFields,
  flagSrc,
} from '../components/modes/quizClient.js';

describe('quizOf', () => {
  it('is null for classic and missing modes', () => {
    expect(quizOf('classic')).toBeNull();
    expect(quizOf(undefined)).toBeNull();
    expect(quizOf(null)).toBeNull();
  });

  it('returns the spec for a quiz mode', () => {
    expect(quizOf('flags')).toMatchObject({ id: 'flags', input: 'map' });
  });
});

describe('landing paths', () => {
  it('maps each quiz to its root path', () => {
    expect(QUIZ_PATHS.flags).toBe('/flags');
  });

  it('reads the mode back from a path', () => {
    expect(quizModeFromPath('/flags')).toBe('flags');
    expect(quizModeFromPath('/flags/')).toBe('flags');
  });

  it('ignores localized and unrelated paths', () => {
    expect(quizModeFromPath('/es/flags')).toBeNull();
    expect(quizModeFromPath('/daily')).toBeNull();
    expect(quizModeFromPath(undefined)).toBeNull();
  });
});

describe('quizRoundFields', () => {
  it('adds nothing to a classic round', () => {
    expect(quizRoundFields({ lat: 1, long: 2, panoId: 'p' })).toEqual({});
    expect(quizRoundFields({ lat: 1, long: 2, mode: 'classic' }, { choice: 'fr' })).toEqual({});
  });

  it('keeps mode and country and drops undefined keys on a flags round', () => {
    const out = quizRoundFields(
      { lat: 46, long: 2, mode: 'flags', country: 'FR' },
      { guessCountry: 'BE', choice: undefined },
    );
    expect(out).toEqual({ mode: 'flags', country: 'FR', guessCountry: 'BE' });
    for (const k of ['lang', 'text', 'choices', 'spokenIn', 'label', 'image', 'choice']) {
      expect(Object.prototype.hasOwnProperty.call(out, k)).toBe(false);
    }
  });
});

describe('flagSrc', () => {
  it('builds a flagcdn URL with a lower-case code', () => {
    expect(flagSrc('fr', 40)).toBe('https://flagcdn.com/w40/fr.png');
    expect(flagSrc('FR', 40)).toBe('https://flagcdn.com/w40/fr.png');
  });
});
