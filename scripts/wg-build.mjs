#!/usr/bin/env node
/**
 * Web build entrypoint. Routes `npm run build` to the right pipeline based on
 * the WG_BUILD_FLAVOR env var.
 *
 *   WG_BUILD_FLAVOR=dev-shell   → tiny URL-picker loader (Appflow dev IPA)
 *   WG_BUILD_FLAVOR=mobile      → next build with BUILD_TARGET=mobile
 *   (unset / anything else)     → next build (web prod, Heroku/Vercel parity)
 *
 * Default behaviour matches the original `cross-env next build`, so existing
 * web build paths (Heroku, Vercel) are unaffected.
 */

import { spawnSync } from 'child_process';
import process from 'process';

const flavor = (process.env.WG_BUILD_FLAVOR || '').toLowerCase();

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log(`[wg-build] flavor=${flavor || '(default web)'}`);

if (flavor === 'dev-shell') {
  run('node', ['scripts/build-dev-shell.mjs']);
} else if (flavor === 'mobile') {
  run('npx', ['cross-env', 'BUILD_TARGET=mobile', 'next', 'build']);
  run('node', ['scripts/sync-version.mjs']);
} else {
  run('npx', ['cross-env', 'next', 'build']);
}
