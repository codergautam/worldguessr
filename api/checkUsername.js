import { validateUsernameFormat, isUsernameTaken } from '../serverUtils/usernameRules.js';
import { clientIp, createIpLimiter } from '../serverUtils/ipThrottle.js';

/**
 * Live "is this name free?" for the signup username step: POST { username }.
 * Advisory only: api/emailVerify.js re-runs the same rules when the account is
 * actually created, so a race here just surfaces as usernameTaken on submit.
 * Responds { available: true } or { available: false, error: <locale key> }.
 * A 429 carries no `available` at all: the clients treat it as "unknown"
 * (no verdict glyph), never as a refusal of the name.
 *
 * The rules are serverUtils/usernameRules.js (3-20, one bound everywhere).
 */
// Debounced client-side (one request per typing pause). 1,000/min per IP
// (owner ruling 2026-08-22): a whole school behind one NAT must not trip it
// mid-signup, and the query is one indexed findOne.
const limiter = createIpLimiter({ max: 1000, windowMs: 60 * 1000 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { username } = req.body || {};
  if (typeof username !== 'string') {
    return res.status(400).json({ available: false, error: 'usernameRequired' });
  }
  if (limiter(clientIp(req))) {
    return res.status(429).json({ error: 'tooManyRequests' });
  }
  const invalid = validateUsernameFormat(username);
  if (invalid) {
    return res.status(200).json({ available: false, error: invalid.key });
  }
  if (await isUsernameTaken(username)) {
    return res.status(200).json({ available: false, error: 'usernameTaken' });
  }
  return res.status(200).json({ available: true });
}
