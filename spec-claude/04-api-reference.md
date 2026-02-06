# API Reference

## Base URL
`https://api.worldguessr.com`

## Authentication Methods
- **Bearer Token**: `Authorization: Bearer {secret}` header
- **Body Parameter**: `secret` or `token` field in POST body
- Most endpoints use body parameter authentication

## Rate Limiting
Most endpoints have per-IP rate limiting. Specific limits noted per endpoint.

---

## Authentication APIs

### POST /api/googleAuth
Primary auth endpoint for Google OAuth and session refresh.

**Request:**
```json
{
  "code": "google-oauth-code",     // For new login
  "secret": "uuid-token"           // For session refresh
}
```

**Response (200):**
```json
{
  "secret": "uuid-token",
  "username": "PlayerName",
  "email": "user@email.com",
  "staff": false,
  "canMakeClues": false,
  "supporter": false,
  "accountId": "mongodb-id",
  "countryCode": "US",
  "banned": false,
  "banType": "none",
  "banExpiresAt": null,
  "banPublicNote": null,
  "pendingNameChange": false,
  "pendingNameChangePublicNote": null,
  "totalXp": 5000,
  "createdAt": "2024-01-01T00:00:00Z",
  "gamesLen": 50,
  "lastLogin": "2024-06-01T00:00:00Z",
  "canChangeUsername": true,
  "daysUntilNameChange": 0,
  "recentChange": false,
  "elo": 1500,
  "rank": 234,
  "league": { "name": "Explorer", "minElo": 2000 },
  "duels_wins": 10,
  "duels_losses": 5,
  "duels_tied": 2,
  "win_rate": 58.8
}
```

### POST /api/crazyAuth
CrazyGames SDK authentication.

**Request:**
```json
{
  "token": "crazygames-jwt-token",
  "username": "RequestedUsername"
}
```
**Response:** Same as googleAuth.

---

## User Profile APIs

### GET /api/me
Get current authenticated user's basic info.

**Headers:** `Authorization: Bearer {secret}`

**Response (200):**
```json
{
  "id": "mongodb-id",
  "username": "PlayerName",
  "email": "user@email.com",
  "countryCode": "US",
  "supporter": false,
  "staff": false,
  "banned": false
}
```

### POST /api/publicAccount
Get basic public account data (no auth required).

**Request:**
```json
{ "id": "mongodb-id" }
```

**Response (200):**
```json
{
  "username": "PlayerName",
  "totalXp": 5000,
  "createdAt": "2024-01-01T00:00:00Z",
  "gamesLen": 50,
  "lastLogin": "2024-06-01T00:00:00Z",
  "canChangeUsername": true,
  "daysUntilNameChange": 0,
  "recentChange": false,
  "countryCode": "US"
}
```

### GET /api/publicProfile
Get detailed public profile. Rate limit: 20 req/min per IP.

**Query:** `?username=PlayerName`

**Response (200):**
```json
{
  "username": "PlayerName",
  "userId": "mongodb-id",
  "totalXp": 5000,
  "gamesPlayed": 50,
  "createdAt": "2024-01-01T00:00:00Z",
  "memberSince": "1 year",
  "lastLogin": "2024-06-01T00:00:00Z",
  "profileViews": 100,
  "elo": 1500,
  "rank": 234,
  "league": { "name": "Explorer" },
  "duelStats": { "wins": 10, "losses": 5, "tied": 2, "winRate": 58.8 },
  "supporter": false,
  "countryCode": "US"
}
```

### POST /api/setName
Set or change username. 30-day cooldown between changes.

**Request:**
```json
{
  "token": "secret-uuid",
  "username": "NewUsername"
}
```
Username rules: 3-30 chars, alphanumeric + underscore only, profanity filtered.

**Response (200):** `{ "success": true }`
**Response (400):** `{ "message": "Username already taken" }`

### POST /api/updateCountryCode
Update user's country flag.

**Request:**
```json
{
  "token": "secret-uuid",
  "countryCode": "US"
}
```
Set to empty string `""` to opt out. Set to `null` to allow auto-assignment.

---

## Game APIs

### POST /api/storeGame
Store completed singleplayer game. Rate limit: 12 req/60s.

**Request:**
```json
{
  "secret": "secret-uuid",
  "maxDist": 20000,
  "official": true,
  "location": "all",
  "rounds": [
    {
      "lat": 48.8566,
      "long": 2.3522,
      "actualLat": 48.8566,
      "actualLong": 2.3522,
      "usedHint": false,
      "maxDist": 20000,
      "roundTime": 45,
      "xp": 100,
      "points": 5000,
      "country": "FR"
    }
  ]
}
```

**Response (200):** `{ "success": true, "gameId": "sp_uuid" }`

### POST /api/gameDetails
Get game details (for round-over screen review).

