/**
 * Email-domain rules for the email-code signup: the PURE half (no imports, so
 * the unit tests load it without Mongo). The DB-backed list and the final
 * decision live in serverUtils/emailDomainPolicy.js.
 *
 * Policy (owner rulings, 2026-08-22): consumer providers and school domains
 * are allowed; known throw-away mail is refused; a registrable domain whose
 * name reads like a school is allowed (the audience is school kids on district
 * domains no list is ever complete for, and a few false positives are
 * acceptable); everything else is refused. Every auto decision is recorded so
 * the owner can review it.
 */

/**
 * The ONE address a mailbox answers to, for account identity. Mail-provider
 * aliasing had become a shared "cheat code to infinite alts": every
 * `bob+alt42@gmail.com` (and every re-dotting of `bob@gmail.com`) delivered
 * to one real inbox while looking like a brand-new address to the account
 * lookup, so one mailbox could mint unlimited accounts AND sidestep the
 * per-address send caps.
 *
 *  - lowercase + trim (matches normalizeEmail);
 *  - `+tag` stripped from the local part EVERYWHERE, not just Gmail: Google
 *    Workspace and Microsoft 365 both honour plus-addressing, and school
 *    domains (this feature's audience) are overwhelmingly one of the two. A
 *    genuine address containing a literal `+` still RECEIVES its code (mail
 *    goes to the typed address) — only its account identity is the stripped
 *    form;
 *  - dots collapsed in the local part for Gmail ONLY (dots are significant
 *    everywhere else per RFC), with googlemail.com folded into gmail.com
 *    (same mailboxes, Google's own alias).
 *
 * Pure and total: bad input comes back lowercased rather than throwing, and
 * a canonicalisation that would EMPTY the local part (an all-dots Gmail
 * local) falls back to the lowercased original instead of inventing
 * `@gmail.com`. Callers decide validity separately (isValidEmailSyntax).
 */
export function canonicalEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return null;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus); // > 0: a leading '+' is kept, never an empty local
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  if (!local) return e;
  return `${local}@${domain}`;
}

const CONSUMER_DOMAINS = new Set([
  // Google
  'gmail.com', 'googlemail.com',
  // Microsoft
  'outlook.com', 'outlook.de', 'outlook.fr', 'outlook.es', 'outlook.it', 'outlook.com.br', 'outlook.co.uk',
  'hotmail.com', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it', 'hotmail.co.uk',
  'live.com', 'live.co.uk', 'live.com.au', 'live.nl', 'msn.com',
  // Yahoo
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.jp', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.com.br',
  'yahoo.ca', 'yahoo.com.au', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  // Apple (privaterelay = Hide My Email; those players already hold accounts here)
  'icloud.com', 'me.com', 'mac.com', 'privaterelay.appleid.com',
  // Other global / regional providers
  'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'web.de', 'mail.com', 't-online.de', 'posteo.de', 'mailbox.org',
  'zoho.com', 'zohomail.com', 'yandex.com', 'yandex.ru', 'ya.ru',
  'qq.com', '163.com', '126.com', 'foxmail.com', 'naver.com', 'daum.net', 'hanmail.net',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr',
  'libero.it', 'virgilio.it', 'seznam.cz', 'centrum.cz',
  'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'ukr.net',
  'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'rambler.ru', 'rediffmail.com',
  'btinternet.com', 'sky.com', 'virginmedia.com',
  'shaw.ca', 'rogers.com', 'bell.net', 'telus.net', 'sympatico.ca',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'charter.net', 'optonline.net', 'earthlink.net',
  'bigpond.com', 'optusnet.com.au', 'xtra.co.nz',
  'tutanota.com', 'tuta.io', 'tuta.com', 'fastmail.com', 'hey.com', 'duck.com', 'hushmail.com', 'runbox.com', 'skiff.com',
]);

