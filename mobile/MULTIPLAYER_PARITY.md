# WorldGuessr — Web vs Mobile Multiplayer Parity Report

Goal: bring **mobile** multiplayer to exact functional parity with **web** (or smoother). This
report is grounded in three explorations: the web client (`components/`), the mobile client
(`mobile/`), and the authoritative WS server protocol (`ws/ws.js`, `ws/classes/*`).

**TL;DR — mobile is ~90% there.** Core duels, parties, friends, emotes, reconnection, and
results are all implemented and in several places *smoother* than web. The gaps are mostly small
correctness bugs and a handful of missing polish features. Nothing requires a rewrite.

---

## 0. Scoreboard

| Area | Web | Mobile | Verdict |
|---|---|---|---|
| Ranked duel queue + ELO range | ✅ | ✅ | Parity |
| Unranked public queue | ✅ | ✅ | ⚠️ requeue bug (see G1) |
| Duel HUD / healthbars / damage anim | ✅ | ✅ | Parity (mobile smoother) |
| ELO change animation | ✅ | ✅ | Parity (mobile has particles) |
| Create / join party (code + link) | ✅ | ✅ | Parity |
| Party lobby + host controls | ✅ | ✅ | Parity |
| Invite friends + deep links | ✅ | ✅ | ⚠️ native universal links pending (G6) |
| Friends CRUD | ✅ | ✅ | Parity |
| Emotes | ✅ | ✅ | Parity |
| Live player list / between-round leaderboard | ✅ | ✅ | Parity |
| Reconnect via rejoinCode | ✅ | ✅ | Parity |
| Results / leaderboard / report player | ✅ | ✅ | Parity |
| **`screen` presence message** | ✅ sends | ❌ never sends | **Gap G2** |
| **`updateCountryCode` over WS** | ✅ | ❌ (uses REST) | Minor (G7) |
| **Unranked auto-requeue type** | ✅ correct | ❌ forces ranked | **Gap G1** |
| **`lastGuesser` toast** | ✅ | ❌ not shown | Gap G3 |
| **Critical-time red screen flash** | ✅ | ⚠️ pulse only | Gap G4 |
| **Party "Play Again" button on results** | ✅ (host reset) | ⚠️ goes home | Gap G5 |
| **Non-duel round-1 "Game starting in N"** | ✅ banner | ✅ loading overlay | Cosmetic parity |
| Dead code (`QueueOverlay`, partial `GetReadyOverlay`) | n/a | ⚠️ cleanup | Housekeeping |

---

## 1. Confirmed gaps to fix (priority order)

### G1 — Unranked auto-requeue incorrectly forces a RANKED duel  ❗(highest impact)
- **Web:** `gameCancelled` / Play-Again re-queues using the *original* type
  (`nextGameType: 'ranked' | 'unranked'`), and `backBtnPressed(true, "unranked")` re-fires the
  same queue the player was in.
- **Mobile:** `mobile/app/(tabs)/home.tsx:283-285` always does
  `wsService.send({ type: 'publicDuel' })` on `nextGameQueued`, and the store hardcodes
  `nextGameType: 'ranked'` in the `gameCancelled` handler. An unranked player whose opponent
  bails before start gets silently thrown into a **ranked** queue.
- **Fix:** thread the real queue type through `nextGameType`. In the `gameCancelled` handler
  (`multiplayerStore.ts`) set `nextGameType` from the current `gameQueued`
  (`publicDuel` → ranked, `unrankedDuel` → unranked). In `home.tsx` send
  `type: nextGameType === 'ranked' ? 'publicDuel' : 'unrankedDuel'`. Also apply to the
  results-screen "Play Again" for live duels (`app/game/results.tsx:794-822`).

### G2 — Mobile never sends the `screen` presence message  ❗
- **Server:** uses `player.screen` (`home`/`singleplayer`/`multiplayer`) for active-player
  counting and presence (`ws.js:612`, `Player.setScreen`). Web sends `type:"screen"` on every
  screen change (`home.js:1628,2264`).
- **Mobile:** no `screen` send anywhere (grep-verified — only REST `updateCountryCode` matched).
  Effect: mobile users are likely undercounted/miscategorised in the online count and any
  presence-driven logic.
- **Fix:** send `{ type: 'screen', screen }` from the navigation layer — e.g. in
  `app/_layout.tsx` route change or per-screen `usefocusEffect`: `home` for tabs,
  `multiplayer` for `/queue`, `/party/*`, `/game/*`, `singleplayer` for SP game.

### G3 — `lastGuesser` toast not surfaced
- **Server:** when one player is the only one who hasn't guessed and >20s remain, it shortens the
  timer to 20s and sends that player a `lastGuesser` toast (`Game.checkRemaining`). Web shows it
  via the generic `toast` handler.
- **Mobile:** the generic `toast` handler exists, so if the server sends `toast` with key
  `lastGuesser` it *should* display — but verify the key is in the mobile i18n map and that the
  message type used by the server is `toast` (it is). **Action:** confirm `lastGuesser` and
  `reconnected` keys exist in the mobile locale (`src/shared/locale.ts`); add if missing. Low risk
  but easy to miss → blank toast.

### G4 — No critical-time red screen flash
- **Web:** last 5s of the guess timer triggers `critical` styling **and a red screen flash**
  overlay (`gameUI.js:1150-1154`).
