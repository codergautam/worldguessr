#!/usr/bin/env node
/**
 * Seed EmailDomainRule with school / university domains from public datasets.
 * Each entry becomes { status: 'allow', source: <dataset> } on the registrable
 * domain of the institution's website host (never downgrades a 'block').
 *
 * Usage (never put the URI in a repo file):
 *   MONGODB_URI="mongodb://..." node scripts/emailDomains/seedDatasets.mjs [--hipo] [--gias] [--nces <csv>] [--dry]
 *
 *   --hipo        Hipo "university-domains-list" (world universities, ~10k,
 *                 fetched from GitHub)
 *   --gias        UK DfE "Get Information About Schools" daily CSV
 *                 (SchoolWebsite column; ~60 MB download)
 *   --nces <csv>  US NCES Common Core of Data LEA (district) directory CSV,
 *                 downloaded by hand from nces.ed.gov/ccd (WEBSITE column;
 *                 the file name changes every school year)
 *   --dry         print counts, write nothing
 * With no dataset flag, --hipo and --gias both run.
 */
import fs from 'fs';
import mongoose from 'mongoose';
import EmailDomainRule from '../../models/EmailDomainRule.js';
import { isAllowedEmailDomain, isDisposableDomain, registrableDomain } from '../../serverUtils/emailDomains.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const dry = has('--dry');
const wantHipo = has('--hipo') || (!has('--gias') && !val('--nces'));
const wantGias = has('--gias') || (!has('--hipo') && !val('--nces'));
const ncesPath = val('--nces');

const uri = process.env.MONGODB_URI;
if (!uri && !dry) {
  console.error('Set MONGODB_URI (or pass --dry).');
  process.exit(1);
}

// Website hosts that are hosting platforms, not the school's own domain.
const GENERIC_HOSTS = new Set([
  'google.com', 'sites.google.com', 'facebook.com', 'wix.com', 'wixsite.com', 'weebly.com', 'wordpress.com', 'squarespace.com',
  'blogspot.com', 'webs.com', 'godaddysites.com', 'edublogs.org', 'twitter.com', 'instagram.com', 'youtube.com', 'linkedin.com',
  'schoolloop.com', 'finalsite.com', 'schoolwires.net', 'sharpschool.com', 'eschoolview.com', 'edlioschool.com',
]);

function hostOf(url) {
  let s = String(url || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const h = new URL(s).hostname.toLowerCase().replace(/^www\./, '');
    return h.includes('.') ? h : null;
  } catch (e) {
    return null;
  }
}

function candidate(host) {
  if (!host) return null;
  const reg = registrableDomain(host);
  if (GENERIC_HOSTS.has(reg) || GENERIC_HOSTS.has(host)) return null;
  if (isAllowedEmailDomain(`x@${reg}`)) return null; // static suffix already covers it
  if (isDisposableDomain(reg)) return null;
  return reg;
}

// Minimal CSV parser (quoted fields, embedded commas/quotes/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'worldguessr-email-domains/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const found = new Map(); // reg -> source
function add(reg, source) {
  if (reg && !found.has(reg)) found.set(reg, source);
}

if (wantHipo) {
  const url = 'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';
  console.log('hipo: fetching', url);
  try {
    const list = JSON.parse(await fetchText(url));
    let n = 0;
    for (const u of list) for (const d of u.domains || []) { const c = candidate(String(d).toLowerCase()); if (c) { add(c, 'hipo'); n++; } }
    console.log(`hipo: ${list.length} institutions, ${n} candidate domains`);
  } catch (e) {
    console.error('hipo: failed:', e.message);
  }
}

if (wantGias) {
  // The file is date-stamped; try today and the previous few days.
  let text = null;
  for (let back = 0; back < 5 && !text; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const url = `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${stamp}.csv`;
    try {
      console.log('gias: fetching', url);
      text = await fetchText(url);
    } catch (e) {
      console.log('gias:', e.message);
    }
  }
  if (text) {
    const rows = parseCsv(text);
    const header = rows[0] || [];
    const col = header.findIndex((h) => h.trim() === 'SchoolWebsite');
    if (col < 0) console.error('gias: SchoolWebsite column not found');
    else {
      let n = 0;
      for (const r of rows.slice(1)) { const c = candidate(hostOf(r[col])); if (c) { add(c, 'gias'); n++; } }
      console.log(`gias: ${rows.length - 1} schools, ${n} candidate domains`);
    }
  } else {
    console.error('gias: no download succeeded');
  }
}

if (ncesPath) {
  const text = fs.readFileSync(ncesPath, 'utf8');
  const rows = parseCsv(text);
  const header = rows[0] || [];
  const col = header.findIndex((h) => h.trim().toUpperCase() === 'WEBSITE');
  if (col < 0) console.error('nces: WEBSITE column not found in', ncesPath);
  else {
    let n = 0;
    for (const r of rows.slice(1)) { const c = candidate(hostOf(r[col])); if (c) { add(c, 'nces'); n++; } }
    console.log(`nces: ${rows.length - 1} districts, ${n} candidate domains`);
  }
}

console.log(`\ntotal distinct registrable domains: ${found.size}`);
if (dry || !found.size) {
  console.log(dry ? '(dry run; nothing written)' : 'nothing to write');
  process.exit(0);
}

await mongoose.connect(uri);
const ops = [...found].map(([domain, source]) => ({
  updateOne: {
    // Filter on the domain ALONE (status in $setOnInsert): an existing row,
    // an owner 'block' included, keeps its status; a status in the filter
    // would try to INSERT over it and trip the unique domain index.
    filter: { domain },
    update: { $setOnInsert: { status: 'allow', source, createdAt: new Date() }, $set: { updatedAt: new Date() } },
    upsert: true,
  },
}));
let upserted = 0;
for (let i = 0; i < ops.length; i += 1000) {
  const res = await EmailDomainRule.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  upserted += res.upsertedCount || 0;
}
console.log(`wrote ${upserted} new allow rules (existing rows keep their status)`);
await mongoose.disconnect();
