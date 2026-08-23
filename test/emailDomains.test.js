import { describe, it, expect } from 'vitest';
import {
  canonicalEmail,
  emailDomainOf,
  isAllowedEmailDomain,
  isDisposableDomain,
  isValidEmailSyntax,
  looksLikeSchoolDomain,
  looksLikeSchoolSubdomain,
  registrableDomain,
} from '../serverUtils/emailDomains.js';

describe('emailDomains static allowlist', () => {
  it('allows the big consumer providers', () => {
    for (const e of ['a@gmail.com', 'a@googlemail.com', 'a@outlook.com', 'a@hotmail.co.uk', 'a@yahoo.com', 'a@icloud.com', 'a@proton.me', 'a@gmx.de']) {
      expect(isAllowedEmailDomain(e), e).toBe(true);
    }
  });

  it('allows school suffixes anywhere in the world, including subdomains', () => {
    for (const e of ['a@mit.edu', 'a@mail.school.edu', 'a@ox.ac.uk', 'a@unimelb.edu.au', 'a@student.x.k12.ca.us', 'a@x.sch.uk', 'a@x.school.nz']) {
      expect(isAllowedEmailDomain(e), e).toBe(true);
    }
  });

  it('allows the Apple Hide-My-Email relay (those players already have accounts)', () => {
    expect(isAllowedEmailDomain('x@privaterelay.appleid.com')).toBe(true);
  });

  it('does not statically allow unknown domains or suffix look-alikes', () => {
    for (const e of ['a@mailinator.com', 'a@unknown.org', 'a@edu.evil.com', 'a@k12.ca.us.evil.com', 'a@acuk.com', 'a@students.lausd.net']) {
      expect(isAllowedEmailDomain(e), e).toBe(false);
    }
  });

  it('is case-insensitive on the domain and tolerant of junk input', () => {
    expect(isAllowedEmailDomain('A@GMAIL.COM')).toBe(true);
    expect(isAllowedEmailDomain('nope')).toBe(false);
    expect(isAllowedEmailDomain(null)).toBe(false);
    expect(emailDomainOf('kid@Gmail.com')).toBe('gmail.com');
    expect(emailDomainOf('@gmail.com')).toBe(null);
  });
});

describe('isValidEmailSyntax', () => {
  it('accepts ordinary addresses and rejects the obvious garbage', () => {
    expect(isValidEmailSyntax('kid@gmail.com')).toBe(true);
    expect(isValidEmailSyntax('first.last+tag@school.edu')).toBe(true);
    expect(isValidEmailSyntax('kid@gmail')).toBe(false);
    expect(isValidEmailSyntax('kid gmail.com')).toBe(false);
    expect(isValidEmailSyntax('a@b@gmail.com')).toBe(false);
    expect(isValidEmailSyntax('a'.repeat(65) + '@gmail.com')).toBe(false);
    expect(isValidEmailSyntax(null)).toBe(false);
  });
});

describe('registrableDomain', () => {
  it('keeps what an organisation owns', () => {
    expect(registrableDomain('students.lausd.net')).toBe('lausd.net');
    expect(registrableDomain('lausd.net')).toBe('lausd.net');
    expect(registrableDomain('mail.xyz.co.uk')).toBe('xyz.co.uk');
    expect(registrableDomain('student.district.k12.ca.us')).toBe('district.k12.ca.us');
    expect(registrableDomain('a.b.c.edu.au')).toBe('c.edu.au');
    expect(registrableDomain('GMAIL.COM')).toBe('gmail.com');
    // public suffixes the real user data tripped over
    expect(registrableDomain('mail.csrdn.qc.ca')).toBe('csrdn.qc.ca');
    expect(registrableDomain('learn.cssd.ab.ca')).toBe('cssd.ab.ca');
    expect(registrableDomain('k12.sd.us')).toBe('k12.sd.us');
    expect(registrableDomain('gse.okayama-c.ed.jp')).toBe('okayama-c.ed.jp');
    expect(registrableDomain('escola.pr.gov.br')).toBe('pr.gov.br');
  });
});

describe('isDisposableDomain', () => {
  it('catches throw-away services by name and by token', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true);
    expect(isDisposableDomain('guerrillamail.com')).toBe(true);
    expect(isDisposableDomain('sometempmail.xyz')).toBe(true);
    expect(isDisposableDomain('lausd.net')).toBe(false);
    expect(isDisposableDomain('')).toBe(false);
  });
});