// Suffixes that identify a school or university. Each one is anchored to the
// end of the host and needs a dot in front, so `edu.evil.com` never matches
// and `mail.school.edu` does.
const SCHOOL_SUFFIXES = [
  /\.edu$/,                 // mit.edu
  /\.edu\.[a-z]{2}$/,       // edu.au, edu.mx, edu.in, edu.br ...
  /\.ac\.[a-z]{2}$/,        // ac.uk, ac.jp, ac.nz, ac.za ...
  /\.k12\.[a-z]{2}\.us$/,   // k12.ca.us
  /\.sch\.[a-z]{2}$/,       // sch.uk, sch.id, sch.sa ...
  /\.school\.nz$/,
  /\.schule$/,
];

// Throw-away mail. Exact domains plus name tokens (tempmail, trash-mail ...).
// Deliberately short: the MX check below already refuses domains that cannot
// receive mail, so this only needs the services that DO receive mail.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.de', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', '10minemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com',
  'yopmail.com', 'yopmail.fr', 'trashmail.com', 'trashmail.me', 'dispostable.com', 'getnada.com', 'nada.email',
  'mohmal.com', 'throwawaymail.com', 'maildrop.cc', 'mintemail.com', 'fakeinbox.com', 'emailondeck.com', 'tempr.email',
  'burnermail.io', 'mailnesia.com', 'spamgourmet.com', '33mail.com', 'mailsac.com', 'inboxkitten.com', 'harakirimail.com',
  'mytemp.email', 'tmpmail.org', 'tmpmail.net', 'moakt.com', 'tempail.com', 'crazymailing.com', 'emailfake.com', 'generator.email',
  'luxusmail.org', 'mailtemp.net', 'disposablemail.com', 'guerrillamailblock.com', 'grr.la', 'pokemail.net', 'spam4.me',
]);
const DISPOSABLE_TOKENS = /(tempmail|temp-mail|tmpmail|trashmail|throwaway|disposable|10minute|guerrilla|mailinator|yopmail|fakemail|burner|spambox|junkmail)/;

// Words that say "school" in the audience's world. Owner ruling (2026-08-22):
// a REGISTRABLE domain containing one of these anywhere is a school:
// `kyschools.us`, `dekalbschoolsga.org`, `kellerisd.com`, `apsk12.org`.
// Sub-domains are never consulted (`student.evil.com` is judged as
// `evil.com`): anyone can mint a "student." or "edu." label under a domain
// they own, and the policy records its allow for the registrable domain.
// False positives (`wisdom.com` carries "isd") are accepted on purpose; the
// audience is school kids on district domains no list covers.
const SCHOOL_TOKENS = [
  'k12', 'school', 'isd', 'usd', 'csd', 'psd', 'cusd', 'district', 'academ', 'college', 'student', 'pupil', 'edu',
  'learn', 'classroom', 'campus', 'univ', 'lycee', 'ecole', 'colegio', 'escola', 'escuela', 'schule', 'scuola', 'liceo',
  'gymnasium', 'institut',
];
// Short words that only count as a whole label of the registrable domain
// (`sd-hs.org`, `prep.org`), because as substrings they would match anything.
const SCHOOL_LABELS = new Set(['sd', 'hs', 'ms', 'es', 'prep', 'stem', 'charter', 'elementary', 'middle', 'primary', 'secondary']);

// RFC-ish sanity, not a full grammar: one @, no spaces, a dot in the domain,
// sane lengths. The provider decides the rest when it tries to deliver.
const EMAIL_SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailSyntax(email) {
  if (typeof email !== 'string' || email.length > 254) return false;
  if (!EMAIL_SYNTAX.test(email)) return false;
  const [local, domain] = email.split('@');
  return local.length <= 64 && domain.length <= 253;
}

