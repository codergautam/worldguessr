// Re-export of the shared, platform-agnostic date helpers (repo-root
// /shared/daily). Kept as a local module so existing `./dailyDate` imports
// across the daily UI stay unchanged. Edit the logic in @shared/daily/dailyDate.
export * from '@shared/daily/dailyDate';
