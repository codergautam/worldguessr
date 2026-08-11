# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Casual-first, competitive second (confirmed).

- **Primary: casual players.** A large share are school students on Chromebooks, arriving through worldguessr.com or embed portals (CoolMath Games, Poki, CrazyGames). Short sessions, often on weak hardware and filtered school networks. Many play as guests without accounts.
- **Secondary: competitive duel players.** The ranked ELO population: placements, leagues, 1v1 and team duels, parties. Smaller in volume, core to retention and the Discord community.

## Product Purpose

A free-to-play geography guessing game inspired by GeoGuessr: players are dropped into Google Street View anywhere on Earth and guess the location on a map. Exists to make world-exploration play free and unlimited. Success is session volume and retention on the casual side, and sustained ranked engagement on the competitive side.

## Positioning

Free and unlimited where GeoGuessr meters play. Built on the free Street View embed API (plus an in-house WebGL SV renderer for NM/NMPZ modes) instead of the costly SDK, so unlimited play is economically sustainable. Source-available for noncommercial self-hosting. No paywall on core play; revenue is ads plus cosmetic purchases.

## Operating Context

- Browser at worldguessr.com, and embedded inside partner portals (CoolMath, Poki, CrazyGames), each with its own build and UI restrictions.
- Native mobile app (Expo/React Native, iOS + Android) in `mobile/`, which renders shared map surfaces through a bundled WebView embed (`embed/` → `mobile/src/generated/embedHtml.ts`).
- Real-time multiplayer over a dedicated WebSocket server (`ws.js`); separate API, auth, and cron processes.
- Community lives on Discord. Daily challenge and streaks create a daily ritual.
- Low-end hardware is normal, not an edge case: performance work assumes school Chromebooks ("potato mode" simulation exists for this).

## Capabilities and Constraints

Confirmed functionality: singleplayer (world/community maps, NM/NMPZ), country streaks, CountryGuessr mode, daily challenge with leaderboard, ranked duels with ELO/placements/leagues, 2v2 and intra-party team duels, parties with chat, friends system, community map browsing/creation, cosmetic shop (marker pins, name glows, stamps, backgrounds), user profiles with history, guest play with optional Google/Apple sign-in.

Binding constraints (confirmed as the full set):

1. **Ad revenue is load-bearing.** Never strip or degrade ads to solve another problem; audit ad quality instead.
2. **School-friendly content rules.** Public chat is preset-emote only (no free text), server-validated. Content must stay safe for school filters.
3. **Embed partners restrict UI.** CoolMath/Poki builds strip account UI (`HIDE_ACCOUNT_UI`); partner requirements bind those builds.
4. **Web-to-mobile parity is mandatory.** A web change is not done until `mobile/` matches, in the same task.
5. **Noncommercial source-available license.** Free to self-host noncommercially; the public repo must not carry private planning docs.

## Brand Commitments

- Name and logo: WorldGuessr (`public/logo-*.png` variants, light/dark).
- Typefaces in use as identity: Jockey One (display) and Lexend (text).
- Map pins are PNG image assets only, never SVG or glyph markers (87x131 art on a 151x163 glow-padded canvas, `public/pins/`).
- User-facing copy: plain language, short sentences, no em dashes; playful but school-safe tone.

## Evidence on Hand

- Live product at worldguessr.com; Discord community at discord.gg/yenVspFmkB.
- README.md with feature list and acknowledgements.
- Real gameplay systems and data (ELO seasons, daily challenges, shop catalog) in-repo; no fabricated testimonials or press exist, and none should be invented.

## Product Principles

1. **Free stays free.** Core play is never gated; ads and cosmetics fund it.
2. **Runs on anything.** School Chromebooks and low-end phones are first-class targets; performance regressions are product regressions.
3. **Web leads, mobile matches.** The web app is the source of truth; mobile ships the same experience in the same change.
4. **School-safe by default.** Chat, content, and ads must survive a school filter without killing revenue.
5. **Competitive depth without scaring casuals.** Ranked systems (placements, bots for newcomers) onboard gently; casual play never requires them.

## Accessibility & Inclusion

No formal standard adopted. Established requirements: copy readable by school-age players (plain language rule above) and playability on low-end hardware and touch devices.
