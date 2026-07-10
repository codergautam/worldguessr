# Party / 2v2 UX & Logic Audit — Ledger (July 4, 2026)

Working document for the `party-unification` branch audit (12-agent sweep + manual
verification of every finding + live e2e testing). Statuses: **FIXED** (done this
session, in working tree), **OPEN** (confirmed real, not yet fixed), **REFUTED**
(agent claim disproven on verification), **RULED** (user design decision — do not
"fix").

---

## 1. Fixed this session

### Server (ws/classes/Game.js, ws/ws.js)
- **teamGame parity cluster** — team parties now inherit the teamDuel safety rails.
  Proven red→green with a 4-guest-bot e2e on a private `WS_PORT=3102` instance:
  - 30s purge rejoin exception extended to `teamGame` (mid-match states only,
    **never the host** — host disconnect still disbands, see RULED). Fixes a
    finalized guess being deleted from scoring by the purge (was: perfect 5000
    guess → team scored 0).
  - Forfeit arm for `teamGame` in `removePlayer`: fully-emptied team loses
    immediately (`end({forfeitedTeam})` → `finishTeamParty(forfeitedTeam)` —
    forfeit is never a draw); lone survivor plays on short-handed.
  - `holdsRounds` covers `teamGame`: long-disconnected players stop forcing
    full-length rounds.
  - Hardening: host-disband branch sets `cleanupInProgress` + `return` before
    shutdown so a disband can never double-fire as a forfeit.
- **Queue cleanup consistency** — explicit `inQueue=false` + `playersInQueue.delete`
  added to `createPrivateGame` and `joinPrivateGame` (mirrors `acceptInvite`).
  Note: the reported "queue double-registration teleport" was REFUTED as a live
  bug (see §3) — this is hardening so the invariant is local, zero behavior change.

### Client logic
- **Stuck `partyModalShown` ambush** — `multiplayerHome.js` now gates the party
  settings modal on a derived `partyEditContext` (pending party create, or host
  of a private non-2v2 waiting lobby). A stale flag can no longer pop the modal
  over 2v2 lobbies / queues / join screens after a teardown mid-edit.

### Mobile / layout sweep (styles/globals.scss + components)
- Touch targets: `.party-lobby__eye` ~17→~35px (padding+negative margin),
  `.party-lobby__kick`/`__move` ~24→~30px (real padding — adjacent targets must
  not share expanded hit areas), friend `accept/decline/cancel/invite` buttons
  10px 14px padding + separation.
- `.join-party-card` `min-width:320px` removed (sub-360px overflow).
- Duel anti-cheat banner: 60% width squeeze removed for 401–768px (+ dead ≤400px
  block deleted).
- Health-bar media overlap: `(min-width:600px)` → `(min-width:831px)`, mutually
  exclusive with the `(max-width:830px)` block (same effective rendering).
- `.player-name` `margin-right:8px` scoped to `.health-bar-container` (was
  nudging round-over centered columns ~4px off-true).
- Lobby header at `max-height:600px`: compacts instead of `display:none`.
- Party lobby counter: `/N` only when seat cap ≤4 (no more "3/200"); "(You)" tag
  renders on the pending create shell (`myId` falls back to `'self'`).
- Join-code input: `inputMode="numeric" pattern="[0-9]*"` → number pad on phones.
- **Scorebar/timer top-band layout** (the "overlapping UI" complaint):
  - Base `.timer` got its first mobile tiers (≤830px compaction).
  - New `.timer--with-scorebar` (teamGame only, class from gameUI): ≤830px the
    round timer stacks centered BELOW the scorebar (top:96) instead of
    colliding; `.critical` transform patched (same trick as `.timer.duel`);
    skipped in CrazyGames (its 320x50 ad rides `.moreDown` to top:100 = where
    the stacked timer would land).
  - Scorebar mobile reversal hack (≤540px top:110) deleted; monotonic 100→40.
  - **Scorebar yields to the between-rounds leaderboard** (`!leaderboardVisible`
    mount gate) — the fullscreen leaderboard team hero shows the same totals;
    previously both showed at once = the "Team 1 vs Team 2 overlap" on all
    platforms. Timer un-stacks (returns right-anchored) during the leaderboard.
- **Scorebar internal redesign** (the "crammed pill" complaint): per-column
  `min-width:72px` (0-0 no longer collapses), '·' divider replaced with a 1px
  full-height hairline, gap 24→28, padding 20→24.
- **+Δ increment animation v3**: `AnimatedCounter` gained `incrementMs` prop
  (scorebar passes 2600ms; count-up stays 800ms); animation name/curve/fill
  moved from inline style to CSS so contexts can swap keyframes;
  `teamPointIncrement` = bare green text (NO background chip — user hated it),
  0.8rem + text-shadow, rises 8px into its slot BELOW the number, holds ~1.4s,
  drifts up 4px while fading. Never crosses the score text.
