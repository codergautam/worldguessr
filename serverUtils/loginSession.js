/**
 * The client-side session nonce of the email-code login.
 *
 * The web modal (components/auth/LoginModal.js) and the mobile sheet
 * (mobile/src/components/auth/AccountSelectSheet.tsx) mint one random id per
 * open and send it with BOTH /api/emailLogin and /api/emailVerify. The server
 * stores it on the code row and uses it for exactly one thing: recognising a
 * REPLAY from the same session (a double tap, or the client's fallback
 * re-issue after its 4s primary abort in components/utils/retryFetch.js) so it
 * can hand back the code already mailed / the login already completed instead
 * of a 429 / 409 that strands the player.
 *
 * Why a nonce and not the IP: a classmate on the same NAT (or anyone writing
 * X-Forwarded-For) shares the IP, and handing them another session's loginId
 * lets them burn its five attempts. The nonce is never a capability on its own
 * (the emailed code still is), so it does not need a CSPRNG; it only needs to
 * be unguessable enough that nobody else's request matches it.
 *
 * Absent or malformed = no idempotency for that request (429 / 409 as before).
 */
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function loginClientId(raw) {
  return typeof raw === 'string' && CLIENT_ID.test(raw) ? raw : null;
}
