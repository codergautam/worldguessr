import User, { EMAIL_COLLATION } from '../models/User.js';

/**
 * THE email -> account lookup for the email-code login (api/emailLogin.js,
 * api/emailVerify.js).
 *
 * Two steps, cheapest first:
 *   1. exact match on the indexed `email` field (every row written since the
 *      Google/Apple sign-ins began is lowercase, and emailLogin normalizes the
 *      address it stores, so this is the hit in practice);
 *   2. case-insensitive match through the `email_ci` collation index
 *      (models/User.js), for the legacy rows stored with uppercase. Without
 *      it a player typing bob@gmail.com for a row saved as Bob@Gmail.com would
 *      be told the account does not exist and a DUPLICATE would be created,
 *      with the old row's ELO/stamps/purchases orphaned (the email index is
 *      not unique).
 *
 * `select` / `lean` are passed through so emailLogin can stay light while
 * emailVerify keeps the full document (googleAuth's AUTH_SELECT trap).
 */
function build(query, { select, lean }) {
  let q = User.findOne(query);
  if (select) q = q.select(select);
  if (lean) q = q.lean();
  return q;
}

export async function findUserByEmail(email, { select = null, lean = false } = {}) {
  if (typeof email !== 'string' || !email) return null;
  const exact = await build({ email }, { select, lean });
  if (exact) return exact;
  return build({ email }, { select, lean }).collation(EMAIL_COLLATION);
}
