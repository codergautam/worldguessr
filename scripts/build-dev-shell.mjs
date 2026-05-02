#!/usr/bin/env node
/**
 * Build a dev-shell IPA payload.
 *
 * Replaces `out/` with the contents of `dev-shell/`, then runs `cap sync`.
 * The resulting native build (Appflow or local) ships an IPA whose WebView
 * boots into a tiny URL-picker page. The user enters their dev server URL
 * once on first launch; it's saved in WebView localStorage and reused on
 * subsequent launches. IP changes are handled in-app without a rebuild.
 *
 * Run prod builds with `pnpm build:mobile` — that re-runs `next build` and
 * overwrites `out/` with the real Next export, so the two flavors don't mix.
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
  console.error('dev-shell/ not found. Expected at:', shellDir);
  process.exit(1);
}

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of fs.readdirSync(shellDir, { withFileTypes: true })) {
  const src = path.join(shellDir, entry.name);
  const dst = path.join(outDir, entry.name);
  if (entry.isDirectory()) {
    fs.cpSync(src, dst, { recursive: true });
  } else {
    fs.copyFileSync(src, dst);
  }
}

console.log('Dev shell copied to out/');

execSync('npx cap sync', { stdio: 'inherit', cwd: root });

console.log('\nDone. Build the IPA in Appflow (or open Xcode/Studio) and install once.');
console.log('Subsequent IP changes are handled in-app — no rebuilds.');
