import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The repo is "type": "module" on Node 22, so the unit suites resolve as plain
// ESM with no transform and no jsdom. Everything here is about keeping the
// glob small: the excluded directories all exist in the tree (mobile app,
// native shells, static exports, per-target Next build dirs) and contain
// thousands of files that would cost startup time for zero test value.
export default defineConfig({
  // `@` is the same repo-root alias jsconfig.json gives the Next build. Without
  // it, anything under lib/ is untestable the moment it imports a sibling by
  // alias — which is most of lib/, so the suites had quietly been limited to
  // the alias-free corners of shared/.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    globals: false,
    exclude: [
      '**/node_modules/**',
      'mobile/**',
      'android/**',
      'ios/**',
      'out/**',
      'embed/**',
      '.next/**',
      '.next-gd/**',
      '.next-poki/**',
      '.next-prod/**',
    ],
  },
});
