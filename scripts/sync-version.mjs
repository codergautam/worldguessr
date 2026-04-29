// Propagates package.json `version` to native projects so we have one source of truth.
// Tolerates missing native dirs (no-op before `cap add ios|android` has run).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;

if (!version) {
  console.error('[sync-version] package.json has no version — aborting');
  process.exit(1);
}

// Build number = unix timestamp truncated to minutes since 2024-01-01,
// keeps it monotonically increasing across builds and fits in 32 bits.
const epoch = Math.floor((Date.now() - new Date('2024-01-01').getTime()) / 60000);
const buildNumber = String(epoch);

let iosUpdated = false;
let androidUpdated = false;

// ---------- iOS Info.plist ----------
const plistPath = resolve(root, 'ios/App/App/Info.plist');
if (existsSync(plistPath)) {
  let plist = readFileSync(plistPath, 'utf8');
  plist = plist.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${version}$2`,
  );
  plist = plist.replace(
    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${buildNumber}$2`,
  );
  writeFileSync(plistPath, plist);
  iosUpdated = true;
}

// ---------- Android build.gradle ----------
const gradlePath = resolve(root, 'android/app/build.gradle');
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`);
  writeFileSync(gradlePath, gradle);
  androidUpdated = true;
}

console.log(
  `[sync-version] version=${version} build=${buildNumber} ` +
    `ios=${iosUpdated ? 'updated' : 'skipped'} android=${androidUpdated ? 'updated' : 'skipped'}`,
);