- **Crowns** (gold #ffc107, hidden on ties): leading team in the scorebar pill
  and the between-rounds leaderboard hero; final winner on the end screen
  (headline `team-final-scoreline` + Final Scores section headers).
  Classes: `.team-scorebar__crown`, `.multiplayerLeaderboard__teamHeroCrown`,
  `.game-summary-team-crown`.
- **Team Final Scores rank caption** (this turn): tiny muted note that ranks are
  overall placement across both teams (numbering stays global — deliberate).

---

## 2. OPEN — confirmed real, not yet fixed

### 2v2/team sweep — FIXED (July 5 late night; server fixes proven by e2e
### `sweep_fixes_test.mjs` [session scratchpad, 12/12 green vs WS_PORT=3113
### MONGODB-less instance]; lint 0 errors, sass compiles, locale JSON valid.
### RESTART the long-lived 3002 ws process to pick these up.)
- **Pairing-beat DC stall FIXED** — the ws close handler now EVICTS a
  disconnecting member's seat from any auto-paired waiting is2v2Lobby
  (`dcGame.removePlayer(player, true)`): matchmade strangers get no reconnect
  grace (same ruling as the play-again counter), the survivor's roster drops
  to 1 so pair2v2Solos can pair them again, and removePlayer's own tail
  re-arms the instant requeue. e2e: eviction 108ms, survivor re-paired 326ms
  after the next solo queued (pre-fix ~30s purge wait + enter2v2Queue spam
  every 500ms). Chosen (join-code) duos keep the grace (condition gates on
  `autoPaired`); build2v2Teams' stage-2 grace-wait untouched (deliberate).
- **Forfeit round-flush deleted (`flushFinalRound`) — totals/history now
  consistent in EVERY mode** — premature end() (mid-round forfeits) used to
  flush the in-flight round into roundHistory with real calcPoints while
  givePoints (sole writer of teamScores/player.score, only called by the
  loop's natural round resolution) never ran → totals short one round. Scope
  was bigger than teamGame: 1v1 ranked/unranked forfeits had the same
  mismatch (+ roundOverScreen fabricated ❤️ damage from the phantom points),
  and a forfeit during a MID-MATCH getready flushed a PHANTOM round N+1
  scored from round N's stale guesses (clearGuesses only runs at guess-start)
  against round N+1's location. Natural ends never needed the flush (the loop
  pairs givePoints+saveRoundToHistory before any transition; checkRemaining
  only shortens timers). e2e: guess-variant and getready-variant both keep
  roundHistory at completed-rounds-only with totals stable.
- **Restart queue hygiene + toast FIXED** — recovery now explicitly nulls
  `autoQueue2v2At` (it could only fire against all-disconnected ghosts and
  null itself; also never downtime-shifted) and flags every casualty
  (`queueKilledByRestart`: queued players + members mid "Queueing in 3…",
  who aren't inQueue); rejoinGame sends a one-shot localized
  `matchmakingCancelled` toast ("cancelled by a server restart", 5 locales)
  unless the queue re-sync just re-queued them.
- **Disconnected players now visible (team modes AND 1v1 duels)** — close
  handler stamps the roster seat (`disconnected: true`) and broadcasts
  mid-game (getready/guess/end); rejoinGame clears it and re-broadcasts.
  HUD renders it in player-info-modern: dimmed name (0.55) + red MdWifiOff
  marker (`.hb-dc`) on 1v1 opponent and team-name stacks; the team-aware
  waiting label reads it too. e2e: flag broadcast lands <1s after a hard
  drop.
- **Team-aware waiting label** — the guess-button waiting label is
  allegiance-aware: "Waiting for your teammate" (or {p} teammates) before
  "Waiting for opponents"; disconnected mates don't hold the label (mirrors
  holdsRounds). The `.teamMateStatus` pill that shipped alongside it
  (per-mate placing/locked/points readout above the guess button) was
  REMOVED July 5 by user ruling — don't re-add; the waiting label +
  faded/locked teammate map pins are the coordination surface.
- **Teammate map pin locked-state** — interim (unlocked) teammate pins render
  at 0.55 opacity via new `fadedIds` on MultiplayerLayer / `markerOpacity` on
  PlayerLine; a locked pin is a commitment at full opacity.
- **getMyTeam() unification** — new components/utils/getMyTeam.js ('a'|'b'|
  null, never a silent 'a'); replaced 5 ad-hoc derivations (gameUI HP bars —
  which now SKIP the frame on a lookup miss instead of defaulting to 'a' and
  risking swapped Your/Enemy bars — teamScorebar, playerList, Map teammate
  layer, home emote team). roundOverScreen keeps its frozen-snapshot variant
  (different data source, deliberately).
- **team2v2 profile links restored** — TeamNames entries now carry
  {username, isMe, disconnected} and every non-me name links to
  /user?u=… like the 1v1 opponent always did.
- **"Which side is mine" unified** — the between-rounds hero side now dims to
  opacity .75 with `.mine` at 1, exactly like the in-round scorebar.
- **2v2 queue banner Cancel button DELETED** (ruling reversal — see §4): the
  navbar back button is the single queue exit and was verified to call the
  identical `backBtnPressed()`; dead `backBtn` prop threading and
  `.party-lobby__queue-actions` CSS removed.
- **"Queueing in N…" label hoisted** to one `queueingLabel` in partyLobby.

### 2v2/team sweep — user-reported bugs FIXED (July 5, e2e suite now 14/14)
- **Guest profile links FIXED** — profile links now gate on roster
  `accountId` (present for registered, absent for guests): gameUI passes
  `hasProfile` in team name entries and `hasProfile={!!opponent?.accountId}`
  to the 1v1 opponent HealthBar; TeamNames + the 1v1 Link branch require it,
  guests fall to plain spans (which keep the disconnect dim/marker). Covers
  the NEW team links AND the pre-existing always-broken 1v1 guest link.
- **`lastGuesser` toast in team modes FIXED** — checkRemaining's TEAM branch
  now sends new key `otherTeamLocked` ("The other team has locked in. Timer
  reduced to {{s}} seconds", 5 locales); solo branch keeps `lastGuesser`.
  e2e: team A locks → both team-B members receive otherTeamLocked (never
  lastGuesser); FFA control → the last guesser still gets lastGuesser.

### Queue button-state desync cluster — FIXED (July 5 night #2; e2e
### `test2v2states.mjs` [session scratchpad, 5/5 green vs WS_PORT=3102
### incl. chosen-duo + solo-cancel regression guards]; RESTART the
### long-lived 3002 ws process to pick these up)
User-reported: button stuck mid-countdown / counting down while already
queued / "Find Match" shown while actually queueing — mainly when the
partner cancels or disconnects mid-countdown/mid-queue. One cluster, five
server + two client root causes, all around `autoQueue2v2At`:
- **Abandoned-partner 3s phantom countdown** (was the OPEN "partner sees
  Queueing in 3…" item) — leaveQueue's auto-paired dissolve stamped
  `autoQueue2v2At=+3000` on the non-canceler's lobby (two sites); now calls
  `queue2v2Members` synchronously AFTER the state send (state-before-queue:
  the client `game` handler wipes gameQueued). Partner lands in stage-1
  teammate search in the same burst — e2e 0-1ms, was 3s of disabled
  uncancellable "Queueing in 3…".
- **Cancel racing the pairing beat was silently dropped** — leaveQueue was
  gated on `player.inQueue`, but pair2v2Solos de-queues both members for the
  preview beat, so a Cancel in that window was ignored and the armed
  auto-queue queued the canceler at +3s into the pairing they declined.
  Handler now also accepts a pre-queue cancel (no entry + waiting private
  lobby with an armed stamp), disarms it, and runs the normal
  dissolve/restore. Both 2v2 cancel branches now explicitly disarm
  `autoQueue2v2At`.
- **Survivor re-arm sent state BEFORE stamping** (Game.js removePlayer
  is2v2Lobby tail) — the snapshot carried `autoQueueInMs:null`, so the
  survivor's button showed an enabled "Find Match" that lied for up to one
  poll tick (click-race window). Stamp moved before the sends → snapshot
  carries 0 → client paints a disabled "Queueing…" instead (e2e asserts
  `autoQueueInMs===0` + requeue ~500ms after partner DC).
- **Lone-survivor pregame regroup beat downgraded to instant**
  (cancelTeamDuelPregame): a duo keeps the deliberate 3s look-at-your-team
  beat; a lone survivor has nothing to look at — `Date.now()` stamp, next
  poll tick (matches the instant-solo-requeue-on-DC ruling).
- **build2v2Teams stage-1 demotion now notifies the client** (lobby snapshot
  then enter2v2Queue{teammate}) — was a silent `q.teamId=null` that left the
  client painting the stage-2 "Finding match" banner while hunting teammates.
- **Client: stale `autoQueueInMs` cleared on enter2v2Queue(teammate)** —
  stage-1 keeps gameData, so a leftover countdown stamp kept the card
  counting down while already queued.
- **Client: `queueStage` now cleared wherever `gameQueued` clears** (`game`
  handler + 2v2 back-button branch).

### 2v2/team sweep — still OPEN
- **gameQueued/queueStage are hand-synced twins** — every reader defensively
  re-gates on gameQueued==='2v2' (multiplayerHome.js:74, partyLobby.js:40).
  July 5 night #2: writes are now consistent (queueStage cleared at every
  gameQueued clear), so this is hygiene only — collapsing to one queueState
  enum remains optional.
- **Ghost-getready chrome unbounded** — TeamScorebar (gameUI.js:943-948) and
  the team2v2 HP block (:905) gate on state!=='end' only, no
  curRound<=rounds bound (the leaderboard's inGetready has it, :327-332).
  Sub-second cosmetic straggler at game end. LOW.

### EndBanner team-mode upgrade (user ask — verified data-flow facts + plan)
- FACTS: the banner is THE between-rounds surface (`guessed` =
  multiplayerShowAnswer = getready-after-round-1 or end-hold,
  home.js:2979-2983 — NOT "I guessed"); team2v2 gets NO between-rounds
  leaderboard (inGetready requires !duel, gameUI.js:327-332) so banner+HP
  bars are the entire reveal; the server computes teamDuel round scores and
  DISCARDS them (Game.js:445-453) — lastRoundTeamScores is stamped only for
  teamGame (:498); teamGame deltas are already on the wire (teamRoundScores,
  getInitialSendState:243) and already rendered by the leaderboard hero
  (playerList.js:69-83) which only lands in the LAST 5s of getready
  (gameUI.js:336); 2v2 damage today is only visible as HealthBar's transient
  2s "-N" prop-diff animation (duelHealthbar.js:65-74).
- ~~PLAN: scoreline in the banner~~ **REVERSED July 5 eve (user ruling)**:
  no score digits in the banner — the numbers already live on chrome that owns
  them (2v2 HP bars mount through getready; teamGame has scorebar + hero). The
  banner is the INTERPRETATION layer: verdict + credit, zero digits.
- SHIPPED (both modes, endBanner.js):
  - 2v2: verdict headline via teamRoundWon/Lost/Tied ("Your team won the
    round!" + 🎉 on win), attribution sub-line ("Your guess counted!" /
    "{{name}}'s guess counted"), personal line demoted to distance-only
    (`motivation team-round-personal`, pts dropped — ptsCount key stays, mobile
    uses it).
  - teamGame: one `motivation` line "verdict — attribution" at reveal start
    (fills the 5s before the hero); distance/points lines kept as-is;
    attribution suppressed under 'average' scoring (same rule as the map's
    enlarged pin).
  - Server stamp LANDED: teamDuel givePoints now stamps lastRoundTeamScores
    (Game.js ~:464) — feeds the verdict only. Client gates on
    `typeof scores.a/b === 'number'` so it degrades silently vs old servers.
  - Attribution = client recompute via pickBestTeamGuessIds (calcPoints +
    distance tie-break), teammates from players[].guess (server-auth, matches
    Map's answerSnapshot which copies .guess only), self from pinPoint prop —
    so the named carrier ALWAYS matches the reveal map's enlarged pin. Frozen
    per reveal in a ref keyed `${code}:${teamRoundScores.round}` (next round's
    broadcast wipes guesses mid-fade; key survives ghost getready since the
    stamp round = round just played). myTeam via getMyTeam ?? null — no team
    lines when roster unresolved. gameUI.js 2v2 healthbar `|| 'a'` anti-pattern
    also fixed (skip-frame on null).
  - 2 new locale keys ×5 langs (guessCounted, guessCountedBy); verdict keys
    were already in. Logic unit-tested 6/6 (carrier pick, ties, no-guess,
    verdict) vs real calcPoints; NEEDS real-screen verify in live 2v2 +
    teamGame (banner render, both scoring modes, final-round ghost getready).
  - Follow-ups (same eve, user asks): personal line regained pts in parens,
    compact ≥1k ("132km away (3.4k pts)" — compactPts inline, no util exists
    repo-wide yet); 2v2 headline RE-FRAMED (user: verdict redundant, colors
    unreadable): damage IS the headline — "⚔️ Dealt {dmg} damage!" /
    "💔 Took {dmg} damage" as mainBannerTxt (emoji = win/lose signal, NO
    colored text — .team-round-damage classes deleted), credit line below,
    tied falls back to teamRoundTied; keys dealtDamage/tookDamage ×5
    (replaced enemyTookDamage/teamTookDamage) — 2v2 ONLY, teamGame keeps
    verdict+credit and stays damage-free (user explicit); teamRoundWon/Lost
    now teamGame-only (don't prune). BOTH team modes +1s between rounds
    (ws.js guess→getready transition, `(teamDuel||teamGame) ? 1000 : 0`,
    covers ghost getready; round-1 start() untouched).
  - Extended to 1v1 duels (user: "same for ranked duel 1v1s" — pipeline is
    ranked+unranked, `duel && !team2v2`): same ⚔️/💔 damage headline +
    personal line at bottom, NO credit line (no teammates). No server stamp
    for 1v1 — client rebuilds both round scores (own `points` + opponent's
    players[].guess via calcPoints, verified identical to Game.js duel-branch
    HP subtraction incl. clamp), frozen per reveal keyed `${code}:${curRound}`.
    Falls back to classic banner when latLong missing; `gotPoints` line now
    suppressed by `!damageHeadline` (was 2v2-only gate). guessCounted key
    de-exclaimed → "Your guess counted 🎯" ×5 (user: two stacked "!" lines).
  - Carrier tie rule (user: "more common than you think"): equal best pts on
    my team → `guessCountedTie` "Both guesses counted 🎯" ×5 instead of naming
    whoever the distance tie-break picked (map still enlarges ONE pin — its
    clutter rule, deliberate divergence). Rounded calcPoints tie at ANY score
    (not just 5000 cap) — harness proves 4824==4824 → tie, unequal → named.

### Post-game FIXES (July 5 PM session — all verified by e2e suite
### `playagain_e2e.mjs` [session scratchpad, 9/9 green vs WS_PORT=3102] +
### live browser session; RESTART the long-lived 3002 ws process to pick
### these up, per the stale-WS-process trap)
- **checkRemaining end-state fuse FIXED** — `checkRemaining()` now early-returns
  unless `state==='guess'` (it is round-timer logic; the removePlayer call site
  fires in every state). Ended games keep their 2h grace through departures;
  e2e T3 proves no shutdown after an opponent leaves the results screen.
  Side-fix: getready no longer collapses to 1s on a between-rounds leave.
- **Auto-paired teammate disconnect = instant solo Play Again** —
  `livingTeamPlayAgain` counts only CONNECTED members for auto-paired teams
  (chosen duos keep the 30s roster grace — user ruling: friend wifi blip must
  not split the duo); ws close handler now rebroadcasts `sendPlayAgainState`
  for end-state teamDuel games so the survivor's counter updates in ~1 ws
  round-trip instead of after the 30s purge (e2e T5), and Play Again then
  solo-requeues immediately (T6).
- **Dead-game fallback: end-screen buttons can never dead-click** — if
  `playAgain2v2`/`teamDuelBack` arrive with no live game (2h sweep, server
  restart, stale client) and the sender isn't queued, the server restages
  them in a fresh solo `is2v2Lobby` (Play Again auto-queues stage-1, Back
  parks) instead of silently dropping the message (e2e T1/T2).
- **Home button REMOVED from the team2v2 end card** (user reversed the §4
  three-button ruling July 5): card = Play Again + Back (Back visibility
  rules unchanged; chosen-duo guests still Play-Again-only). The NAVBAR is
  now shown on team2v2 end screens (`teamEndNavbar`, home.js) and its back
  button = straight-to-home exit for everyone. 1v1 duel end screens keep
  their card Home button (they have no lobby and no navbar).
- **End-screen "pop" (no fade on team2v2/ranked reveal) — ROOT-CAUSED +
  fix shipped July 5 late; NEEDS USER VERIFICATION on a real focused screen
  (automation browser too throttled to see the fade).** ROOT CAUSE (proven
  by DOM inventory, throttle-immune): home.js's matchmade-duel
  `<RoundOverScreen>` was PERSISTENTLY mounted with a `hidden={!...}` toggle,
  so the whole summary — including its Leaflet results map — lived in the DOM
  at `scale:0`/`opacity:0` from page load (confirmed: the `.round-over-screen
  .hidden` element + inner map exist while merely sitting in the 2v2 queue,
  no game). On reveal, Leaflet had to re-measure a viewport it first sized
  while collapsed → ~1s of blank/janky "fullscreen Map.js" (exactly the
  user's words), by which point the one-shot CSS entry `animation:
  roundOverScreenFadeIn` had already elapsed → content lands with no fade.
  WHY SINGLEPLAYER IS FINE (the user's own clue): gameUI's SP/private mounts
  are `{cond && <RoundOverScreen/>}` — FRESH mount at game-end, map inits at
  correct visible size in one commit with content ready, entry animation
  fires on real content. FIX: made home.js's mount conditional too (dropped
  the `hidden` prop; wrapped in the same gate that was inside the `!(...)`).
  Now all four RoundOverScreen mounts share the fast fresh-mount path.
  METHODOLOGY LESSON (cost 2 reverted attempts): NEVER diagnose animation/
  paint timing from the claude-in-chrome tab — it's occluded, so rAF stops,
  timers batch, CSS animations don't tick, and `getComputedStyle` opacity
  reflects a throttled clock. The earlier "~1.7s main-thread stall" was an
  occlusion artifact (a longtask observer showed NO long task; the commit is
  fast). Only throttle-IMMUNE signals are trustworthy there: MutationObserver
  fire order, `Date.now()` deltas, element existence/childCount. Two reverted
  attempts (a `revealed`-state double-rAF deferral, and an imperative WAAPI
  fade) were both chasing that phantom stall and changed nothing user-visible.
- **Play Again → queue lobby-flash FIXED (July 5 eve)** — both-ack consensus
  used to paint the staging lobby for 0–500ms (addPlayer's `game` payload is
  synchronous; `enter2v2Queue` waited on the 500ms `autoQueue2v2At` poll).
  Now: `regroupTeamFromResults` returns its lobby and BOTH the consensus
  handler and the dead-game restage fallback call `queue2v2Members(lobby)` in
  the same burst (`autoQueue2v2At` stays stamped as poll fallback only). New
  additive wire flag `queueBoundDuo` on `getInitialSendState` (set only for a
  queue-bound DUO regroup; cleared in `queue2v2Members`) lets home.js's
  `game` handler skip straight to `gameQueued:'2v2'/queueStage:'opponents'`
  without ever mounting the lobby card — flag needed because the duo's
  first-added member snapshots at players.length===1, so no roster heuristic
  can distinguish them from a solo survivor (whose lobby card MUST render for
  stage-1 teammate search). Verified e2e (scratchpad
  `playagain_flash_test.mjs`, WS_PORT=3102, full queue→match→duelEnd cycle):
  duo burst gap 0.1ms/stage opponents/flag true ×2; teammate-left solo
  play-again gap 0.1ms/stage teammate/flag false. 11/11 green.
- **Round-1 countdown "End match?" confirm + hostEndedMatch toast FIXED
  (July 5 late, user-reported)** — host back during the first 5s getready
  used to demand the full end-match confirm and toast "The host ended the
  match" at members, for a match with zero guesses. Both now use the
  server's own preGame definition (`getready && curRound <= 1`, mirroring
  teamDuel's carve-out): home.js `preGameCountdown` excludes it from
  `isHostEndMatch` (host back = silent cancel-start → resetGame), and
  ws.js's resetGame toast condition excludes it server-side. BOUNDARY THAT
  MATTERS: scoped by `curRound <= 1`, NOT all getready — the post-final
  ghost getready (curRound = rounds+1) KEEPS the confirm, it's what guards
  the results screen from a silent host reset. Member leave-confirms
  untouched (ruling: all states). Verified e2e (scratchpad
  `party_pregame_toast_test.mjs`, WS_PORT=3102, 3-guest party): countdown
  reset → zero toasts to members; mid-round (guess) reset → toast fires
  both members. 4/4 green — phase B is the control proving toast plumbing.
- **OPEN + attempt REVERTED: "White flash" leaving the 2v2 duel end screen
  (user-reported; user-diagnosed: the flash IS the final round's pano).**
  Theory tried July 5 night: `#streetview` (z-100) stays visible behind the
  end screen, overlays unmount instantly while its `.hidden` fade is 0.2s →
  added multiplayer `state === "end"` to home.js's StreetView `hidden`
  condition so the pano would already be at opacity 0 before any exit.
  USER TESTED ON A REAL SCREEN: no visible change — REVERTED (home.js back
  to `state === "waiting"` only). Open questions for the next attempt:
  (a) is the flashing surface really `#streetview`, or another layer that
  shows the pano (verify with MutationObserver + elementFromPoint DOM
  inventory at the transition — NOT paint-timing judgment); (b) does
  something re-show/remount the iframe on exit (hasLoaded churn, the
  `(!lat && !long) → null` unmount, latLong changes); (c) was the test tab
  stale (HMR trap — hard reload before trusting any repro). Full handoff
  prompt written for a fresh agent July 5 night.
### items only, dupes merged into existing entries below)
- **roundOverScreen `myTeam`-null corruption cluster** — the "no silent 'a'
  default" rule (comment ~767) protects the headline but NOT: (a)
  `renderLeaderboard` ~483 (`enemyTeam = myTeam==='a'?'b':'a'`) → with myTeam
  null, sections are [null,'a']: team A mislabeled "Enemy Team" and **team B
  matches no bucket — vanishes from Final Scores entirely** (fails the
  unknown-rows filter too, since teamOf says 'b'); (b) round breakdown
  ~1242/1296-1303 → myBest never accumulates, enemyBest collects only team-A
  points, and BOTH columns render the same wrong number. Trigger: roster
  lookup miss (fallback-derived data, race before duelEnd lands).
- **`teamDuelEndFallback.js` payload gaps** — omits `autoPaired`/`teamHostId`
  → when the fallback is the active `data`, `backVisible` (roundOverScreen
  ~1179) collapses to soloRequeue and a chosen-duo HOST loses the Back
  button; also never sets `data.winner` for cumulative teamGame → winner
  derivation falls to the fragile myTeam compare → possible "Defeat" shown
  to the winning team.
- **Stale `playAgain2v2` counter can survive into the next match** — nulled
  only in the duelEnd handler; the `"game"` merge spread (home.js ~1974)
  preserves it across matches. Invisible normally (server rebroadcasts right
  after duelEnd); transiently wrong if the fallback renders the end screen.
- **No reporting in ANY team mode** — roundOverScreen ~1212 gates Report on
  `!isTeamGame` (both origins; "team games don't offer reporting yet"), and
  reporting is wired ONLY from roundOverScreen repo-wide → the
  random-stranger mode has strictly LESS moderation recourse than 1v1.
  Related: report needs a session token (guests can never report anyone),
  and the 1v1 path doesn't gate on opponent accountId (guest opponent →
  `reportedUserAccountId: undefined`).
- ~~**Arbitrary-host kick window in stranger regroups**~~ FIXED July 5 (user
  ruling: kick disabled in ALL 2v2 staging lobbies, invited duos included —
  real parties incl. team-mode keep host kick): server `kickPlayer` guard
  gained `game.is2v2Lobby` (ws.js, covers raw messages/old clients);
  partyLobby kick button gated `!is2v2`. Original finding: matchmade teams
  have `teamHostIds` null, so `cancelTeamDuelPregame` crowns `live[0]` host
  of the 3s-beat staging lobby, and partyLobby showed Kick to any host with
  no `autoPaired` gating → a random stranger could kick their random
  teammate during the beat; victim got the nonsensical `kickedFromParty`
  toast and was NOT restaged. Same arbitrary crown in
  `regroupTeamFromResults` (window ~0 there since the instant-queue fix).
- **2v2 queue has zero identity/skill rails** — queue entry stores no
  elo/min/max (pure FIFO + `last2v2Opponents` rematch-avoid), and the per-IP
  duel throttle (`ipDuelRequestsLast10`) is not wired into
  `find2v2Match`/2v2 pairing → two tabs from one IP can be "randomly"
  paired, then farm `team2v2_wins` via stick-together Play Again. Needs a
  product call on policing level.
- **Round-timer label unbounded during ghost getready** — every multiplayer
  game end shows "Round N+1/N" for ~5-8s: gameUI ~1094-1095 (duel timer) and
  ~1110 (party two-line timer) pass raw curRound; the adjacent
  between-rounds leaderboard bounds correctly (~330-331). Cheap, fires every
  match, all modes.
- **Host disconnect while members browse FINISHED teamGame results** →
  `partyDisbanded` toast + force-home for people reading a completed
  scoreboard (removePlayer disband branch has no state check; home's
  gameShutdown exemption is public+end only). Correct lifecycle, odd
  copy/UX — product call.
- **finishTeamParty save-guard asymmetry** — checks only live `this.players`
  while finishTeamDuel also accepts `persistentPlayerData`; currently
  unreachable (removePlayer self-destructs first), bites if teardown
  ordering ever changes.
- Verified-fixed since the July 4 sweep (pruned from High UX): emote sender
  names in team2v2 — `hideName` now `duel && !team2v2` in home.js.

### Post-game / Play-Again sweep (July 5, 2026 — 5-agent end-screen audit,
### every item below hand-verified against the working tree; items marked
### FIXED above have been pruned)
- **Play Again after an UNRANKED 1v1 duel requeues into RANKED** — home.js:3676
  hardcodes `backBtnPressed(true, "ranked")` on the shared public-duel mount;
  ranked and unranked duels are created identically (`public:true, duel:true`)
  and gameData carries no ranked flag to branch on. 1v1-only (team2v2 replaces
  button1 with teamActions). Compare gameUI.js:1168's sibling using "unranked".
- **Zombie teammate carried into the rematch** — `regroupTeamFromResults`'s
  live filter is `!sock || sock.disconnected` (Game.js:1521); a half-open
  socket (no close frame — sleep/wifi drop) passes it. Both acked → requeued
  duo includes a permanently unresponsive player; nothing probes end-state
  sockets (no periodic broadcast in 'end'), so the live player fights an
  undisclosed 1v2 until uWS idleTimeout (300s, ws.js:522) + 30s purge finally
  reap. Same lens as the ws-liveness memory: presence ≠ answered round-trip.
- **No "teammate left" toast copy on the results screen** — the counter now
  updates instantly (see FIXED above: auto-paired disconnect broadcast), but
  the change is still communicated only by the numbers/button changing; no
  toast key exists for "teammate left" (checked common.json). Cheap polish:
  toast alongside the ack reset (Game.js:743-746).
- **3s pairing-beat partner disconnect leaves a ghost roster** — close handler
  doesn't removePlayer, so the vanished partner stays in the lobby snapshot;
  `queue2v2Members` filters `sock.disconnected` (ws.js:1760) and correctly
  requeues the survivor SOLO, but the client preserves stale `gameData` on
  teammate-stage `enter2v2Queue` (home.js:2019) → survivor sees a 2-player
  roster with a corpse in it for up to ~30s. Cosmetic desync, not stuck.
- **teamGame lacks the pregame no-penalty carve-out** — teamDuel routes
  waiting/first-getready leaves to `cancelTeamDuelPregame()` (Game.js:812-814);
  the teamGame arm (Game.js:819-827) has no preGame check → a leave that
  empties a team during the FIRST getready of a party = instant forfeit loss
  instead of a penalty-free regroup. Low stakes (private, no ELO) but the
  parity cluster (§1) missed this rail. July 5 eve addendum: that instant
  `end({forfeitedTeam})` also fire-and-forgets
  `saveUnrankedMultiplayerToMongoDB` → a `private_multiplayer` history doc
  with 0 rounds / 0 points for every player.
- **No leave-confirm for a LIVE matchmade team2v2** — every backBtnPressed
  confirm branch requires `!public` (home.js:2461-2506); mid-match 2v2 leave
  has zero friction while the same leave in a party teamGame gets a modal.
  Possibly deliberate parity with 1v1 ranked (which also has none via this
  path) — needs a ruling.
- **Host "Back" on the private results screen is an unconfirmed full-party
  reset** — `isHostEndMatch` requires a live round (home.js:2466,2470 excludes
  'end'), so the host's only labeled end-screen button silently `resetGame`s
  everyone, no confirm, no toast (end-state resets are silent by design — but
  that ruling predates Back being the host's ONLY button there).
- **Mobile has zero 2v2/team support** — no queue entry point, no team UI, and
  `playAgain2v2` is entirely unhandled in mobile/src/store/multiplayerStore.ts
  handleMessage (silently dropped). A mobile user CAN join a web-hosted team
  party by code (server has no client gate) and gets a broken experience
  end-to-end: DuelHUD renders 2-of-4 players' HP, results render as a 1v1
  against an arbitrary player, and "Play Again" silently requeues them into
  solo ranked/unranked (home.tsx:451-458 has no 2v2 branch). Needs either
  parity or an unsupported-mode gate before this branch ships. July 5 eve
  addenda (results.tsx specifics): live team games force `isDuel:true`
  (~461, any duelEnd) → no leaderboard and Play Again queues 1v1 RANKED; a
  private teamGame party HOST's Play Again `leaveGame()`s + requeues PUBLIC
  unranked (host destroys their own party); history replay misclassifies the
  other way (`gameType==='ranked_duel'` only) → team parties render as FFA
  with individual `finalRank` as "winner" — exactly what models/Game.js:65-67
  warns against; round rows pick "the opponent" via first `.find(id!==myId)`
  → can compare you vs YOUR TEAMMATE with fabricated ❤️ damage;
  `useReviewPrompt` fires for private team parties (misclassification defeats
  the "except private parties" intent). Ghost-getready bounding on mobile is
  CLEAN (curRound <= rounds everywhere checked).
- Minor: `shutdown()` double-sends `gameShutdown` per player (direct send at
  Game.js:1704 + removePlayer's non-quiet send at :701-705); harmless today,
  landmine if the client guard changes. `playAgainAcks[me.team][player.id]`
  (ws.js:884) trusts finishTeamDuel's seeding invariant with no optional
  chaining — a fromJSON restore with partial acks would throw into the
  swallowed catch-all.

### Critical / high (server & state logic)
- **acceptInvite rips you out of your current game unconditionally**
  (`ws.js` acceptInvite): mid-ranked-duel accept = instant forfeit with no
  confirm; if you host a party it disbands it for everyone. Client invite toast
  (`home.js` `'invite'` handler) has zero game-state awareness; **decline is a
  pure no-op** (inviter never told). Also: invite cooldown keyed per-recipient
  globally (`friend.lastInvite`) not per-pair; `acceptInvite`'s
  `games.get(player.gameId)` lacks a null guard (throw swallowed by the
  catch-all → join silently dies).
- **Cancel dead during 2v2 pairing preview**: `pair2v2Solos` sets
  `inQueue=false` for the 3s "Queueing in 3…" beat, but `leaveQueue` is gated on
  `player.inQueue` — the dissolve branch written for exactly this moment is
  unreachable. Client-side the Find Match button is disabled showing the
  countdown, so there may be no cancel affordance at all in that window.
- **Interim guess leak in team modes**: `getSendableState` serializes raw
  roster objects incl. live `.guess`; `checkRemaining`'s team-lock branch
  broadcasts it to everyone the moment one team locks — defeats `sendTeam`'s
  teammate-only scoping. Fix: `toClientPlayer()` projection stripping non-final
  guesses of other teams. (Final-guess `place` broadcasts mid-round are the
  same family, pre-existing.)
- **Mid-game join by code**: `joinGameByCode` never checks `game.state` — joiner
  lands mid-round, auto-assigned to a team, and receives the FULL `locations`
  array for unplayed rounds (`getInitialSendState`). Related:
  `persistentPlayerData` is `if(this.duel)`-gated so a teamGame mid-game joiner
  who leaves vanishes from results/save while their guesses stay in teamScores.
- **Party codes**: `make6DigitCode()` has no uniqueness check vs live games;
  no rate limit on `joinPrivateGame`/`acceptInvite` (900k codes brute-forceable).
- **PartyModal sync effect stomps unsaved team-mode picks** (`partyModal.js:23-35`):
  effect deps include `createOptions.rounds/timePerRound` — the exact values
  `commitRounds/commitTime` write; toggling Team Duel then touching the rounds
  stepper silently reverts the mode selection. Fix: sync once per open (ref).
- **Double-create race**: `navSlideOutThen` 300ms window + no re-entrancy guard
  on `createLobby`; server silently drops 2nd `createPrivateGame` (no else);
  `PartyLobby` derives `is2v2` from client `lobbyIntent`; `find2v2Match` accepts
  any ≤2-player private lobby → can dissolve a just-configured party into 2v2
  matchmaking. Also: no watchdog for a lost create (pending shell forever) —
  `createOptions.progress` was built for this and is never read (dead flag).
- **resetGame host check** missing `?.` (`game.players[player.id].host`) — the
  one handler this diff touched without optional chaining; throw is swallowed
  by the ws catch-all (`console.log(e)`) which itself masks handler bugs.

### High UX
- **Non-host players get zero labeled buttons on private-party end screens**
  (FFA and teamGame): gameUI passes `button1/2Text` gated on `public || host`;
  `teamActions` (Play Again n/m consensus) only wired for matchmade `team2v2`,
  never for `teamGame` parties. Only exit = small navbar arrow.
- **roundOverScreen JS/CSS breakpoint mismatch**: JS uses flat
  `window.innerWidth <= 1024` (9+ sites) vs CSS
  `(max-width:799px), (max-width:1024px) and (orientation:portrait)` — on
  landscape tablets/large phones clicking a round row is a DEAD CLICK
  (toggles an invisible mobileExpanded). Fix: shared matchMedia helper.
- **No toast on player join/leave** mid-game (`'player'` handler just patches
  roster); 2v2 staging host-heir promotion is silent. (Explicit host leave DOES
  toast — `partyDisbanded`/`hostEndedMatch` exist now.)
- **Disconnected players invisible in HUD**: wire roster has no `disconnected`
  field — teammates wait on "waiting for 1 player…" for a ghost through the
  whole 30s grace (or indefinitely in teamDuel rejoin-hold).
- **GameUI unmounts to generic "Connecting…" on any ws blip** (provider onclose
  resets all state) — no "reconnecting to your game" overlay despite the 30s
  server-side rejoin window. Known design (web parity), listed as improvement.
- **Blank no-history fallback**: `roundOverScreen.js` ~804-827 renders an empty
  full-screen div (its message is commented out INSIDE the live JSX).
- ~~Leaflet-not-ready early return misses the `.round-over-screen` overlay
  wrapper (renders in document flow)~~ FIXED (July 9: placeholder wrapped in
  `.round-over-screen`, joins the entry fade; same-node swap so the fade
  doesn't restart when real content lands).
- **1v1 duel end screen renders a duplicate "Final Scores" block**:
  `(!duel || finalHistory.length > 0)` contradicts its own comment; should
  exclude the duel case handled above.
- **team2v2 HUD**: `myTeam = me?.team || 'a'` can swap Your/Enemy bars
  (siblings do it right); `health={opponent?.score}` NaN path in duelHealthbar.
- ~~Emote sender names hidden in team2v2~~ FIXED (verified July 5 eve:
  home.js now passes `hideName={duel && !team2v2}`).
- **Kick confirm modal**: destructive + cancel buttons visually identical
  (Modal.js styles all action buttons the same green). Needs danger variant.
- **Join failures, two message shapes**: `joinPrivateGame` → `gameJoinError`
  hardcoded English; `acceptInvite` → localized toast keys. Standardize.
- **Invite button**: no pending/disabled state (vs Add Friend's pattern);
  client can't see who's already in the party (always shows Invite, bounces
  off `alreadyInYourGame`).
- **Start Game / Find Match**: no in-flight state (double-taps get zero
  feedback on laggy mobile; server is idempotent so cosmetic).
- **Deep-link `?party=` into a running game**: several seconds of dark blank
  screen before rendering (observed live). In-app navigation with `?party=`
  doesn't remount/reset (stale DOM until hard load).
- **ui/Modal.js scroll unlock**: trailing effect cleanup re-enables body scroll
  the instant close starts, not after the 200ms animation.

### Fairness / design (team games)
- 'closest' team scoring is best-of-N → bigger team gets more rolls; 'average'
  re-divides by LIVE headcount so totals aren't comparable across roster churn;
  Start allows 4v1 with no warning (uneven is legit for odd party sizes — a
  soft warning at diff>1 was the suggestion).

### Clutter / confusion
- 5 flat nav buttons (Ranked/Unranked/2v2/Create/Join) with zero subtext;
  "2v2 Match" label implies instant queue (lobby-first is RULED — label-only fix).
- Branding collisions: party "Team Duel" (unbounded, cumulative) vs "2v2 Match"
  (capped, HP); `yourTeam/enemyTeam` vs `Team 1/Team 2`; `findingGame` vs
  `findingMatch`; kick strings say "party" inside the 2v2 lobby; invite toasts
  say "game" while the lobby says "Party".
- Party modal: no Cancel (backdrop/ESC commits — an accidental Team Duel tap +
  outside tap = mode change + server reshuffle); backdrop/ESC bypass the Save
  button's validation gate; `setPrivateGameOptions` re-sent on every close with
  no diff (location regen risk) while `setTeamConfig` right below diffs.

### i18n
- Hardcoded with EXISTING keys: "Report player"/"Report"
  (roundOverScreen ~1241; keys at common.json 748/751), "VS" in the 1v1 round
  breakdown (~1492; key `vs` 857 — team path uses it correctly).
- Untranslated aria-labels: `aria-label="Duels"` on BOTH ranked and unranked
  buttons (identical accessible names) + `"2v2 Match"`; partyModal stepper
  aria-labels + "1-20 rounds"/"10-300 seconds" hints (need new keys).
- Orphaned keys: `chat`, `duels`, `versus` (dup of `vs`), ~20 pre-unification
  party keys (`gameLobby`, `playFriends`, `tapToCopyInviteLink`,
  `shareJoinPartyMessage`, `friendOnlineCount`, `lobbySettingsPreview`, …).

### Slop / dead code — SWEPT July 5, 2026 (all items fixed except the two
### marked SKIPPED/REFUTED below; verified: lint clean, node --check on ws
### files, sass compile, WS_PORT=3102 smoke [verify/pong/timeSync/create/join],
### home DOM probe — nav intact, empty g2_content gone, 0 console errors)
- FIXED home.js: commented showPartyCards nav + its now-empty
  `g2_content g2_content_margin` wrapper div deleted; dead `gameOver` handler
  deleted (zero senders in ws/); ~45 debug console.logs deleted (kept
  console.error, build fingerprint, debugTimeSync-gated logs; error-path
  console.log → console.error, ad timeouts/errors → console.warn); commented
  extent block, pinpoint effect, streamer link, Poki chatter cleaned. ALSO
  deleted a commented Discord webhook block that leaked a LIVE webhook URL
  (repo is public — REVOKE that webhook in Discord server settings).
- FIXED roundOverScreen: 60-line commented duplicate fallback deleted; dead
  CSS `.round-over-screen.duel`/`.fullscreen`/`.round-over-content` (+2 media
  overrides) deleted.
- FIXED dedupe: team-duel-end fallback → `components/utils/teamDuelEndFallback.js`
  (both RoundOverScreen mounts call it); partyModal → single clampRounds/
  clampTime (unified the 3 divergent empty-input fallbacks to game defaults
  5/30); eloView → module-level StatTile (2v2 tiles got their missing hover);
  gameUI guess/hint → renderGuessHintBtns() shared by desktop + mobile.
- FIXED verify/cnt/error: home's duplicate cnt/verify blocks deleted; home's
  error branch keeps ONLY ws.close() + translated toast (the close is
  LOAD-BEARING: it paces the verifyError retry — server leaves that socket
  open, no other client-side timer exists) — also fixes double signOut() on
  failedToLogin. emote/friends/settings now use subscribeMessages (emote via
  prop to preserve home's useMemo; subscription gated on enabled+inGame).
- FIXED in-render sorts (copy-before-sort), pong/lastPong (client interval
  deleted; server keeps a comment-documented early-return swallow — mobile +
  old bundles still send pong; lastPong fields removed from Player/toJSON/
  playerObj broadcast), shouldConnect (×4 writes), TeamNames compact branch
  (teams hard-capped at 2 — kept the plain stack), `.hbparent` token,
  friendModal fake modal props + dead onClose + float:right styles (kept the
  button-group divs), `.party-modal-responsive`, `.multiplayerOptionBtn`,
  `.warning-title` ×2, hb-starts dead top/right (kept the load-bearing
  `position:static !important`), `.join-party-container` merged to one block,
  `.elo-value`/`.time-elapsed`/`.elo-change` globals blocks deleted (duel.css
  owns them; its `.time-elapsed` gained the one live `font-size:1rem`),
  kickPlayer host guard in home.js, stale chat comments ×2.
- REFUTED `.badge` "fully neutralized": only playerList's copy was (inline
  style stack) — friendModal ×3 + merchModal use the bare class, so the CSS
  rule is LIVE. Fix applied: dropped the dead `badge` class token from
  playerList only. Do not delete the `.badge` rule.
- REFUTED `teammateSearch` dedup: the guard difference is intentional —
  multiplayerHome's extra `inWaitingLobby` is the documented lobby-gone →
  banner fallback; partyLobby runs inside the card where that's guaranteed.
  Left as-is.
- SKIPPED O(N) guest-reconnect scan (Player.js ~196): deliberate. It's a
  bounded early-return fallback costing microseconds even in reconnect
  storms; a rejoinCode→player index must be maintained across verify/
  reconnect/purge/destroy and a stale entry would reconnect someone into a
  LIVE player (kicking them). Risk >> reward. The logged-in accountId scan
  (~236) is the same shape — same verdict.

---

## 3. REFUTED / corrected during verification (do not re-report)
- July 5 night 2v2 sweep refutations:
  - "Reconnect mid-round drops the teammate's live pin" — WRONG: Map.js's
    teammate layer reads `p.latLong || p.guess` (Map.js:1328) and every
    snapshot serializes raw roster objects INCLUDING `.guess` (interim
    placements write player.guess, Game.js:1000; players sent wholesale,
    getInitialSendState:244). The pin survives reconnect via the fallback.
  - "build2v2Teams stale-roster stall is a bug" — its doc comment
    (ws.js:1874-1876) states the stage-2 survivor deliberately WAITS through
    the partner's 30s grace. Design, not defect (UI signal gap only). The
    stage-1 pair2v2Solos stall (§2) is the real, unintended one.
  - "teamGame mid-game joiner vanishes from results" — dupe of the existing
    §Critical persistentPlayerData duel-gate item; pruned.
- July 5 play-again sweep, verified SAFE (modulo the checkRemaining fuse above,
  which overrides all of these in practice until fixed):
  - Vote bookkeeping self-heals on every departure path: any end-state
    removePlayer wipes the leaver's team's acks and rebroadcasts
    (Game.js:743-746) — survivor's counter drops to needed=1 and becomes a live
    solo requeue. No infinite "(1/2)" wait exists in the vote logic itself.
  - Ack-then-disconnect can't mint a phantom duo: the regroup live filter drops
    detected disconnects; survivor requeues solo into stage-1 teammate search.
  - Votes are team-scoped; opponents leaving never touches your team's acks
    (Game.js:1497-1501 keys off leaverTeam).
  - Reconnect can't double-count: acks are idempotent booleans keyed by the
    stable reused Player id; rejoinGame replays lastTeamEnd + current ack state.
  - Home always escapes: backBtnPressed does full local teardown without
    waiting for any server ack (home.js:2535-2568).
  - "2h sweep auto-starts a new round for private parties" — WRONG: resetGame
    sets state='waiting' and the loop's auto-start gate requires game.public
    (ws.js:1896); private parties bounce to lobby, they don't start rounds.
- "ELO/time text invisible black-on-dark" — `duel.css` (imported after
  globals.scss) overrides to #fff/#ccc. Residue = the conflicting dupes.
- "Duel header never compacts on mobile" — duel.css ≤1024px compacts it.
- "Blank multiplayerHome if ws drops on join screen" — provider onclose resets
  `lobbyIntent`, banners return.
- "Non-hosts stuck 2 hours on end screen" — navbar back arrow exists
  (`shown={!gameData?.duel}`); real issue = no labeled button (see OPEN).
- "2v2 end screen 3 stacked exit buttons is a bug" — RETRACTED: comment
  documents "Replaces button1; Home (button2) stays." Optional polish: rename
  Back → "Team Lobby".
- "Queue double-registration teleport" — `Game.addPlayer` line ~202 sets
  `inQueue=false` and every pairer re-checks the flag; not reachable live.
  (Hardening applied anyway, see §1.)
- "Save race on fresh parties" — real but window = one WS round-trip; only
  changes made inside it are lost; lobby chips self-reveal. LOW/optional.
  Dead `createOptions.progress` flag still deletable slop.
- "Scorebar vs timer collide at 541-830px" — overstated (geometry collides only
  <~570px); the REAL both-platforms overlap was scorebar + between-rounds
  leaderboard hero (fixed).
- "Block unbalanced team start" — wrong frame: uneven teams are legit for odd
  party sizes; the fairness note (scoring) stands.

## 4. User rulings (design decisions — respect these)
- **July 9: reporting is HISTORY-VIEW ONLY (cooling-off, anti-spam).** The
  detour through the game-history tab is deliberate friction so a fresh loss
  can't be rage-reported from the live end screen. Web's live end-screen
  report button (1v1 + the new 2v2 picker) was gated to
  `options?.isHistoryView` (`roundOverScreen.js`, flag stamped by
  `historicalGameView.js`); mobile's existing flow was already
  `isHistoryView`-only and stays that way (parity plan Phase 4 item 4
  REVERSED from "widen to live end card"). The `duelEnd`
  `historyGameId`/`opponent` stamps are KEPT: they fix the saved-doc id for
  matchmade games (code=null), feed the copy-game-ID surface, and keep the
  wire shape; they just no longer drive a live report path.
- July 5 night sweep rulings: early-KO dead-air (full getready beat after HP
  hits 0) = INTENDED behavior, keep. Navbar-Back-vs-card-Cancel asymmetry in
  stage-1, find2v2Match watchdog absence, stage-2-only rejoin re-sync, and the
  chosen-duo 30s grace dead-air = NOT bugs, leave as-is. result.winner=top
  scorer in team parties = not a bug, leave. Pairing-beat DC stall, forfeit
  totals/history mismatch, and restart queue-state cleanup+toast = FIXED (§2
  FIXED block).
- Queue-screen Cancel: REVERSED July 5 late — earlier lean was "unify by
  adding Cancel to the 1v1 banner"; user ruled the in-banner button "just
  looks bad" — DELETED from the 2v2 banner instead. The navbar back button is
  the one queue exit (verified: identical backBtnPressed handler, navbar
  visible on queue screens since gameData is null there). Do not re-add
  in-banner cancel buttons.
- Host disconnect/leave = party disbands. Intended, keep.
- 2v2 nav button = lobby-first, NOT instant queue. Intended, keep.
- ~~End-screen 3 buttons (Play Again / Back / Home) = keep as designed.~~
  REVERSED July 5: team2v2 end card = Play Again + Back only; navbar back
  button (now shown on team2v2 end screens) is the straight-to-home exit.
  1v1 duel cards keep Home. Chosen-duo friend DC keeps the 30s grace in the
  Play Again counter; random pairings dissolve instantly (user rulings).
- "Edit Options disabled while Generating… explanation in footer" = not a bug.
- Team Final Scores keep GLOBAL rank numbers (+ caption added).
- +Δ badge: NO background chip; keep slide-up feel, slower, must not overlap
  the score text (v3 shipped).
- Crowns: leading team in pill + between-rounds hero; winner on end screen.

## 5. Verification lore (how to re-test)
- Private server: `WS_PORT=3102 node ws/ws.js` (never share 3002 — instances
  co-bind on Windows and split traffic).
- Bots: `node scripts/bot2v2.js --party N [--rounds R --time S]` (auto-loops
  games), `--join CODE --bots N` to fill a hand-made party. Party code prints
  in output. Bots verify as guests (`secret:'not_logged_in'`).
- e2e forfeit/purge test: scratchpad `teamgame_forfeit_test.mjs` (4 raw guest
  WS clients; X1 perfect-guess-then-die round 1, X2 die round 2, host team
  withholds guesses so the round outlives the 30s purge).
- Static CSS repro harness: compile `npx sass styles/globals.scss out.css`,
  serve scratchpad over localhost (file:// is blocked), measure with
  getBoundingClientRect via javascript_tool. Background tabs throttle
  setInterval AND the leaderboard's own timers — use MutationObserver or
  un-occlude the window; screenshots still capture while throttled.
- Known pre-existing: Leaflet `'save'` TypeError overlay at round end (dev
  only); stale HMR tabs need hard reload; `.topAdFixed.moreDown` shifts the
  in-game ad to top:100 at ≤700px when any timer is shown.
