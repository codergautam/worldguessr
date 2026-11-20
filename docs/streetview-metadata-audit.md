# Street View answer exposure audit (#151)

Reviewed on 2026-10-29 against `master` at
`e6b74d6cbbf644b5f1960af71c4310141bff8ec1`.

This is an investigation and implementation proposal for
[issue #151](https://github.com/codergautam/worldguessr/issues/151), not an
anti-cheat implementation. The current clients receive answer coordinates
before guessing. Removing a metadata field from one viewer cannot secure those
other paths. No production code or provider configuration is changed here.

## Dependency: PR #150 is not a working server-round base

[PR #150](https://github.com/codergautam/worldguessr/pull/150) is open and
unmerged. Its inspected head is `7eb23ea1c8d575f52fea114348bd19d2df8de46f`.
Its description still describes server-authoritative rounds, but the current
diff against its base contains only two whitespace replacements in
`components/streetview/svHandler.js`.

The original implementation is in
[`5734f153`](https://github.com/despossivel/worldguessr/commit/5734f1538fbcb3aad3153e29bc50592eb2b52b84).
The merge was reverted by `8bf97380`, subsequently merged in `7eb23ea1`.
The historical `models/GameRound.js`, `serverUtils/gameRounds.js` and
`api/rounds*` handlers are absent from both the PR head and current upstream
`master`. The historical work belongs to the PR author; it has not been copied
into this contribution.

There is no suitable #150 head on which to stack the proposed viewer today.
This document is based on upstream `master`, independently of the menu-order
tests in PR #156. An implementation needs a restored/rebased, reviewed
server-round foundation or a separately agreed replacement first.

Other relevant work:

- [PR #95](https://github.com/codergautam/worldguessr/pull/95) is open. Its diff
  adds coordinate encoding/decoding to the legacy iframe wrapper. Since the
  player receives the decoder, this is not a secrecy boundary. The current
  home screen no longer uses that wrapper.
- [PR #34](https://github.com/codergautam/worldguessr/pull/34) was merged in
  2024. Removing a console message and limiting XP requests did not remove
  answer data from the client.
- No additional metadata-protection PR was found in the inspected open PRs
  and metadata/cheating searches. This is a search result, not an assertion
  that no other work exists.

## Threat model

The player controls their browser/app and can inspect application state,
bundles, URLs, HTML, WebView bridges, network bodies, headers and logs. Hidden
iframes, native rather than browser requests, CORS, TLS and reversible
obfuscation do not hide data from that player. Panorama IDs are provider
identifiers, not secrets: an ID can be correlated with provider metadata.

The protected value is the server's canonical answer for an uncompleted round,
including future rounds. Visible photographic clues remain part of the game.
The displayed panorama's camera coordinates and the game's stored answer may
differ because of snapping; leaking either is relevant, but they must not be
described as necessarily identical.

## Current data flows

Paths below refer to the audited commit. Static inspection is distinguished
from the local traffic observations in the validation section.

| Flow | Before the guess | Scoring and reveal | Source |
| --- | --- | --- | --- |
| World, country and community maps | Public location-pool responses contain coordinates; clients select and retain round locations. The map extent is not the only geographic data returned. | Web/mobile calculate local round results. Single-player persistence accepts client-provided actual coordinates and points, with XP caps rather than an authoritative round lookup. | [server.js](../server.js), routes `/allCountries.json`, `/countryLocations/:country`, `/mapLocations/:slug`; [home.js](../components/home.js); [mobile game](../mobile/app/game/%5Bid%5D.tsx); [locationPool.ts](../mobile/src/services/locationPool.ts); [storeGame.js](../api/storeGame.js) |
| Country/continent guessing | The current location and its country are already in client state, which supplies the correctness decision. | The client constructs the result and proceeds to the next location. | [home.js](../components/home.js), `countryGuesser`; [useCountryGuesserGame.ts](../mobile/src/hooks/useCountryGuesserGame.ts) |
| Daily Challenge | The locations endpoint returns the whole day's coordinates, countries, headings and scheduled meta tips, along with a session token. Both clients retain them. | `normalizeDailyRounds` recomputes distance from canonical locations, but clamps the submitted score instead of deriving it from that distance. The token signs date/time, not an owned per-round capability. | [locations.js](../api/dailyChallenge/locations.js); [dailyChallenge.js](../serverUtils/dailyChallenge.js); [normalizeDailyRounds.js](../serverUtils/normalizeDailyRounds.js); [web hook](../components/daily/useDailyChallenge.js); [mobile daily](../mobile/app/daily/index.tsx) |
| Onboarding | Landmark answers are embedded in web/mobile source and selected on the client. | Local evaluation and result presentation. | [home.js](../components/home.js), `startOnboarding`; [onboardingLocations.ts](../mobile/src/shared/data/onboardingLocations.ts); [onboarding play](../mobile/app/onboarding/play.tsx) |
| Ranked/unranked, 2v2 and parties | Initial WebSocket game state includes `this.locations`; updates can include it too. Reconnection is another pre-guess exposure path, including future locations. | Unlike single-player, `Game` already computes multiplayer scores server-side and checks guessing phase, player membership, final status and optional round number. It also sends result/history data. These checks do not make the earlier location payload secret. | [Game.js](../ws/classes/Game.js), `getInitialSendState`, `getSendableState`, `setGuess` and scoring methods; [websocket.ts](../mobile/src/services/websocket.ts); [home.js](../components/home.js) |
| Moving Street View | Web builds a Google Embed URL containing `location=lat,long`; mobile puts the same information in generated HTML. Google handles movement and issues its own metadata requests. | The same location remains available when the answer UI is shown; there is no first-release-of-answer boundary. | [streetView.js](../components/streetview/streetView.js), `buildSrc`; [StreetViewWebView.tsx](../mobile/src/components/game/StreetViewWebView.tsx), `buildStreetViewHtml` |
| Google No Move / NMPZ | Web resolves coordinates through `StreetViewService`, then fetches tiles and positional JSON from `photometa/v1`. `fetchMetaGoogle` explicitly reads panorama latitude/longitude. Mobile resolves natively with `GeoPhotoService.SingleImageSearch`, then injects coordinates and the fresh pano ID into its WebView. | No Move allows pan/zoom; NMPZ freezes input until reveal. Google movement links are not implemented by this renderer. | [customStreetView.js](../components/streetview/customStreetView.js), `resolvePanoId`, `fetchMetaGoogle`; [CustomStreetViewWebView.tsx](../mobile/src/components/game/CustomStreetViewWebView.tsx); [svEntry.jsx](../embed/svEntry.jsx) |
| ChinaGuessr | `/chinaLocations` returns coordinates and Baidu IDs. Its separate provider adapter consumes position/navigation metadata. | Uses the existing client/result flow; a Google-only change would leave this route exposed. | [server.js](../server.js); [baidu.js](../components/china/baidu.js); [customStreetView.js](../components/streetview/customStreetView.js); [svNavOverlay.js](../components/streetview/svNavOverlay.js) |

`svHandler.js` still contains coordinate-bearing URLs and `postMessage`
payloads, and `/svEmbed` accepts them. However, `home.js` comments out that
wrapper's import and uses `StreetView` directly. Fixing only the starting paths
listed in the issue would miss the active home path.

Additional surfaces to include in any implementation:

- Preloaded panoramas, reserved next locations and the mobile location pool
  expose future rounds before they become visible. A loading cover is not a
  security boundary.
- `components/gameUI.js` requests `/api/clues/getClue` with the current answer
  coordinates. Hints and clue lookup need a round-based server contract too.
- `components/findLatLong.js` logs its candidate data and failed panorama
  responses. `customStreetView.js` can construct an error containing the
  coordinates and log it. Restricting normal success logs is insufficient.
- `mobile/src/utils/streetViewUrl.ts` builds explicit coordinate/pano links
  for opening a revealed location. This is not the active WebView URL builder;
  keep legitimate post-reveal links rather than changing this utility alone.

## Navigation, unavailable panoramas and platform differences

The moving Google iframe owns its navigation graph. Filtering WorldGuessr's
API cannot filter requests made inside that provider-controlled document.
The in-house Google renderer currently serves No Move/NMPZ, not a replacement
for that graph. `svNavOverlay.js` is a Baidu/ChinaGuessr overlay: it consumes
provider IDs, bearings and local ground geometry, rather than supplying a
Google navigation implementation.

Current recovery depends on coordinates. Web resolves fresh panoramas near
them using a narrow then wider search. The custom renderer has degraded-load
and timeout paths. Mobile caches native resolution promises, drops failed
lookups, rejects stale async results, and falls back from its failed custom
viewer to the coordinate-based iframe for that round. A secure viewer must not
retain that fallback. Simply dropping coordinates would break these paths.

Android and iOS share the React Native URL/bridge code; neither platform keeps
those values secret from its owner. Their WebView networking, CORS/origin,
process-recovery and loading behavior still require separate device tests.
Web portal variants reuse these viewers; their accountless identities require
an explicit anonymous round-ownership design. No claim about published app
binaries or production deployment follows from this source review.

## Provider feasibility and conditions

Google's documented [Street View Tiles API](https://developers.google.com/maps/documentation/tile/streetview)
supports custom rendering and adjacent-panorama links. Its metadata includes
coordinates and address information. Client-side metadata filtering does not
hide the received body. Direct tile requests also disclose pano IDs. The
[Static API metadata endpoint](https://developers.google.com/maps/documentation/streetview/metadata)
accepts a pano ID and returns a location, so retaining provider IDs leaves a
correlation route.

The [Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies)
require visible attribution and a report-problem link; the documented link
contains the pano ID. They also constrain storage and caching. Removing that
link to conceal the ID is not an acceptable default. The
[platform terms](https://cloud.google.com/maps-platform/terms), especially
3.2.3, restrict scraping/rehosting, caching, result modification and use with
non-Google maps. The
[service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
and billing region can affect applicability. A generic sanitizing imagery
proxy is not established as permitted by these documents; the maintainers
must confirm their applicable agreement and intended use, including Leaflet.

This is a technical integration gate, not a legal determination that every
proxy or custom viewer is prohibited. Documented custom rendering exists;
permission to hide every correlatable provider identifier is a separate issue.

Map Tiles also requires [billing-enabled credentials](https://developers.google.com/maps/documentation/tile/usage-and-billing).
This repository has no Map Tiles server adapter to reuse. No project was
enabled, credentials reused for a new service, or paid deployment created.
Provider [sessions have an expiry field](https://developers.google.com/maps/documentation/tile/session_tokens);
pano IDs can also stop resolving independently of that expiry.

## Proposed sequence, pending maintainer decisions

1. Restore/split the authoritative-round work on current `master`, with tests
   and a supported-client migration plan. Own answers, rules, hints and scores
   on the server; stop sending complete location arrays. Do not duplicate the
   reverted #150 implementation in a viewer PR.
2. Decide whether the goal is a bounded mitigation with Google's required
   provider identifiers still exposed, or a stricter provider-isolated design.
   The latter requires a compatible provider agreement/delivery mechanism, or
   suitably licensed imagery under the project's control. It cannot be
   promised from the current iframe/undocumented-endpoint integration.
3. After those decisions, define a shared rendering contract. A candidate
   client payload contains an opaque owned round/view handle, dimensions,
   orientation, permitted controls, approved attribution, and authorized
   neighbor handles/bearings. Coordinates, answer country, scoring inputs,
   raw provider metadata/IDs and credentials stay server-side before reveal,
   subject to the unresolved provider-attribution requirement above.
4. Navigation requests must resolve only a neighbor capability minted for that
   round and current view. The server validates ownership, adjacency, mode,
   phase and expiry. Responses use an explicit field allowlist and must not
   leak data through redirects, cache validators, error bodies, tile URLs,
   image metadata, attribution links or bridge events. Browser-direct provider
   navigation remains outside this boundary.
5. Resolve invalid/expired provider IDs server-side from the canonical
   location. Renew provider sessions using their returned expiry. Use bounded
   retries; on permanent failure atomically invalidate/replace the round and
   its capabilities without revealing it or accepting a delayed guess against
   the replacement. Never fall back to client-side coordinate resolution.
   Preserve the outgoing rendered pano until a destination is ready.
6. Keep reveal eligibility server-side. In multiplayer, one player's final
   guess must not reveal an answer to other active players before the agreed
   reveal phase. Reject cross-owner, stale, duplicate and closed-round
   operations. Reconnection and preloading need the same rules.

There is intentionally no provisional viewer, proxy, configuration switch or
partial coordinate-removal patch here. Without the foundation and provider
decisions, those changes would either break current clients or leave a direct
answer path while implying protection they do not provide.

## Validation and safe reproduction

Only local development games were inspected. No live competitive game,
foreign round, production account or third-party protected data was queried.
No HAR, provider response body, coordinate value, pano ID or credential is
included in this contribution. Local traffic summaries retain status codes,
endpoint names and exposure booleans only.

- A local World single-player game returned `/allCountries.json` with numeric
  coordinate fields before any guess, and created a coordinate-bearing Google
  iframe URL.
- Chromium observed HTTP 200 `GetMetadata` responses during Moving mode and
  HTTP 200 `photometa/v1` responses after selecting No Move. A successful status
  or absent named `lat` fields is not proof of safety: these protocols use
  positional data. The local metadata parser did not establish a coordinate
  pair in the captured `photometa/v1` body. The source parser explicitly reads
  such a pair; live extraction from that body is not claimed.
- Existing focused suites for daily-result privacy, guest daily claims,
  repeated locations, round timers and Baidu panoramas: **62 passed**.
- Four temporary Node probes with synthetic locations also passed: the real
  initial/update multiplayer serializers include unplayed coordinates; the
  daily GET handler returns answers before submission; daily normalization
  retains a submitted maximum score despite a distant guess. These
  characterize existing vulnerabilities, not desired regression invariants,
  and are not added to the permanent test suite.
- `pnpm test` on upstream `master`: **870 passed, 1 failed**. The existing
  `test/botUtils.test.js` damage-cap test exceeded its 5000 ms timeout. No code
  or tests in that area were changed.
- Android/iOS execution, portal deployments, multiplayer traffic, invalid-ID
  recovery and an official Map Tiles integration were not exercised. The
  authorization and expiry design above is proposed, not passing test coverage
  for nonexistent endpoints. No runtime regression tests are added for this
  documentation-only contribution.

Manual reproduction on an authorized local instance:

1. Install the locked workspace with pnpm 9.15.9 and run `pnpm run dev`.
   Preserve running development servers; no production or embed rebuild is
   required for this audit.
2. As a local guest, finish/skip onboarding normally, open Singleplayer on
   World, and observe the location-pool response and iframe parameters before
   clicking Guess. Record only field names and boolean findings.
3. Open the World/map options and choose No Move or NMPZ. Observe the metadata
   request in Network and review the corresponding source parser. Do not
   interpret an HTTP 200 alone as proof that image loading succeeded.
4. On a locally configured daily game inspect the locations payload before
   submission; on two owned local multiplayer clients inspect initial and
   reconnect `game` payloads. Do not use someone else's round to test access.
5. Before a future implementation is accepted, test all modes and clients for
   cross-owner/closed/expired access, atomic guess versus replacement races,
   no pre-guess answer in every response/URL/bridge/log, correct reveal timing,
   allowed navigation, No Move/NMPZ restrictions, provider failure and preload
   behavior. Inspect real provider traffic as well as isolated API tests.

## Questions for maintainers

> PR #150 is still open, but its current head includes the revert of the
> server-round implementation and its net diff is whitespace-only. Is there a
> replacement branch or planned split to use as the foundation? For #151, is
> the intended goal a mitigation that retains Google's required pano-ID-bearing
> links, or is there an approved provider agreement/imagery source for opaque
> server-managed rendering and navigation? Please also confirm the reveal
> policy for multiplayer and the migration policy for shipped mobile clients.
