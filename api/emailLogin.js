import crypto from 'crypto';
import EmailLoginCode from '../models/EmailLoginCode.js';
import { normalizeEmail } from '../serverUtils/bannedIdentities.js';
import { isValidEmailSyntax } from '../serverUtils/emailDomains.js';
import { decideEmailDomain, notifyDomain } from '../serverUtils/emailDomainPolicy.js';
import { hashLoginCode } from '../serverUtils/loginCodeHash.js';
import { sendLoginCode, LOGIN_CODE_TTL_MINUTES } from '../serverUtils/sendLoginCode.js';
import { clientIp, createIpLimiter } from '../serverUtils/ipThrottle.js';
import { findUserByEmail } from '../serverUtils/findUserByEmail.js';
import { loginClientId } from '../serverUtils/loginSession.js';
import { acquireLoginLock } from '../serverUtils/loginLocks.js';

/**
 * Step 1 of the passwordless login: POST { email, tz? }.
 *
 * Issues a 6-digit code, mails it, and tells the client whether the address
 * already has an account ({ exists }) so a new player picks a username BEFORE
 * the code step. The code is sent right away either way: it arrives while the
 * new player is still choosing a name, so the code screen never waits.
 *
 * The domain policy (serverUtils/emailDomainPolicy.js: static lists, DB rules,
 * throw-away check, school-name heuristic on the registrable domain) applies
 * to NEW accounts only. An existing account, whatever its domain (Google
 * Workspace schools on .org, Apple relay, anything Google ever gave us),
 * always gets its code.
 *
 * Replays are idempotent: the same client SESSION (the clientId nonce,
 * serverUtils/loginSession.js) asking again inside the resend cooldown gets
 * the loginId of the code already mailed (a double tap, or the client's
 * fallback re-issue after its 4s primary abort in retryFetch.js), not a 429.
 * Nobody else does: sharing an IP is not sharing a session. Older codes stay
 * live until used or expired.
 *
 * Errors are locale KEYS the clients translate: invalidEmail,
 * emailDomainNotAllowed, tooManyRequests, emailSendFailed.
 */

const CODE_TTL_MS = LOGIN_CODE_TTL_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_S = 30;
const MAX_SENDS_PER_EMAIL_PER_HOUR = 5;
// Generous on purpose: a whole classroom shares one IP. The per-email limits
// above are what actually bound abuse and cost.
const limiter = createIpLimiter({ max: 40, windowMs: 10 * 60 * 1000 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const raw = req.body?.email;
  const email = normalizeEmail(raw);
  if (!email || !isValidEmailSyntax(email)) {
    return res.status(400).json({ error: 'invalidEmail' });
  }

  const ip = clientIp(req);
  if (limiter(ip)) {
    return res.status(429).json({ error: 'tooManyRequests', retryAfter: 60 });
  }
  const clientId = loginClientId(req.body?.clientId);

  // The account lookup comes first: it decides both the allowlist and `exists`.
  // Exact (indexed) first, then case-insensitive through the email_ci index,
  // so a legacy row stored with uppercase logs in instead of spawning a
  // duplicate account (serverUtils/findUserByEmail.js).
  const existing = await findUserByEmail(email, { select: '_id email', lean: true });

  if (!existing) {
    // New account: static lists, DB rules, throw-away check, then the
    // school-name heuristic on the registrable domain (serverUtils/emailDomainPolicy.js).
    const verdict = await decideEmailDomain(email);
    if (!verdict.allow) {
      notifyDomain('rejected', verdict.domain, verdict.reason);
      return res.status(400).json({ error: 'emailDomainNotAllowed' });
    }
  }

  const now = Date.now();
  const recent = await EmailLoginCode.find({ email, createdAt: { $gt: new Date(now - 60 * 60 * 1000) } })
    .sort({ createdAt: -1 })
    .select('loginId createdAt consumed expiresAt clientId')
    .lean();
  if (recent[0]) {
    const sinceLast = now - new Date(recent[0].createdAt).getTime();
    if (sinceLast < RESEND_COOLDOWN_S * 1000) {
      const remaining = Math.max(1, Math.ceil((RESEND_COOLDOWN_S * 1000 - sinceLast) / 1000));
      const live = recent[0];
      // Same client SESSION again inside the cooldown: a double tap, or the
      // client's fallback re-issue after its 4s primary abort (retryFetch.js)
      // whose first response was thrown away although the code WAS mailed.
      // Hand back the code that is already in the inbox instead of a 429 that
      // strands the player on the email step with nothing to type. Keyed on
      // the session nonce, never the IP: a classmate on the same NAT must not
      // receive (and be able to burn the attempts of) somebody else's code.
      if (!live.consumed && new Date(live.expiresAt).getTime() > now && clientId && live.clientId === clientId) {
        return res.status(200).json({ loginId: live.loginId, exists: !!existing, resendAfter: remaining, resent: false });
      }
      return res.status(429).json({ error: 'tooManyRequests', retryAfter: remaining });
    }
  }
  if (recent.length >= MAX_SENDS_PER_EMAIL_PER_HOUR) {
    const oldest = new Date(recent[recent.length - 1].createdAt).getTime();
    return res.status(429).json({
      error: 'tooManyRequests',
      retryAfter: Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000)),
    });
  }
  // The cooldown itself, taken ATOMICALLY (serverUtils/loginLocks.js): the
  // checks above are read-then-act, so N parallel requests for one address
  // would all pass them and mail N codes in one burst. Of N racers exactly
  // one holds send:<email> for the next RESEND_COOLDOWN_S; the rest get the
  // same 429 a sequential request would have got. Because sends are thereby
  // serialised 30s apart, the hourly count read above is never stale either.
  if (!(await acquireLoginLock(`send:${email}`, RESEND_COOLDOWN_S * 1000))) {
    return res.status(429).json({ error: 'tooManyRequests', retryAfter: RESEND_COOLDOWN_S });
  }

  // Earlier codes stay live until they expire or are used: a newer send never
  // kills the code already in the inbox (players type the first mail's code
  // after tapping Resend), a failed send cannot strand anyone, and a third
  // party requesting a code for this address cannot invalidate the owner's.
  // Each row is single-use with its own attempt cap; the hourly cap above
  // bounds how many can be live at once.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const loginId = crypto.randomBytes(16).toString('hex');
  await EmailLoginCode.create({
    loginId,
    email,
    matchEmail: existing?.email || email,
    codeHash: hashLoginCode(loginId, code),
    ip,
    clientId,
    expiresAt: new Date(now + CODE_TTL_MS),
  });

  const sent = await sendLoginCode({ to: email, code });
  if (!sent.ok) {
    // Dead, not deleted: the row keeps counting toward the cooldown and the
    // hourly cap, so a mail outage cannot be used to loop sends at an address.
    await EmailLoginCode.updateOne({ loginId }, { $set: { consumed: true } }).catch(() => {});
    return res.status(502).json({ error: 'emailSendFailed' });
  }

  return res.status(200).json({ loginId, exists: !!existing, resendAfter: RESEND_COOLDOWN_S });
}