export function emailDomainOf(email) {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

/** Consumer provider or school suffix: always fine to sign up with. */
export function isAllowedEmailDomain(email) {
  const domain = emailDomainOf(email);
  if (!domain) return false;
  if (CONSUMER_DOMAINS.has(domain)) return true;
  return SCHOOL_SUFFIXES.some((re) => re.test(domain));
}

export function isConsumerDomain(domain) {
  return CONSUMER_DOMAINS.has(String(domain || '').toLowerCase());
}

/** Known throw-away mail services. */
export function isDisposableDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return false;
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  return DISPOSABLE_TOKENS.test(d);
}

// Public suffixes with a second level (so the "registrable" part keeps three
// labels): co.uk, com.au, ac.jp, the Canadian provinces (qc.ca, ab.ca ...),
// Australian states, Japan's ed.jp/lg.jp ... plus the US shapes: any
// <state>.us is a public suffix (k12.sd.us is a district domain, not sd.us),
// and k12.<state>.us keeps four labels.
const SECOND_LEVEL = new Set([
  'co', 'com', 'org', 'net', 'ac', 'edu', 'gov', 'sch', 'school', 'ne', 'or', 'go', 'ed', 'lg', 'k12',
  'nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt',
  'ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nu', 'on', 'pe', 'qc', 'sk', 'yt',
]);

/**
 * The part of a host an organisation actually owns: `lausd.net` for
 * `students.lausd.net`, `xyz.co.uk` for `mail.xyz.co.uk`, `csrdn.qc.ca` for
 * `mail.csrdn.qc.ca`, `district.k12.ca.us` for `student.district.k12.ca.us`.
 * An allow rule on the registrable domain covers every sub-domain the
 * district hands out.
 */
export function registrableDomain(host) {
  const d = String(host || '').toLowerCase().replace(/\.$/, '');
  const labels = d.split('.').filter(Boolean);
  if (labels.length <= 2) return d;
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  if (tld === 'us') {
    if (labels.length >= 4 && labels[labels.length - 3] === 'k12') return labels.slice(-4).join('.');
    if (sld.length === 2) return labels.slice(-3).join('.'); // <x>.<state>.us, incl. k12.sd.us itself
  }
  if (tld.length === 2 && SECOND_LEVEL.has(sld) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

/**
 * Name heuristic: does the domain read like a school or district? Judged on
 * the REGISTRABLE domain only (what the organisation owns), never on a
 * sub-domain label, and never on the public suffix.
 */
export function looksLikeSchoolDomain(domain) {
  const d = registrableDomain(domain);
  if (!d) return false;
  // Never judge the public suffix itself (com, net, org, uk...).
  const own = d.split('.').filter(Boolean).slice(0, -1);
  if (!own.length) return false;
  const joined = own.join('.');
  if (SCHOOL_TOKENS.some((t) => joined.includes(t))) return true;
  return own.flatMap((l) => l.split('-')).some((label) => SCHOOL_LABELS.has(label));
}

/**
 * The companion lens: the organisation's own domain can be neutral while the
 * SUB-DOMAIN names the population it serves. `student.hcbe.net` is Houston
 * County schools, but `hcbe.net` carries no school word, so
 * looksLikeSchoolDomain misses it (owner ruling 2026-08-23: allow these).
 *
 * Judged on the sub-domain labels ONLY, so it never widens the parent: the
 * caller allows the exact host, and siblings like `staff.hcbe.net` still have
 * to earn their own decision.
 *
 * SCHOOL_LABELS (sd, hs, es, ms ...) are deliberately NOT applied here. As a
 * sub-domain a two-letter label is far more often a locale or a region
 * (`es.company.com`) than a school, and that is a false positive with no
 * school in sight.
 */
export function looksLikeSchoolSubdomain(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d) return false;
  const reg = registrableDomain(d);
  if (!reg || d === reg || !d.endsWith(`.${reg}`)) return false;
  const labels = d
    .slice(0, -(reg.length + 1))
    .split('.')
    .flatMap((l) => l.split('-'))
    .filter(Boolean);
  return labels.some((label) => SCHOOL_TOKENS.some((t) => label.includes(t)));
}
