# Game Modes & Gameplay

## Scoring System

### Point Calculation Formula
```
distance = haversine(actualLat, actualLon, guessLat, guessLon)  // in km
points = 5000 * e^(-10 * (distance / maxDist))

// Adjustments:
if (usedHint) points = points / 2         // 50% penalty for using hint
if (points > 4997) points = 5000          // Round up near-perfect
if (distance < 0.03 km) points = 5000     // Perfect score if < 30m
points = Math.round(points)
```

### Haversine Distance Formula
```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRadians = (deg) => deg * (Math.PI / 180);
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}
```

### maxDist Values
- **World map ("all")**: 20,000 km
- **Country maps**: Varies per country (from `countryMaxDists.json`)
  - Examples: Argentina 3,720km, Australia 4,600km, Austria 577km, Brazil 4,670km
- **Community maps**: Auto-calculated from map spread (max distance between any two locations)

### XP Calculation
```
roundXp = Math.round(points / 50)     // Max 100 XP per round
totalXp = sum of all roundXp           // Max 500 XP per 5-round game
```
- Only awarded for **official maps** (not community maps)
- Only awarded for **logged-in users**
- Multiplayer: XP = Math.min(Math.floor(points / 50), 100) per round

---

## Game Mode 1: Singleplayer

### Overview
- 5 rounds, no time limit
- Player vs. the map
- Client-side game logic (no server involvement during gameplay)
- Results submitted to server at end (for XP and history)

### Flow
```
1. Player clicks "Singleplayer"
2. Screen changes to singleplayer
3. Load first location:
   a. If map="all": fetch random location from pre-loaded world locations
      - Uses Google Street View API to find valid panorama
      - Radius: 1000m, preference: BEST, source: OUTDOOR
      - Filters out trekker coverage (no location.description)
      - Exception: Mongolia (MN) and South Korea (KR) don't require description
      - Retries until valid panorama found
   b. If country map: fetch from /countryLocations/{code}
   c. If community map: fetch from map's location data
4. Display Street View panorama
5. Player explores and places pin on guess map
6. Player presses "Guess"
7. Calculate points (client-side calcPoints function)
8. Show answer: actual location, guess location, distance, points
9. Player presses "Next Round"
10. Repeat steps 3-9 for remaining rounds
11. After round 5: show RoundOverScreen with total score
12. Submit game to /api/storeGame (if logged in)
```

### Location Loading (findLatLongRandom)
```javascript
// For "all" mode:
1. Generate random point using getRandomPointInCountry()
2. Call Google Street View Service: getPanorama({
     location: { lat, lng },
     preference: BEST,
     radius: 1000,
     sources: [OUTDOOR]
   })
3. If OK: get actual lat/lng from panorama location
4. Find country code via findCountry()
5. Filter out trekker coverage (reject if no description)
6. Return { lat, long, country }
7. If not OK: retry with new random point

// For country/custom maps:
1. Locations are pre-fetched from API as array
2. Randomly select from array
3. Each location has: lat, lng, optional panoId, heading, pitch
```

### Country Streak
- Active when playing "all countries" map
- Tracks consecutive correct country guesses
- Streak counter shown in UI
- If wrong country: streak resets, option to "save" via rewarded ad
- Stored locally (not server-side)

### Game Options
| Option | Values | Default | Effect |
|--------|--------|---------|--------|
| location | "all", country code, map slug | "all" | Which map to play |
| rounds | Always 5 in SP | 5 | Number of rounds |
| showRoadName | boolean | true | Show/hide road labels in Street View |

---

## Game Mode 2: Public Unranked Multiplayer

### Overview
- Multiple players (2-100)
- Timed rounds (default 30 seconds)
- Accumulating score (sum of all round points)
- No ELO effect
- XP awarded
- Players can join mid-game

### Flow
```
1. Player clicks "Play Online"
2. WebSocket sends: { type: "unrankedDuel" }
3. Server matches with other queued players (or creates game when 2+ ready)
4. Server sends: { type: "game", ...gameState }
5. Game state machine begins:

   WAITING → (auto-starts when matched)

   GETREADY (5 seconds)
     - Countdown shown to players
     - Locations sent to clients

   GUESS (30 seconds default)
     - All players see same Street View location
     - Players place guesses on map
     - When guess finalized: broadcast to all
     - Timer counts down
     - Optimization: if all players guessed, timer shortens to 1 second
     - If only 1 player remaining for >20s, cut to 20s

   GIVE POINTS → SAVE ROUND
     - Points calculated for each player
     - Leaderboard updated
     - Round history saved

   NEXT ROUND (10 second wait, 5s for last round)
     - Show round results: all guesses on map
     - Points earned per player
     - Back to GETREADY for next round

   END (after all rounds)
     - Final standings
     - XP awarded to logged-in users
     - Game saved to database
```

### Mid-Game Joining
- New players can join if:
  - Game has < 10 players
  - At least 3 rounds remaining
  - Game is public and not a duel

### Scoring
- Standard point calculation per round
- Total = sum of all rounds
- Max per game = 5000 * rounds

---

## Game Mode 3: Ranked Duel

### Overview
- Exactly 2 players
- Timed rounds (60 seconds)
- Health-based scoring (both start at 5000 "health")
- ELO rating affected
- No XP awarded
- ELO-based matchmaking

