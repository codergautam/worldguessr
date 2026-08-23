import crypto from 'crypto';
import User from '../models/User.js';
import EmailLoginCode from '../models/EmailLoginCode.js';
import { codeMatches, hashLoginCode } from '../serverUtils/loginCodeHash.js';
import { validateUsernameFormat, isUsernameTaken } from '../serverUtils/usernameRules.js';
import { findBannedIdentity, bannedIdentityMessage } from '../serverUtils/bannedIdentities.js';
import { buildAuthResponse, getExtendedUserData, checkTempBanExpiration } from './googleAuth.js';
import { findUserByEmail } from '../serverUtils/findUserByEmail.js';
import { loginClientId } from '../serverUtils/loginSession.js';
import { acquireLoginLock, releaseLoginLock } from '../serverUtils/loginLocks.js';
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import timezoneToCountry, { VALID_COUNTRY_CODES } from '../serverUtils/timezoneToCountry.js';
import UserStatsService from '../components/utils/userStatsService.js';
import { clientIp, createIpLimiter } from '../serverUtils/ipThrottle.js';

/**
 * Step 3 of the passwordless login: POST { loginId, code, username?, tz? }.
 *
 * Redeems the code api/emailLogin.js issued. An existing account (matched by
 * email) just logs in. A new account is created WITH the username the client
 * collected in step 2, so the post-login SetUsernameModal (web + mobile) never
 * shows for this path. The response is the exact googleAuth shape
 * (buildAuthResponse + getExtendedUserData) plus { isNewAccount }, so both
 * clients apply it with the code they already have.
 *
 * Ordering is the security: hash check -> username checks (a bad name returns
 * WITHOUT consuming, so the client can bounce back to the name step and
 * resubmit the same code) -> atomic consume -> create/load -> respond.
 *
 * Attempt accounting is ONE atomic update that only matches a WRONG code
 * (attempts < cap AND stored hash != presented hash), so N concurrent guesses
 * can never share an attempt and a correct code never spends one (a refused
 * username bounce resubmits the same code).
 *
 * Replays are idempotent: the same client SESSION (clientId nonce,
 * serverUtils/loginSession.js) presenting the right code again within
 * REPLAY_WINDOW_MS of the consume (a double tap, or the client's fallback
 * re-issue after its 4s primary abort in retryFetch.js, whose first response
 * was thrown away, even one that arrives before the slow primary finished)
 * gets the login result again. Nothing is consumed twice and a wrong code on
 * a consumed row never counts. A replay that finds no account yet (the first
 * verify is still creating it) answers codeUsed rather than creating twice;
 * account creation is single-flight per address (signup:<email> lock,
 * serverUtils/loginLocks.js) on top of an upsert, because an upsert alone is
 * not race-safe without a unique index and User.email cannot get one
 * retroactively. If the create fails, the code's claim is handed back so the
 * same code works on retry.
 *
 * Errors are locale KEYS: invalidCode, wrongCode (+attemptsLeft), codeExpired,
 * codeUsed, usernameRequired, usernameTaken, and the usernameRules keys.
 */

