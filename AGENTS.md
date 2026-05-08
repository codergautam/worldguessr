# Codex Instructions

- Do not run production build commands after routine or minor edits unless the user explicitly asks for a build or the change cannot be responsibly verified any other way.
- In this repo, avoid commands such as `pnpm build`, `npm run build`, `pnpm exec next build`, `next build`, `node scripts/build-dev-shell.mjs`, Capacitor sync/build commands, and similar full app rebuilds by default.
- Prefer lighter validation for small changes: targeted tests, lint/type checks if appropriate, `git diff --check`, or a focused manual inspection.
- Do not stop, restart, replace, or rebuild over the user's existing dev server unless they ask. If server-based verification is needed, use the existing dev server when possible or explain the limitation.
- When skipping a build, mention that it was skipped intentionally to avoid disrupting the dev server.
