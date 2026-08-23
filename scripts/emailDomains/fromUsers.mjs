#!/usr/bin/env node
/**
 * Mine the real audience: every account that ever signed in with Google left
 * its email behind, so grouping `users.email` by domain yields the school
 * districts this game actually has (Google Workspace for Education domains
 * like students.lausd.net). Consumer providers, static school suffixes and
 * throw-away mail are skipped; the rest is folded to the registrable domain
 * (students.lausd.net -> lausd.net) so every sub-domain a district hands out
 * is covered by one rule.
 *
 * Usage (read-only by default; never put the URI in a repo file):
 *   MONGODB_URI="mongodb://..." node scripts/emailDomains/fromUsers.mjs [--min 3] [--write] [--limit 200]
 *
 *   --min N    keep domains with at least N accounts (default 3)
 *   --write    upsert { status: 'allow', source: 'users' } rules into
 *              EmailDomainRule (never downgrades an existing 'block')
 *   --limit N  rows to print (default 200; the write covers all of them)
 */
import mongoose from 'mongoose';
import EmailDomainRule from '../../models/EmailDomainRule.js';
import { isAllowedEmailDomain, isDisposableDomain, registrableDomain } from '../../serverUtils/emailDomains.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Set MONGODB_URI (pass it on the command line, do not write it into the repo).');
  process.exit(1);
}
const min = Number(arg('--min', 3));
const limit = Number(arg('--limit', 200));
const write = process.argv.includes('--write');

await mongoose.connect(uri);
const db = mongoose.connection.db;

const rows = await db.collection('users').aggregate([
  { $match: { email: { $type: 'string', $regex: /@/ } } },
  { $project: { d: { $toLower: { $trim: { input: { $arrayElemAt: [{ $split: ['$email', '@'] }, 1] } } } } } },
  { $group: { _id: '$d', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
], { allowDiskUse: true }).toArray();

const totalAccounts = rows.reduce((s, r) => s + r.n, 0);
const byReg = new Map(); // registrable domain -> { n, hosts: Set }
let consumerAccounts = 0;
for (const { _id: host, n } of rows) {
  if (!host) continue;
  if (isAllowedEmailDomain(`x@${host}`)) { consumerAccounts += n; continue; }
  if (isDisposableDomain(host)) continue;
  const reg = registrableDomain(host);
  const cur = byReg.get(reg) || { n: 0, hosts: new Set() };
  cur.n += n;
  cur.hosts.add(host);
  byReg.set(reg, cur);
}
const list = [...byReg].filter(([, v]) => v.n >= min).sort((a, b) => b[1].n - a[1].n);

console.log(`accounts with an email: ${totalAccounts}; on consumer/static-school domains: ${consumerAccounts}`);
console.log(`other domains: ${byReg.size} distinct (registrable); ${list.length} with >= ${min} accounts\n`);
console.log('accounts  domain  (hosts seen)');
for (const [reg, v] of list.slice(0, limit)) {
  const hosts = [...v.hosts].filter((h) => h !== reg).slice(0, 4).join(', ');
  console.log(String(v.n).padStart(8), ' ', reg, hosts ? ` (${hosts})` : '');
}
if (list.length > limit) console.log(`... ${list.length - limit} more (raise --limit to print them)`);

if (write && list.length) {
  const ops = list.map(([reg, v]) => ({
    updateOne: {
      // Filter on the domain ALONE: status lives in $setOnInsert, so an
      // existing row (an owner 'block' included) keeps its status and only
      // its count/updatedAt move. A status in the filter would make the upsert
      // try to INSERT over a blocked row and trip the unique domain index.
      filter: { domain: reg },
      update: {
        $setOnInsert: { status: 'allow', source: 'users', createdAt: new Date() },
        $set: { count: v.n, updatedAt: new Date() },
      },
      upsert: true,
    },
  }));
  let written = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const res = await EmailDomainRule.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    written += (res.upsertedCount || 0) + (res.modifiedCount || 0);
  }
  console.log(`\nwrote/updated ${written} rules (source 'users') into EmailDomainRule; existing rows keep their status`);
} else if (write) {
  console.log('\nnothing to write');
} else {
  console.log('\n(dry run; add --write to store these as allow rules)');
}

await mongoose.disconnect();
