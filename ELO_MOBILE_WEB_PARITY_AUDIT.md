# ELO Mobile/Web Parity and Deployment Audit

**Branch:** `elo`  
**Audit date:** 2026-08-11  
**Scope:** Next.js web application, Expo/React Native mobile application, ELO migration, persistence, release compatibility, and production readiness.

## Executive verdict

**No-go for production tonight.** The branch is not ready for a coordinated web, iOS, and Android ELO launch as-is.

Tomorrow can be used for a release candidate and migration rehearsal, but a public launch should wait until the migration/data blockers, mobile build failures, missing parity features, and signed-device validation are complete.

## Release blockers

### 1. Migration timestamp is still development data

[`components/utils/ratingFlags.js`](components/utils/ratingFlags.js#L39) explicitly requires `MIGRATION_AT` to be changed for production. It remains `2026-08-07T21:36:00Z`.

An incorrect timestamp can make accounts created after the intended migration boundary placement-eligible and allow placement seeding to overwrite migrated ratings. [`serverUtils/checkMigrationAt.js`](serverUtils/checkMigrationAt.js#L38) warns but does not block startup.

### 2. Committed migration artifacts contain development data

[`data/season0-peaks.json`](data/season0-peaks.json#L1) contains approximately 50,000 users and a maximum peak of 2484. [`public/season0-hall-of-fame.json`](public/season0-hall-of-fame.json#L1) contains development accounts including `DevTesterNastyStump2`.

These artifacts must be generated from production data during a rehearsed cutover, not shipped from the current branch snapshot.

### 3. Peak export misses peaks earned during the closing gap

[`scripts/exportSeason0Peaks.js`](scripts/exportSeason0Peaks.js#L24) assumes the closing rating covers the final three-day gap. A player can reach a new peak and fall before closing, so the export can permanently understate peak badges. Migration currently applies `max(exportedPeak, closingElo)` in [`scripts/migrateRatingV2.js`](scripts/migrateRatingV2.js#L526), which does not recover those missing peaks.

### 4. Account writes are not frozen during migration

Migration dynamically scans users in [`scripts/migrateRatingV2.js`](scripts/migrateRatingV2.js#L355) and performs multiple passes. Queue maintenance prevents matches but does not prevent registrations between passes. Production cutover needs an auth/account-write guard, a fixed snapshot boundary, or a verified incremental reconciliation process.

### 5. Rating persistence is not awaited or atomic

[`ws/classes/Game.js`](ws/classes/Game.js#L2028) updates the two players independently. [`ws/classes/Player.js`](ws/classes/Player.js#L178) fires the database update without awaiting it. A transient failure can persist one player but not the other, breaking the intended zero-sum result while clients have already received the new rating.

### 6. Existing mobile clients are incompatible with the new scale

The public iOS app is currently version 2.3.6 ([App Store listing](https://apps.apple.com/us/app/worldguessr/id6778672486)). The branch still declares version 2.3.6 in [`mobile/app.json`](mobile/app.json#L5), while the force-update minimums remain 1.0.7 in [`mobile/src/services/forceUpdate.ts`](mobile/src/services/forceUpdate.ts#L8).

The live binary contains the old league thresholds, so new ELO values will be displayed using stale league logic. There is no ELO-v2 capability gate and no configured OTA path. Apple requires an incremented App Store version for an update ([Apple documentation](https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version)).

### 7. Mobile validation is not green

`pnpm --dir mobile exec tsc --noEmit` fails with:

- Invalid `lazy` tab property in [`mobile/app/(tabs)/_layout.tsx`](mobile/app/(tabs)/_layout.tsx#L16)
- `ViewStyle` passed as a text style in [`mobile/src/components/ui/WgWordmark.tsx`](mobile/src/components/ui/WgWordmark.tsx#L20)

Expo Doctor fails 17 of 18 checks. The largest mismatch is `expo-clipboard`: the project has a major-incompatible version for Expo SDK 54, with additional Expo, Reanimated, SVG, Worklets, router, font, and localization mismatches.

The web test suite and Next production build pass, and Android/iOS Metro exports succeed, but no signed EAS builds or physical-device smoke tests were completed.

## Mobile versus web parity gaps

| Feature | RN status | Impact |
|---|---|---|
| Hall of Fame | Entirely absent from RN; web has search, pagination, “find me,” and current standings in [`components/hallOfFame.js`](components/hallOfFame.js#L318) | Major missing feature |
| ELO rebuild notice | RN omits the web notice and forum link shown in [`components/eloView.js`](components/eloView.js#L141) | Visible content mismatch |
| Season 1 notice | RN omits “A gift, on us” and the clickable forum link from [`components/season1NoticeModal.js`](components/season1NoticeModal.js#L291) | Visible content mismatch |
| Reduced motion | Web respects reduced-motion result behavior; RN always runs count-up animations in [`Season1NoticeModal.tsx`](mobile/src/components/Season1NoticeModal.tsx#L77) | Accessibility inconsistency |
| Own profile glow | RN own-profile mapping drops `cosmetics`; header still attempts to read it in [`ProfileView.tsx`](mobile/src/components/account/ProfileView.tsx#L522) | Own name glow disappears |
| Match history cosmetics | API supplies glows, but RN types and renders discard them in [`GameHistoryTab.tsx`](mobile/src/components/account/GameHistoryTab.tsx#L109) | History names are plain |
| Match history flags | Web displays country flags; RN does not | Visual mismatch |
| Invite friends | RN uses raw friend names in [`InviteFriendsModal.tsx`](mobile/src/components/multiplayer/InviteFriendsModal.tsx#L147) | Equipped glows are missing |
| Daily leaderboard | RN rows lack the web profile-link behavior; self row outside top 100 loses its glow | Interaction/cosmetic mismatch |
| 0% win rate | RN checks `win_rate > 0` in [`EloTab.tsx`](mobile/src/components/account/EloTab.tsx#L111) | Legitimate 0% records are hidden |
| Placement algorithm source | Web uses slope `.08` and max `900`; RN uses `.06` and max `800` in [`eloSystem.ts`](mobile/src/shared/user/eloSystem.ts#L108) | Latent algorithm drift |
| Shop concurrency | RN globally locks shop actions; web leaves other cards pressable while a request is active | Possible out-of-order UI reconciliation |
| Cross-device cosmetics | WebSocket push omits stamps, ad-free expiry, background, and emote order | Second device can remain stale until refresh |
| Release notice | Current locale text says recalculation occurred August 9 | Stale release messaging |

## Additional runtime risks

- Stamp receipts include a `gameId` so clients can reject late results, but web and RN apply the receipt to whichever game is currently displayed. Rapid “Play Again” transitions can show the previous match’s reward on the new result. See [`ws/classes/Game.js`](ws/classes/Game.js#L2569).
- Ad-free pass purchase has a documented charge-before-delivery crash window in [`api/stampShop.js`](api/stampShop.js#L656). A crash between writes can debit stamps without granting the extension.
- A capped or duplicate reward can leave `stampsPending` without a receipt, producing a blank reward area.

## Areas that appear aligned

- Queue modes, placement labels, server-derived search range, ETA/elapsed state, cancellation, and landscape handling.
- Current v2 league cutoffs.
- Most gameplay HUD, get-ready, player list, chat, reactions, results, and map-author surfaces.
- Shop catalog, backgrounds, pins, glows, emotes, and ad-free UI are substantially implemented on both platforms.
- Marker assets are byte-for-byte identical.
- The previously reported forfeit anti-farming and lobby-watchdog issues appear fixed on this branch.

## Verification performed

- `pnpm test`: passed — 439 tests across 18 files.
- `pnpm build`: passed — Next production build/static export.
- Expo Metro exports: passed for Android and iOS JavaScript bundles.
- `pnpm --dir mobile exec tsc --noEmit`: failed with the two errors listed above.
- `pnpm dlx expo-doctor`: failed 17/18 checks.
- No signed production EAS build, TestFlight/Play internal build, or physical-device parity matrix was completed.

## Required release sequence

1. Fix the migration timestamp, peak-gap export, account-write boundary, atomic/awaited rating persistence, receipt correlation, and ad-free transaction.
2. Regenerate and verify production peak and Hall of Fame data during a rehearsed cutover.
3. Fix RN TypeScript and Expo dependency failures.
4. Implement the missing RN parity surfaces and cosmetic fields, especially Hall of Fame, profile/history glows, notices, flags, and the 0% win-rate case.
5. Bump the mobile marketing version, create signed production builds, and test both platforms on physical devices.
6. Submit mobile first; release server-side ELO only once compatible binaries are approved and live, then raise minimum-version floors.

Apple reports that approximately 90% of submissions are reviewed within 24 hours, but that is an average rather than a guarantee ([App Review](https://developer.apple.com/app-store/review/)).

## Final recommendation

**Do not deploy the ELO migration tonight. Do not commit to a full public web/iOS/Android launch tomorrow night.** Tomorrow should be used for fixing the P0 issues, producing signed release candidates, and rehearsing the production migration.
