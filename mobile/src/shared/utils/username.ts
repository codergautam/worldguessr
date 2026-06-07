// Single source of truth for username validation, mirroring the server bound in
// api/setName.js (length 3-30, /^[a-zA-Z0-9_]+$/). Import `t` directly from
// '../locale' (NOT the './' barrel) to avoid a circular import — src/shared/index.ts
// re-exports both './utils' and './locale'.
import { t } from '../locale';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30; // mirror api/setName.js (3-30)
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

/** Returns a localized error string, or null if the username is valid. */
export function validateUsername(name: string): string | null {
  if (name.length < USERNAME_MIN_LENGTH || name.length > USERNAME_MAX_LENGTH) {
    return t(
      'usernameLengthError',
      { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH },
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