describe('looksLikeSchoolDomain', () => {
  it('reads district and school names anywhere in the REGISTRABLE name (owner ruling: contains k12 / school / isd ...)', () => {
    for (const d of ['fultonschools.org', 'hisd.org', 'k12.wa.us', 'student.cusd80.com', 'my.dallasisd.org', 'academy-online.com', 'stjohnscollege.org', 'dekalbschoolsga.org', 'kyschools.us', 'apsk12.org', 'sd-hs.org', 'prep.org', 'mail.kellerisd.com', 'students.lausd.net' /* registrable lausd carries "usd" */]) {
      expect(looksLikeSchoolDomain(d), d).toBe(true);
    }
  });

  it('does not see schools in plain names, and never in the public suffix', () => {
    for (const d of ['acme.com', 'absdf.com', 'example.org', 'gmail.com', 'x.com.sd']) {
      expect(looksLikeSchoolDomain(d), d).toBe(false);
    }
  });

  // Still the contract for THIS function. The sub-domain case is a separate
  // lens (looksLikeSchoolSubdomain, below) that the policy records host-scoped,
  // so a match here would wrongly widen the whole registrable domain.
  it('never judges a sub-domain label: that is looksLikeSchoolSubdomain\'s job', () => {
    for (const d of ['edu.evil.com', 'student.evil.com', 'k12.evil.io', 'students.acme-corp.com', 'sd.x.com', 'school.example.co.uk']) {
      expect(looksLikeSchoolDomain(d), d).toBe(false);
    }
    // the policy records its allow for the registrable domain, which is what is judged
    expect(registrableDomain('student.evil.com')).toBe('evil.com');
  });

  it('accepts the agreed false positives rather than missing a district', () => {
    expect(looksLikeSchoolDomain('wisdom-tools.com')).toBe(true); // "isd"
  });
});

describe('looksLikeSchoolSubdomain (owner ruling 2026-08-23)', () => {
  it('reads a school word in the sub-domain when the organisation name is neutral', () => {
    for (const d of ['student.hcbe.net', 'students.hcbe.net', 'student-mail.acme.org', 'pupils.foo.co.uk', 'my.students.example.com', 'learn.example.net']) {
      expect(looksLikeSchoolSubdomain(d), d).toBe(true);
    }
  });

  it('needs an actual sub-domain: the registrable domain alone is the other lens', () => {
    for (const d of ['hcbe.net', 'fultonschools.org', 'gmail.com', 'k12.wa.us', '', null, undefined]) {
      expect(looksLikeSchoolSubdomain(d), String(d)).toBe(false);
    }
  });

  it('ignores plain sub-domains, and never the two-letter labels (locales, not schools)', () => {
    for (const d of ['mail.acme.com', 'www.example.org', 'es.company.com', 'hs.company.com', 'sd.x.com']) {
      expect(looksLikeSchoolSubdomain(d), d).toBe(false);
    }
  });

  it('matches the host only: the policy must not widen the parent', () => {
    expect(looksLikeSchoolSubdomain('student.hcbe.net')).toBe(true);
    expect(looksLikeSchoolSubdomain('staff.hcbe.net')).toBe(false);
    expect(looksLikeSchoolDomain('student.hcbe.net')).toBe(false); // parent stays unjudged
  });
});

describe('canonicalEmail (alias -> one account identity)', () => {
  it('strips plus-tags on every domain, not just Gmail', () => {
    expect(canonicalEmail('bob+alt42@gmail.com')).toBe('bob@gmail.com');
    expect(canonicalEmail('kid+wg@student.k12.ca.us')).toBe('kid@student.k12.ca.us');
    expect(canonicalEmail('a+b+c@outlook.com')).toBe('a@outlook.com');
  });

  it('collapses dots for Gmail only', () => {
    expect(canonicalEmail('b.o.b@gmail.com')).toBe('bob@gmail.com');
    expect(canonicalEmail('b.ob+x@googlemail.com')).toBe('bob@gmail.com');
    expect(canonicalEmail('first.last@outlook.com')).toBe('first.last@outlook.com');
  });

  it('folds googlemail.com into gmail.com', () => {
    expect(canonicalEmail('bob@googlemail.com')).toBe('bob@gmail.com');
  });

  it('lowercases and trims like normalizeEmail', () => {
    expect(canonicalEmail('  Bob+Tag@GMAIL.com ')).toBe('bob@gmail.com');
  });

  it('never empties the local part', () => {
    expect(canonicalEmail('+tag@gmail.com')).toBe('+tag@gmail.com');
    expect(canonicalEmail('...@gmail.com')).toBe('...@gmail.com');
  });

  it('is total on junk (validity is the caller\'s job)', () => {
    expect(canonicalEmail('')).toBe(null);
    expect(canonicalEmail('not-an-email')).toBe('not-an-email');
    expect(canonicalEmail('@gmail.com')).toBe('@gmail.com');
  });
});