- **Mobile:** `GameTimer.tsx:102` has an `isCritical` pulse on the timer pill but no full-screen
  red flash.
- **Fix:** add a subtle full-screen red vignette/flash `Animated` overlay in `app/game/[id].tsx`
  gated on `isCritical && state==='guess'`. Pure polish, but you said nitpicky.

### G5 — No party "Play Again / Back to Lobby" affordance on the results screen
- **Web:** host can return a finished party game to the lobby via `resetGame`, and the end screen
  exposes Back/Play-Again accordingly.
- **Mobile:** host `resetGame` exists for the in-game "back" path, but `app/game/results.tsx`
  only offers "Play Again" for duels (auto-requeue) and otherwise resets to home for non-duel MP.
  A party host finishing a game can't one-tap rematch the same lobby from results.
- **Fix:** on the results screen, when `isParty && isHost`, show "Back to Lobby" that sends
  `resetGame` and navigates back to `/game/multiplayer` (lobby re-render), mirroring web.

### G6 — Native universal-link party invites not wired
- **Mobile:** `useDeepLinkInvite.ts` handles `?party=` and the `worldguessr://` scheme in-app, but
  the comment notes AASA (iOS) / assetlinks.json (Android) aren't configured, so tapping an
  `https://…/?party=CODE` link from outside the app won't deep-link.
- **Fix:** add `apple-app-site-association` + Android App Links intent filters / Expo
  `associatedDomains` + `intentFilters` in `app.json`. (Infra task, not code-in-app.)

### G7 — `updateCountryCode` uses REST instead of WS (minor)
- Web updates the flag live over WS (`type:"updateCountryCode"`) so it reflects instantly in the
  current game roster; mobile uses the REST endpoint (`api.ts:241`). Cosmetic — flag won't update
  mid-game for others. Optional: also emit the WS message when in a game.

---

## 2. Housekeeping (not user-facing, but you're nitpicky)

- **Dead code:** `mobile/src/components/multiplayer/QueueOverlay.tsx` has no importers — superseded
  by `app/queue.tsx`. Either delete or wire it. `GetReadyOverlay.tsx` is only used for duel
  round-1; other getready states use `GameLoadingOverlay` + `BetweenRoundsLeaderboard`. That's a
  deliberate, fine choice, but document it so it isn't mistaken for a bug.
- **`gameOver` is a no-op** on mobile (web clears `latLong`/extent). Harmless because the unified
  game route re-renders from `gameData.state`, but confirm no stale pin lingers on the reveal map.

---

## 3. Things mobile does that match or BEAT web (no action, keep)

- ELO change display has **tier-based star particle bursts** (bronze/silver/gold/platinum) — web
  just animates the counter.
- Unified `app/game/[id].tsx` route makes lobby↔game↔between-rounds pure re-renders (no nav
  flespecially smooth transitions).
- `AppState` foreground/background handling: re-syncs time and reconnects on resume — more robust
  than web's `visibilitychange`-only handling.
- Actionable notification cards (Accept/Decline for friend req + game invite) with 60s auto-expire.
- Forfeit confirmation Alert on leaving ranked duels (parity with web's confirm).

---

## 4. Protocol parity matrix (client → server)

Web sends these that mobile should also send:

| Message | Web | Mobile | Note |
|---|---|---|---|
| `verify`, `pong`, `timeSync` | ✅ | ✅ | parity |
| `publicDuel`, `unrankedDuel`, `leaveQueue` | ✅ | ✅ | parity (see G1) |
| `createPrivateGame`, `joinPrivateGame`, `setPrivateGameOptions`, `startGameHost`, `resetGame` | ✅ | ✅ | parity |
| `place`, `emote`, `leaveGame` | ✅ | ✅ | parity |
| `inviteFriend`, `acceptInvite` | ✅ | ✅ | parity |
| friends: `getFriends`/`sendFriendRequest`/`acceptFriend`/`declineFriend`/`cancelRequest`/`removeFriend`/`setAllowFriendReq` | ✅ | ✅ | parity |
| **`screen`** | ✅ | ❌ | **G2** |
| **`updateCountryCode`** | ✅ | ❌ (REST) | G7 |

Server→client messages: mobile handles the full set web does
(`game`, `player`, `place`, `duelEnd`, `publicDuelRange`, `maxDist`, `generating`, `gameShutdown`,
`gameCancelled`, `gameJoinError`, `invite`, `friendReq`, `friends`, `friendReqState`, `toast`,
`streak`, `elo`, `cnt`, `error`, `restartQueued`, `t`, `timeSync`, `verify`). No receive-side gaps.

---

## 5. Suggested implementation order

1. **G1** (unranked requeue) — correctness bug, user-visible, ~15 lines.
2. **G2** (`screen` presence) — affects server presence/counts, small.
3. **G5** (party rematch from results) — meaningful UX gap for party hosts.
4. **G3** (`lastGuesser`/`reconnected` locale keys) — verify + add keys.
5. **G4** (critical red flash) — polish.
6. **G7** (live country code over WS) — minor.
7. **G6** (native universal links) — infra/config, separate track.
8. Housekeeping: delete/justify `QueueOverlay.tsx`.

> Note: neither web nor mobile has in-game **text chat** or **player kicking** or **host
> migration** — these are absent server-side too, so they are NOT parity gaps. Don't add them
> expecting web has them; it doesn't.
