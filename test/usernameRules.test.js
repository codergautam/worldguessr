import { describe, it, expect } from 'vitest';
import { validateUsernameFormat, USERNAME_MIN, USERNAME_MAX } from '../serverUtils/usernameRules.js';
import { FORUM_STABLE_MESSAGE, FORUM_RESERVED_MESSAGE } from '../serverUtils/forumUsername.js';

// The `message` strings are what api/setName.js and api/submitNameChange.js
// returned before the chain was extracted. Clients render them verbatim, so
// they are asserted byte for byte.
describe('validateUsernameFormat', () => {
  it('accepts ordinary names', () => {
    for (const n of ['Gautam', 'geo_kid_42', 'abc', 'x'.repeat(20)]) {
      expect(validateUsernameFormat(n), n).toBeNull();
    }
  });

  // ONE bound, 3-20, for every surface that chooses a name: signup
  // (checkUsername / emailVerify) and rename (setName / submitNameChange).
  it('length', () => {
    expect(USERNAME_MIN).toBe(3);
    expect(USERNAME_MAX).toBe(20);
    expect(validateUsernameFormat('ab')).toEqual({
      key: 'usernameLengthError',
      message: 'Username must be between 3 and 20 characters',
    });
    expect(validateUsernameFormat('x'.repeat(21)).key).toBe('usernameLengthError');
    expect(validateUsernameFormat(undefined).key).toBe('usernameLengthError');
    expect(validateUsernameFormat('').key).toBe('usernameLengthError');
  });

  it('characters', () => {
    expect(validateUsernameFormat('bad name!')).toEqual({
      key: 'usernameCharsError',
      message: 'Username must contain only letters, numbers, and underscores',
    });
  });

  it('forum-unstable underscores', () => {
    expect(validateUsernameFormat('_lead')).toEqual({ key: 'usernameForumUnstable', message: FORUM_STABLE_MESSAGE });
    expect(validateUsernameFormat('trail_').key).toBe('usernameForumUnstable');
    expect(validateUsernameFormat('dou__ble').key).toBe('usernameForumUnstable');
  });

  it('forum-reserved names', () => {
    expect(validateUsernameFormat('Admin')).toEqual({ key: 'usernameReserved', message: FORUM_RESERVED_MESSAGE });
  });

  it('profanity', () => {
    expect(validateUsernameFormat('shit')).toEqual({ key: 'usernameProfane', message: 'Inappropriate content' });
  });

  it('does not trim (the callers decide)', () => {
    expect(validateUsernameFormat(' abc').key).toBe('usernameCharsError');
  });
});