**Request:**
```json
{
  "secret": "secret-uuid",
  "gameId": "sp_uuid"
}
```

**Response (200):** Full game document with rounds and player data.

### POST /api/gameHistory
Get user's game history with pagination.

**Request:**
```json
{
  "secret": "secret-uuid",
  "page": 1,
  "limit": 10
}
```

**Response (200):**
```json
{
  "games": [
    {
      "gameId": "sp_uuid",
      "gameType": "singleplayer",
      "startedAt": "2024-06-01T00:00:00Z",
      "endedAt": "2024-06-01T00:05:00Z",
      "totalDuration": 300,
      "userStats": { "totalPoints": 20000, "totalXp": 400, "finalRank": 1 },
      "settings": { "location": "all", "rounds": 5 },
      "result": { "maxPossiblePoints": 25000 },
      "roundsPlayed": 5
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 50, "pages": 5 }
}
```

---

## ELO & Leaderboard APIs

### GET /api/eloRank
Get ELO rank. Rate limit: 30 req/min per IP.

**Query:** `?username=PlayerName` or `?secret=secret-uuid`

**Response (200):**
```json
{
  "id": "mongodb-id",
  "elo": 1500,
  "rank": 234,
  "league": { "name": "Explorer", "minElo": 2000, "maxElo": 4999, "color": "#cd7f32" },
  "duels_wins": 10,
  "duels_losses": 5,
  "duels_tied": 2,
  "win_rate": 58.8
}
```

### GET /api/leaderboard
Get global leaderboard rankings.

**Query:**
- `?mode=xp` or `?mode=elo` (default: elo)
- `?pastDay=true` for daily leaderboard
- `?username=PlayerName` to include user's rank

**Response (200):**
```json
{
  "leaderboard": [
    {
      "username": "TopPlayer",
      "countryCode": "US",
      "totalXp": 50000,
      "gamesLen": 500,
      "elo": 8500,
      "eloToday": 200,
      "createdAt": "2024-01-01T00:00:00Z",
      "supporter": true,
      "rank": 1
    }
  ],
  "myRank": 234,
  "myCountryCode": "US",
  "myXp": 5000,
  "myElo": 1500
}
```

### POST /api/userProgression
Get user stats progression for charts. Rate limit: 10 req/min per IP.

**Request:**
```json
{
  "userId": "mongodb-id",
  "username": "PlayerName"
}
```
Provide either userId or username, not both.

**Response (200):**
```json
{
  "progression": [
    {
      "timestamp": "2024-06-01T00:00:00Z",
      "totalXp": 5000,
      "xpRank": 234,
      "elo": 1500,
      "eloRank": 100,
      "xpGain": 100,
      "eloChange": 20,
      "rankImprovement": 5
    }
  ],
  "username": "PlayerName"
}
```

---

## Map APIs

### POST /api/map/mapHome
Get map discovery page data.

**Request (authenticated):**
```json
{ "secret": "secret-uuid" }
```
**Query (anonymous):** `?anon=true`

**Response (200):**
```json
{
  "myMaps": [{ "slug": "...", "name": "...", "hearts": 10, ... }],
  "likedMaps": [...],
  "countryMaps": [...],
  "recent": [...],
  "popular": [...],
  "spotlight": [...]
}
```

### GET /api/map/publicData
Get map details by slug.

**Query:** `?slug=map-slug`

**Response (200):**
```json
{
  "name": "Map Name",
  "slug": "map-slug",
  "created_by_name": "CreatorName",
  "created_at": "2 months ago",
  "hearts": 50,
  "plays": 200,
  "description_short": "Short description",
  "description_long": "Long description",
  "locations": 100,
  "accepted": true,
  "maxDist": 5000,
  "data": [
    { "lat": 48.8566, "lng": 2.3522, "heading": 0, "pitch": 0, "panoId": null }
  ]
}
```
Note: `data` array limited to first 5 locations for preview. `locations` field has total count.

### POST /api/map/searchMap
Search maps by name.

**Request:**
```json
{
  "secret": "secret-uuid",
  "query": "europe"
}
```
Query must be 3+ characters.

**Response (200):**
```json
[
  { "slug": "...", "name": "...", "hearts": 10, "plays": 50, ... }
]
```

### POST /api/map/heartMap
Toggle heart/like on a map. 500ms cooldown.

**Request:**
```json
{
  "secret": "secret-uuid",
  "mapId": "mongodb-id"
}
```

**Response (200):**
```json
{ "success": true, "hearted": true, "hearts": 51 }
```

### POST /api/map/action
Create or edit a map.

**Request:**
```json
{
  "secret": "secret-uuid",
  "action": "create",
  "name": "My Map",
  "data": "[{\"lat\":48.8566,\"lng\":2.3522}]",
  "description_short": "A map of Paris landmarks",
  "description_long": "Explore the most iconic locations in Paris, France..."
}
```
Map requires 5-100,000 locations. Name: 3-30 chars.

