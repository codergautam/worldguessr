import { fetchWithFallback } from '@/components/utils/retryFetch';

/**
 * The client half of the account endpoints, shared by the two places that
 * claim a username: components/auth/LoginModal.js (email + code signup) and
 * components/setUsernameModal.js (the first name after a Google / Apple
 * sign-in). ONE copy of the rules, the transport and the live-availability
 * verdicts, so the two surfaces can never drift from each other or from
 * serverUtils/usernameRules.js.
 */

// Mirrors serverUtils/usernameRules.js: ONE bound for every surface (3-20,
// letters/digits/underscore; owner ruling 2026-08-23). The browser says the
// obvious things at once; the server stays the authority. LEN_VARS fills the
// {{min}}/{{max}} of usernameLengthError / usernameRulesHint (harmless on any
// other key).
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const LEN_VARS = { min: USERNAME_MIN, max: USERNAME_MAX };

export function authUrls(path) {
  const c = (typeof window !== 'undefined' && window.cConfig) || {};
  const primary = (c.authUrl || c.apiUrl || '') + path;
  const fallback = (c.apiUrl || '') + path;
  return [primary, fallback];
}

// Never throws and never hangs: a network failure (both hosts unreachable,
// Wi-Fi gone) or a half-open socket comes back as
// { ok:false, status:0, data:{ error:'errorNetworkRequest' } }, so every
// caller's busy flag is released and the player reads a sentence instead of
// staring at a dead modal. fetchWithFallback times out only its PRIMARY leg
// (4s); the fallback is a bare fetch, so the deadline here covers the whole
// call (the primary overrides the signal for its own leg, the fallback keeps
// it).
const POST_DEADLINE_MS = 20000;
export async function postJson(path, body, retryKey) {
  const [primary, fallback] = authUrls(path);
  const ctl = new AbortController();
  const deadline = setTimeout(() => ctl.abort(), POST_DEADLINE_MS);
  try {
    const res = await fetchWithFallback(
      primary,
      fallback,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal },
      retryKey,
    );
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'errorNetworkRequest' } };
  } finally {
    clearTimeout(deadline);
  }
}

// One nonce per open of the login modal, sent with every emailLogin /
// emailVerify call (serverUtils/loginSession.js): it lets the server
// recognise OUR retries (double tap, the fallback re-issue after the 4s
// primary abort) and hand back the code / login already issued instead of a
// 429 / 409. Not a secret, only ours; the emailed code stays the capability.
export function newClientId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function deviceTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch (e) { return undefined; }
}

/**
 * What the browser can say about a name AT ONCE, before any request:
 *   { avail, key } to apply, or null = "looks fine so far, ask the server".
 * A bad character is worth saying immediately; a name that is simply still
 * being typed (under 3 chars) is not: no glyph, no red, no nag.
 * avail: 'idle' | 'invalid' (the callers add 'checking' | 'ok' | 'taken' | 'unknown').
 */
export function usernameSyncVerdict(name) {
  if (!name) return { avail: 'idle', key: null };
  if (!USERNAME_REGEX.test(name)) return { avail: 'invalid', key: 'usernameCharsError' };
  if (name.length < USERNAME_MIN) return { avail: 'idle', key: null };
  if (name.length > USERNAME_MAX) return { avail: 'invalid', key: 'usernameLengthError' };
  return null;
}

/**
 * The server's verdict on a name that passed the sync rules
 * (api/checkUsername.js). Never throws.
 *   'ok'      free
 *   'taken' | 'invalid'  refused, `key` is the locale key to show
 *   'unknown' no verdict (rate limited, server down, offline, a host without
 *             the route): no glyph, no sentence, and the caller lets Continue
 *             through, because the server re-checks the name on submit and
 *             answers with the real key. The player is never walled here.
 */
export async function checkUsernameAvailability(name) {
  const { ok, status, data } = await postJson('/api/checkUsername', { username: name }, 'checkUsername');
  if (data.available) return { avail: 'ok', key: null };
  if (!ok && status !== 400) return { avail: 'unknown', key: null };
  return { avail: data.error === 'usernameTaken' ? 'taken' : 'invalid', key: data.error || 'usernameTaken' };
}
