import { api } from '../../services/api';
import { USERNAME_LEN, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_REGEX } from '../../shared/utils/username';

/**
 * The username rules and the live availability verdict, shared by the two
 * places a player names themselves: AccountSelectSheet (email + code signup)
 * and SetUsernameModal (the first name after a Google / Apple sign-in).
 * Web parity: components/auth/loginApi.js. ONE copy, so the two surfaces can
 * never drift from each other or from serverUtils/usernameRules.js.
 */

export type Avail = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid' | 'unknown'; // unknown = no verdict; may continue

/** Fills the {{min}}/{{max}} of usernameLengthError / usernameRulesHint. */
export const LEN = USERNAME_LEN;

export interface Verdict {
  avail: Avail;
  key: string | null;
  vars?: Record<string, number>;
}

/**
 * What the client can say about a name AT ONCE, before any request, or null =
 * "looks fine so far, ask the server". A bad character is worth saying
 * immediately; a name that is simply still being typed (under 3 chars) is not:
 * no glyph, no red, no nag.
 */
export function usernameSyncVerdict(name: string): Verdict | null {
  if (!name) return { avail: 'idle', key: null };
  if (!USERNAME_REGEX.test(name)) return { avail: 'invalid', key: 'usernameCharsError' };
  if (name.length < USERNAME_MIN_LENGTH) return { avail: 'idle', key: null };
  if (name.length > USERNAME_MAX_LENGTH) return { avail: 'invalid', key: 'usernameLengthError', vars: LEN };
  return null;
}

/**
 * The server's verdict on a name that passed the sync rules
 * (api/checkUsername.js). Never throws.
 *   'ok'      free
 *   'taken' | 'invalid'  refused, `key` is the locale key to show
 *   'unknown' no verdict (rate limited, server down, offline): no glyph, no
 *             sentence, and the caller lets Continue through, because the
 *             server re-checks the name on submit and answers with the real
 *             key. The player is never walled here.
 */
export async function checkUsernameAvailability(name: string): Promise<Verdict> {
  try {
    const data = await api.checkUsername(name);
    if (data.available) return { avail: 'ok', key: null };
    return { avail: data.error === 'usernameTaken' ? 'taken' : 'invalid', key: data.error || 'usernameTaken', vars: LEN };
  } catch {
    return { avail: 'unknown', key: null };
  }
}