### POST /api/map/approveRejectMap
Staff: approve or reject maps in review queue.

**Request:**
```json
{
  "secret": "staff-secret",
  "mapId": "mongodb-id",
  "action": "approve",
  "rejectReason": "Needs more locations",
  "resubmittable": true
}
```

### DELETE /api/map/delete
Delete a map (creator or staff).

**Request:**
```json
{
  "secret": "secret-uuid",
  "mapId": "mongodb-id"
}
```

---

## Clue/Hint APIs

### GET /api/clues/getClue
Get clues for a location.

**Query:** `?lat=48.8566&lng=2.3522`

**Response (200):**
```json
[
  {
    "id": "mongodb-id",
    "cluetext": "Look for the French flag...",
    "rating": 4.5,
    "ratingcount": 10,
    "created_by_name": "ClueAuthor",
    "created_at": 1706000000000
  }
]
```

### GET /api/clues/getCluesCount
Get total clue count. Cached 1 hour.

**Response:** `{ "count": 5000 }`

### POST /api/clues/makeClue
Create a clue. Requires `canMakeClues` permission.

**Request:** Form data with secret, lat, lng, clueText (100-1000 chars).

### POST /api/clues/rateClue
Rate a clue 1-5 stars.

**Request:**
```json
{
  "secret": "secret-uuid",
  "clueId": "mongodb-id",
  "rating": 5
}
```

---

## Reporting APIs

### POST /api/submitReport
Report a player in-game.

**Request:**
```json
{
  "secret": "secret-uuid",
  "reportedUserAccountId": "mongodb-id",
  "reason": "cheating",
  "description": "Player guessed perfectly every round in under 2 seconds",
  "gameId": "duel_uuid",
  "gameType": "ranked_duel"
}
```
Reasons: `inappropriate_username`, `cheating`, `other`. Rate limit: 5/hour.

### POST /api/submitUsernameReport
Report inappropriate username from profile page.

**Request:**
```json
{
  "secret": "secret-uuid",
  "reportedUsername": "BadUsername",
  "description": "This username is offensive because..."
}
```

---

## Name Change APIs

### POST /api/checkNameChangeStatus
Check if forced name change is required.

**Request:** `{ "secret": "secret-uuid" }`

**Response (200):**
```json
{
  "hasPendingRequest": false,
  "pendingNameChange": true,
  "request": {
    "requestedUsername": "NewName",
    "status": "rejected",
    "rejectionReason": "Too similar to original",
    "rejectionCount": 1,
    "createdAt": "2024-06-01T00:00:00Z"
  }
}
```

### POST /api/submitNameChange
Submit new username for mod approval (when forced to change).

**Request:**
```json
{
  "secret": "secret-uuid",
  "newUsername": "BetterName"
}
```

### POST /api/checkIfNameChangeProgress
Check if username changed in last 24 hours.

**Request:** `{ "token": "secret-uuid" }`
**Response:** `{ "name": "NewUsername" }` or `{ "name": null }`

---

## Utility APIs

### GET /api/country
Get country code from coordinates.

**Query:** `?lat=48.8566&lon=2.3522`
**Response:** `{ "address": { "country": "FR" } }`

### GET /api/getCountries
Get all countries with max distances.
**Response:** `{ "US": 5000, "FR": 1200, ... }`

### POST /api/userModerationData
Get user's own moderation data (ELO refunds, mod actions, reports).

**Request:** `{ "secret": "secret-uuid" }`

**Response (200):**
```json
{
  "eloRefunds": [
    { "id": "...", "amount": 50, "bannedUsername": "Cheater", "date": "...", "newElo": 1550 }
  ],
  "totalEloRefunded": 50,
  "moderationHistory": [
    { "actionType": "warning", "actionDescription": "Warning issued", "date": "..." }
  ],
  "submittedReports": [
    { "reportedUsername": "BadPlayer", "reason": "cheating", "status": "action_taken", "date": "..." }
  ],
  "reportStats": { "total": 5, "open": 1, "ignored": 1, "actionTaken": 3 }
}
```

---

## Moderation APIs (Staff Only)

All require `secret` in body + user must have `staff: true`.

### POST /api/mod/userLookup
Search users by username, ID, email, or past names.

### POST /api/mod/getReports
Get report queue with filtering and grouping.

### POST /api/mod/takeAction
Ban, unban, force name change, dismiss reports.

### POST /api/mod/auditLogs
View moderation action history.

### POST /api/mod/gameDetails
View game details for moderation.

### POST /api/mod/nameReviewQueue
Get pending name change requests.

### POST /api/mod/reviewNameChange
Approve or reject name change requests.

### POST /api/mod/deleteUser
Permanently delete user (admin only).
