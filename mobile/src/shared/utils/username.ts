// Single source of truth for username validation, mirroring the server
// (serverUtils/usernameRules.js): ONE bound, 3-20, for signup and rename
// alike, /^[a-zA-Z0-9_]+$/. Import `t` directly from '../locale' (NOT the
// './' barrel) to avoid a circular import — src/shared/index.ts re-exports
// both './utils' and './locale'.
import { t } from '../locale';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
/** Fills the {{min}}/{{max}} of usernameLengthError / usernameRulesHint. */
export const USERNAME_LEN = { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH };

/** Returns a localized error string, or null if the username is valid. */
export function validateUsername(name: string): string | null {
  if (name.length < USERNAME_MIN_LENGTH || name.length > USERNAME_MAX_LENGTH) {
    return t(
      'usernameLengthError',
      USERNAME_LEN,
      `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`,
    );
  }
  if (!USERNAME_REGEX.test(name)) {
    return t(
      'usernameCharsError',
      undefined,
      'Username can only contain letters, numbers, and underscores',
    );
  }
  return null;
}
