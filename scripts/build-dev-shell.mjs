#!/usr/bin/env node
/**
 * Build the dev-shell payload that ships in the Capacitor IPA/APK.
 *
 * Replaces `out/` with the contents of `dev-shell/`, then runs `cap sync`
 * to push it into the native projects' bundled assets.
 *
 * The native MainViewController / MainActivity reads a saved dev URL from
 * UserDefaults / SharedPreferences before the bridge boots, and overrides
 * `serverURL` if one is set. So the dev-shell HTML is only ever shown when
 * no URL has been saved yet (first launch, or after "Forget URL").
 *
 * Production builds use `pnpm build` instead, which runs `next build` and
 * writes the real Next static export to `out/`.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const shellDir = path.join(root, 'dev-shell');
const outDir = path.join(root, 'out');

if (!fs.existsSync(shellDir)) {
  console.error('dev-shell/ not found at:', shellDir);
  process.exit(1);
}

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of fs.readdirSync(shellDir, { withFileTypes: true })) {
  const src = path.join(shellDir, entry.name);
  const dst = path.join(outDir, entry.name);
  if (entry.isDirectory()) fs.cpSync(src, dst, { recursive: true });
  else fs.copyFileSync(src, dst);
}

console.log('Dev shell copied to out/');

const hasIos = fs.existsSync(path.join(root, 'ios'));
const hasAndroid = fs.existsSync(path.join(root, 'android'));
if (!hasIos && !hasAndroid) {
  console.log('\nNo native platforms yet. Skipping `cap sync`.');
  console.log('Run `npx cap add ios` and/or `npx cap add android`, then re-run this script.');
  process.exit(0);
}

execSync('npx cap sync', { stdio: 'inherit', cwd: root });

console.log('\nDone. Build/run the app from Xcode / Android Studio (or `pnpm cap:ios` / `pnpm cap:android`).');
console.log('After the URL is saved on first launch, IP changes are handled in-app — no rebuilds.');