const MAX_ATTEMPTS = 5;
const REPLAY_WINDOW_MS = 60 * 1000;
const limiter = createIpLimiter({ max: 100, windowMs: 10 * 60 * 1000 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { loginId, code, username, tz } = req.body || {};
  if (typeof loginId !== 'string' || !/^[a-f0-9]{32}$/.test(loginId) ||
      typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalidCode' });
  }
  const ip = clientIp(req);
  if (limiter(ip)) {
    return res.status(429).json({ error: 'tooManyRequests' });
  }
  const clientId = loginClientId(req.body?.clientId);
  const expectedHash = hashLoginCode(loginId, code);

  const doc = await EmailLoginCode.findOne({ loginId }).lean();
  if (!doc || new Date(doc.expiresAt).getTime() <= Date.now()) {
    return res.status(410).json({ error: 'codeExpired' });
  }

  // A verify that already succeeded for THIS client session, with the right
  // code, inside the window: serve it again. Anyone else: codeUsed.
  const replayOf = (row) => !!(clientId && row?.consumed && row.consumedAt && row.clientId === clientId
    && Date.now() - new Date(row.consumedAt).getTime() < REPLAY_WINDOW_MS
    && codeMatches(loginId, code, row.codeHash));
  const lookup = () => findUserByEmail(doc.matchEmail || doc.email);

  let replay = false;
  if (doc.consumed) {
    if (!replayOf(doc)) return res.status(409).json({ error: 'codeUsed' });
    replay = true;
  } else {
    // Count a WRONG guess atomically: the update matches only while the cap
    // is not spent AND the stored hash differs from the presented one, so
    // concurrent guesses each pay for themselves and a right code pays nothing.
    const wrong = await EmailLoginCode.findOneAndUpdate(
      { _id: doc._id, consumed: false, attempts: { $lt: MAX_ATTEMPTS }, codeHash: { $ne: expectedHash } },
      { $inc: { attempts: 1 } },
      { new: true },
    ).select('attempts').lean();
    if (wrong) {
      const left = MAX_ATTEMPTS - wrong.attempts;
      if (left <= 0) return res.status(410).json({ error: 'codeExpired' });
      return res.status(400).json({ error: 'wrongCode', attemptsLeft: left });
    }
    // Not counted: the code is right, or a racing verify consumed / capped the
    // row since the read above. Re-read and decide on the current row.
    const again = await EmailLoginCode.findById(doc._id).lean();
    if (!again) return res.status(410).json({ error: 'codeExpired' });
    if (again.consumed) {
      if (!replayOf(again)) return res.status(409).json({ error: 'codeUsed' });
      replay = true;
    } else if (again.attempts >= MAX_ATTEMPTS) {
      return res.status(410).json({ error: 'codeExpired' });
    } else if (!codeMatches(loginId, code, again.codeHash)) {
      // Unreachable by construction (the update above would have matched);
      // kept so a malformed stored hash can never read as a right code.
      return res.status(400).json({ error: 'wrongCode', attemptsLeft: MAX_ATTEMPTS - again.attempts });
    }
  }

  // Full document on purpose: no .select() (the AUTH_SELECT trap in googleAuth)
  // and no cache, exactly like the websocket's validateSecret. matchEmail is
  // the spelling emailLogin actually found the account under (legacy rows can
  // be mixed case), so a send that matched can never verify into a duplicate;
  // findUserByEmail adds the case-insensitive fallback for everything else.
  let user = await lookup();
  let isNewAccount = !user;

  if (replay && isNewAccount) {
    // The first verify is still creating the account: nothing to hand back
    // yet, and creating it here again would be the duplicate we refuse.
    return res.status(409).json({ error: 'codeUsed' });
  }

  if (isNewAccount) {
    // Every refusal in this block returns BEFORE the consume below, so the
    // code stays live and the client only has to fix the name.
    if (typeof username !== 'string' || !username) {
      return res.status(400).json({ error: 'usernameRequired' });
    }
    const invalid = validateUsernameFormat(username);
    if (invalid) {
      return res.status(400).json({ error: invalid.key, message: invalid.message });
    }
    if (await isUsernameTaken(username)) {
      return res.status(400).json({ error: 'usernameTaken' });
    }
    // Refuse re-registration of a blocklisted (perm-banned/deleted) identity,
    // same shape as googleAuth's blockIfBannedIdentity.
    const blocked = await findBannedIdentity({ email: doc.email });
    if (blocked) {
      return res.status(403).json({ error: bannedIdentityMessage(blocked), banned: true, banType: 'permanent' });
    }
  }

  if (!replay) {
    // Single use, atomically: the second of two racing verifies loses here.
    const claimed = await EmailLoginCode.findOneAndUpdate(
      { _id: doc._id, consumed: false },
      { $set: { consumed: true, consumedAt: new Date() } },
    );
    if (!claimed) {
      // Lost to a racing verify. If that was this session's own earlier
      // request (the fallback re-issue arriving while the slow primary was
      // finishing), serve its result; anyone else gets codeUsed.
      const again = await EmailLoginCode.findById(doc._id).lean();
      if (!replayOf(again)) return res.status(409).json({ error: 'codeUsed' });
      replay = true;
      user = await lookup();
      isNewAccount = !user;
      if (isNewAccount) return res.status(409).json({ error: 'codeUsed' });
    }
  }

  if (isNewAccount) {
    // Single-flight per address: two live codes for the same new address
    // verified at the same instant must not both insert (an upsert without a
    // unique index is not race-safe). The loser answers codeUsed; its player
    // resends and the next verify finds the account and logs in.
    const signupKey = `signup:${doc.email}`;
    if (!(await acquireLoginLock(signupKey, 15 * 1000))) {
      return res.status(409).json({ error: 'codeUsed' });
    }
    // Create-or-find in ONE upsert on the address. `updatedExisting` tells us
    // whether we created it or somebody else just did (a Google sign-in a
    // moment ago); the latter is a login. `email` comes from the filter on
    // insert (Mongo seeds the new document from the equality clauses), so it
    // is not repeated in $setOnInsert.
    const fields = { username, secret: crypto.randomUUID() };
    // Country flag from the client's real IANA tz, same rule as googleAuth.
    const cc = typeof tz === 'string' && tz ? timezoneToCountry(tz) : null;
    if (cc && VALID_COUNTRY_CODES.includes(cc)) {
      fields.countryCode = cc;
      fields.timeZone = tz;
    }
    let r;
    try {
      r = await User.findOneAndUpdate(
        { email: doc.email },
        { $setOnInsert: fields },
        { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true },
      );
      if (!r?.value?._id) throw new Error('emailVerify: upsert returned no document');
    } catch (e) {
      // The account was not created: hand the code's claim back so the same
      // code works on retry instead of being burnt by a DB hiccup.
      if (!replay) {
        await EmailLoginCode.updateOne({ _id: doc._id }, { $set: { consumed: false, consumedAt: null } }).catch(() => {});
      }
      await releaseLoginLock(signupKey);
      throw e;
    }
    user = await User.findById(r.value._id);
    await releaseLoginLock(signupKey);
    if (r.lastErrorObject?.updatedExisting) {
      isNewAccount = false;
    } else {
      // Same first-stats row api/setName.js creates on a first name set.
      try {
        await UserStatsService.recordGameStats(user._id, null, { triggerEvent: 'account_created' });
      } catch (error) {
        console.error('Error creating initial user stats:', error);
      }
    }
  }

  if (!isNewAccount) {
    // Same housekeeping as every googleAuth existing-account branch: an
    // expired temporary ban is lifted (and a legacy banned row migrated)
    // BEFORE the response is built, and a missing country flag is filled
    // from the stored time zone. Returns a plain object; buildAuthResponse
    // and getExtendedUserData take either.
    user = await checkTempBanExpiration(user);
    if (user.countryCode == null && user.timeZone) {
      const cc = timezoneToCountry(user.timeZone);
      if (cc) {
        await User.findByIdAndUpdate(user._id, { countryCode: cc });
        user.countryCode = cc;
        syncedClearCache(`userAuth_${user.secret}`);
      }
    }
  }

  const timings = {};
  const extended = await getExtendedUserData(user, timings);
  return res.status(200).json({ ...buildAuthResponse(user, extended), isNewAccount });
}
