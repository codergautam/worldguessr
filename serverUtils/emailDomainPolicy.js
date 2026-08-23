import { Webhook } from 'discord-webhook-node';
import EmailDomainRule from '../models/EmailDomainRule.js';
import {
  emailDomainOf,
  isAllowedEmailDomain,
  isDisposableDomain,
  looksLikeSchoolDomain,
  looksLikeSchoolSubdomain,
  registrableDomain,
} from './emailDomains.js';

/**
 * THE decision for "may this email address create an account?" (existing
 * accounts never reach this: api/emailLogin.js looks the account up first).
 *
 * Order, cheapest first:
 *   1. static allow (consumer providers, school suffixes)      -> allow
 *   2. DB rules (EmailDomainRule): block / allow, matched on the exact host
 *      AND on its registrable domain, so `lausd.net` covers `students.lausd.net`
 *   3. throw-away mail (known list + name tokens)               -> refuse
 *   4. name heuristic: the REGISTRABLE domain contains a school word (k12,
 *      school, isd, academy, student, edu ...; owner ruling 2026-08-22)
 *                                                                -> allow
 *   5. the same words in a SUB-DOMAIN label, when the organisation's own
 *      domain is neutral: `student.hcbe.net` is a school, `hcbe.net` does not
 *      say so (owner ruling 2026-08-23)                          -> allow
 *   6. otherwise                                                 -> refuse
 * 4 and 5 are recorded as auto rules (source 'auto-token') and pinged to
 * Discord once per process, so the owner can review and flip any of them to
 * 'block' in the collection; 6 is pinged too so a real school can be allowed
 * by hand.
 * THE TWO HEURISTICS RECORD DIFFERENT KEYS ON PURPOSE. 4 owns the registrable
 * domain, so every sub-domain of a school district is covered at once. 5 owns
 * the EXACT HOST, because the parent said nothing about being a school:
 * allowing `student.hcbe.net` must not also allow `mail.hcbe.net`.
 * A few false positives are accepted by design: the audience is school kids
 * on district domains no list covers.
 *
 * The DB rules live behind a 5-minute in-memory cache per process.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { at: 0, allow: new Set(), block: new Set() };
let loading = null;

async function rules() {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (!loading) {
    loading = EmailDomainRule.find({}).select('domain status').lean()
      .then((rows) => {
        const allow = new Set();
        const block = new Set();
        for (const r of rows) (r.status === 'block' ? block : allow).add(r.domain);
        cache = { at: Date.now(), allow, block };
        return cache;
      })
      .catch((e) => {
        console.error('[emailDomainPolicy] rules load failed (using last cache):', e?.message || e);
        cache.at = Date.now() - CACHE_TTL_MS + 30 * 1000; // retry in 30s, not on every call
        return cache;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

// Fire-and-forget: remember an automatic decision so it is visible and
// reviewable, and the next call hits the cache instead of DNS.
function record(domain, status, source) {
  (status === 'block' ? cache.block : cache.allow).add(domain);
  EmailDomainRule.updateOne(
    { domain },
    { $setOnInsert: { domain, status, source, createdAt: new Date() }, $set: { updatedAt: new Date() }, $inc: { count: 1 } },
    { upsert: true },
  ).catch((e) => console.error('[emailDomainPolicy] record failed:', e?.message || e));
}

const notified = new Set();
/** One Discord line per (kind, domain) per process: "rejected" or "auto-allowed". */
export function notifyDomain(kind, domain, detail = '') {
  if (!domain) return;
  const key = `${kind}:${domain}`;
  if (notified.has(key)) return;
  notified.add(key);
  console.warn('[emailDomainPolicy] %s email domain: %s %s', kind, domain, detail ? `(${detail})` : '');
  if (!process.env.DISCORD_WEBHOOK) return;
  try {
    const hook = new Webhook(process.env.DISCORD_WEBHOOK);
    hook.setUsername('WorldGuessr');
    const text = kind === 'rejected'
      ? `Blocked email domain on signup: \`${domain}\`${detail ? ` (${detail})` : ''}. Allow it with an EmailDomainRule {status:'allow'} if it is a real school or provider.`
      : `Auto-allowed email domain on signup: \`${domain}\` (${detail}). Flip its EmailDomainRule to {status:'block'} if it is not a real school or provider.`;
    hook.send(text).catch(() => {});
  } catch (e) {
    // best effort only
  }
}

/**
 * @returns {Promise<{ allow: boolean, reason: string, domain: string|null }>}
 * reason: 'static' | 'db' | 'auto-token' | 'block' | 'disposable' | 'unknown' | 'invalid'
 */
export async function decideEmailDomain(email) {
  const domain = emailDomainOf(email);
  if (!domain) return { allow: false, reason: 'invalid', domain: null };
  if (isAllowedEmailDomain(email)) return { allow: true, reason: 'static', domain };

  const reg = registrableDomain(domain);
  const r = await rules();
  if (r.block.has(domain) || r.block.has(reg)) return { allow: false, reason: 'block', domain };
  if (r.allow.has(domain) || r.allow.has(reg)) return { allow: true, reason: 'db', domain };

  if (isDisposableDomain(domain) || isDisposableDomain(reg)) return { allow: false, reason: 'disposable', domain };

  if (looksLikeSchoolDomain(reg)) {
    record(reg, 'allow', 'auto-token');
    notifyDomain('auto-allowed', reg, 'looks like a school');
    return { allow: true, reason: 'auto-token', domain };
  }

  // Host-scoped, never the parent: see the header note on the two keys.
  if (looksLikeSchoolSubdomain(domain)) {
    record(domain, 'allow', 'auto-token');
    notifyDomain('auto-allowed', domain, 'school sub-domain');
    return { allow: true, reason: 'auto-token', domain };
  }

  return { allow: false, reason: 'unknown', domain };
}