### Health System
```
Both players start at 5000 health.
Each round:
  1. Both players' points calculated normally (0-5000)
  2. Point difference = |player1_points - player2_points|
  3. Loser of round loses health equal to point difference
  4. If either player's health reaches 0: game ends immediately

Example:
  Round 1: P1 gets 4500, P2 gets 3000
  → P2 loses 1500 health (5000 → 3500)
  → P1 stays at 5000

  Round 2: P1 gets 2000, P2 gets 4800
  → P1 loses 2800 health (5000 → 2200)
  → P2 stays at 3500

  Game continues until a player hits 0 or all rounds played.
```

### Matchmaking
```
1. Player sends: { type: "publicDuel" }
2. Server checks:
   - Player has account (not guest)
   - Player has ELO rating
3. Server puts player in queue with ELO range based on league:
   - Initial range from league definition
   - After 10 seconds: range expands to [0, 20000] (accept anyone)
4. Matching criteria:
   - Both players' ELOs fall within each other's ranges
   - Both non-guest OR both guest
   - Not same opponents as last duel (within 60 seconds)
5. When matched: create game with both players
6. If both ELOs > 2000: use harder world map (arbitrary locations)
```

### ELO Calculation
```javascript
// Standard Elo rating formula
// K-factor and exact formula in calculateOutcomes utility
// At game end:
if (draw) {
  p1.elo += drawDelta.p1  // Small adjustment toward each other
  p2.elo += drawDelta.p2
} else {
  winner.elo += winDelta    // Positive change
  loser.elo += loseDelta    // Negative change
}
// Bigger swings when rating difference is larger
// Lower-rated player gains more for beating higher-rated
```

### League System
| League | ELO Range | Badge |
|--------|-----------|-------|
| Trekker | 0 - 1999 | grey |
| Explorer | 2000 - 4999 | bronze |
| Voyager | 5000 - 7999 | gold |
| Nomad | 8000+ | diamond/blue |

### Early Leave Handling
```
If player leaves during GETREADY (before any guesses):
  → Game CANCELLED
  → No ELO penalty for either player
  → Remaining player gets "gameCancelled" message
  → Remaining player auto re-queued

If player leaves during GUESS or later:
  → Opponent wins by forfeit
  → ELO updated as if normal win/loss
  → Disconnected player tracked for 30 seconds (can rejoin)
```

---

## Game Mode 4: Private Game (Party)

### Overview
- 2-100 players
- Customizable settings (rounds, time, map, modes)
- Host controls everything
- 6-digit game code for joining
- Can be replayed (host resets)
- No ELO effect
- No XP awarded (unless using official maps in certain configs)

### Flow
```
1. Host clicks "Play with Friends"
2. WebSocket sends: { type: "createPrivateGame" }
3. Server creates game with 6-digit code
4. Host sees lobby with:
   - Game code to share
   - Player list
   - Settings controls
   - "Start" button
   - "Invite Friends" button
5. Other players join via:
   - Entering code (joinPrivateGame)
   - Accepting invite (acceptInvite from friend)
6. Host configures settings:
   - Rounds: 1-20 (default 5)
   - Time per round: 10-300 seconds or unlimited (86400s)
   - Map: any map (official, country, community)
   - No Move (NM): disables street view movement
   - No Pan/Zoom (NPZ): disables camera controls
   - Show Road Names: toggle
7. Host clicks "Start" → game begins
8. Same flow as multiplayer (GETREADY → GUESS → POINTS → NEXT)
9. After all rounds: show standings
10. Host can "Reset" → back to lobby for another round
```

### Game Settings Validation
```
rounds: 1-20 (integer)
timePerRound: 10-300 seconds, or 86400 (unlimited)
location: "all", valid country code, or valid map slug
nm: boolean (no move)
npz: boolean (no pan/zoom)
showRoadName: boolean
displayLocation: string, max 30 characters
```

---

## Game Mode 5: Onboarding (Tutorial)

### Overview
- First-time user experience
- 5 guided rounds
- Country selection hints
- Educational feedback
- Stored in localStorage as `onboarding_done`

### Flow
```
1. First visit detected (no onboarding_done in storage)
2. Show onboarding screen with country buttons
3. User selects a country or gets random location
4. Simplified game: just guess on map
5. After guess: show distance, points, educational info
6. After 5 rounds: show completion screen
7. Set onboarding_done = true in storage
8. Navigate to home screen
```

---

## Common Game UI Elements

### During Guessing
- **Street View**: Full screen panorama
- **Mini Map**: Collapsible map overlay (bottom-right on web)
  - Pan and zoom to place pin
  - Pin placement = tap on map
  - "Guess" button appears when pin placed
- **Round Indicator**: "Round X / Y" (top-left)
- **Score Display**: Running total (top-right)
- **Timer**: Countdown in multiplayer (top-center)
- **Hint Button**: Shows country hint, halves points (singleplayer only)
- **Compass**: Directional indicator

### After Guessing (Answer View)
- **Full Map**: Shows actual location (green) and guess (red)
- **Distance Line**: Connects actual to guess
- **Distance Text**: "X km away"
- **Points**: "+XXXX points"
- **Next Button**: Proceed to next round

### Round Over Screen
- **Score Summary**: Total points with animated counter
- **Round List**: Expandable list of all rounds
  - Each round: mini map thumbnail, distance, points
- **XP Earned**: If applicable
- **Action Buttons**: "Play Again", "Home"
- **Share**: Share results
- **Report**: Report player (multiplayer only)

### Multiplayer-Specific UI
- **Player List**: During lobby, shows all players
- **Chat Box**: In-game chat (500ms rate limit, 200 char max, profanity filtered)
- **Health Bars**: For duels, show both players' remaining health
- **Opponent Guesses**: After each round, all guesses shown on map
- **ELO Change**: Shown at end of ranked duel (+X or -X)
