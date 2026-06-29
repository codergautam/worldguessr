# WebSocket Protocol

## Connection

### Endpoint
- URL: `wss://server.worldguessr.com/wg`
- Protocol: Raw WebSocket (NOT Socket.IO)
- Messages: JSON strings (sent via TextEncoder to ArrayBuffer on server)
- Client receives: JSON parsed from string

### Connection Flow
```
1. Create WebSocket connection to wsUrl
2. On open: send verify message
3. Wait for { type: "verify" } response
4. Connection established, ready for game actions
```

### Connection Management
- **Timeout**: 1500ms for initial connection
- **Retries**: Exponential backoff, 5s delay between attempts
- **Max retries**: 50 (configurable)
- **Keepalive**: Server sends `{ type: "t", t: timestamp }` every 5 seconds
- **Client responds**: `{ type: "pong" }` (rate limited to every 5 seconds max)
- **Reconnection**: Uses `rejoinCode` to restore state after disconnect
- **Disconnect timeout**: 30 seconds before player removed from game

### Time Synchronization
The client syncs its clock with the server for accurate timer display:
```
Client sends: { type: "timeSync", clientSentAt: Date.now() }
Server responds: { type: "timeSync", clientSentAt, serverNow: Date.now() }
Client calculates:
  rtt = Date.now() - clientSentAt
  if (rtt < bestRtt) {
    bestRtt = rtt
    timeOffset = serverNow - Date.now() + (rtt / 2)
  }
// Use timeOffset to convert server timestamps to local time
```

---

## Message Reference

### Authentication

#### Client → Server: `verify`
```json
{
  "type": "verify",
  "secret": "uuid-token",          // or "not_logged_in" for guests
  "rejoinCode": "uuid",            // optional, for reconnection
  "tz": "America/New_York"         // optional, user's timezone
}
```

#### Server → Client: `verify`
```json
{
  "type": "verify",
  "guestName": "Guest #1234",      // only for guests
  "rejoinCode": "uuid"             // only for guests (stored for reconnection)
}
```

#### Server → Client: `error`
```json
{
  "type": "error",
  "message": "uac",                // "uac" = user already connected
  "failedToLogin": true             // optional, indicates auth failure
}
```

---

### Player Count

#### Server → Client: `cnt`
```json
{
  "type": "cnt",
  "c": 1234                        // total online players
}
```
Sent every 5 seconds when player is not in a game.

---

### ELO & League

#### Server → Client: `elo`
```json
{
  "type": "elo",
  "elo": 1500,
  "league": {
    "name": "Explorer",
    "minElo": 2000,
    "maxElo": 4999,
    "color": "#cd7f32"
  }
}
```

#### Server → Client: `streak`
```json
{
  "type": "streak",
  "streak": 5                      // login streak days
}
```

---

### Queue Management

#### Client → Server: Queue for games
```json
// Unranked multiplayer
{ "type": "unrankedDuel" }

// Ranked duel (requires account + ELO)
{ "type": "publicDuel" }

// Leave any queue
{ "type": "leaveQueue" }
```

#### Server → Client: `publicDuelRange`
```json
{
  "type": "publicDuelRange",
  "range": [800, 1200]             // current ELO search range
}
```

---

### Private Game Management

#### Client → Server: Create private game
```json
{ "type": "createPrivateGame" }
```

#### Client → Server: Join private game
```json
{
  "type": "joinPrivateGame",
  "code": "123456"                 // 6-digit game code
}
```

#### Client → Server: Update game settings (host only)
```json
{
  "type": "setPrivateGameOptions",
  "options": {
    "rounds": 5,
    "timePerRound": 30,
    "location": "all",
    "displayLocation": "All Countries",
    "nm": false,
    "npz": false,
    "showRoadName": true
  }
}
```

#### Client → Server: Start game (host only)
```json
{ "type": "startGameHost" }
```

#### Client → Server: Reset game for rematch (host only)
```json
{ "type": "resetGame" }
```

#### Server → Client: `gameJoinError`
```json
{
  "type": "gameJoinError",
  "error": "Game not found"        // or "Game is full", etc.
}
```

---

### Game State

#### Server → Client: `game` (initial game state)
```json
{
  "type": "game",
  "state": "waiting",              // "waiting"|"getready"|"guess"|"end"
  "curRound": 1,
  "rounds": 5,
  "timePerRound": 30000,           // milliseconds
  "maxDist": 20000,
  "code": "123456",                // null for public games
  "host": true,                    // is this player the host?
  "duel": false,
  "public": true,
  "myId": "player-uuid",
  "players": [
    {
      "id": "player-uuid",
      "username": "PlayerName",
      "score": 0,
      "final": false,              // has finalized guess this round
      "latLong": null,             // guess coordinates [lat, lon]
      "elo": 1500,
      "countryCode": "US",
      "supporter": false
    }
  ],
  "locations": [                   // all locations for the game
    {
      "lat": 48.8566,
      "long": 2.3522,
      "country": "FR",
      "panoId": null,
      "heading": 0,
      "pitch": 0
    }
  ],
  "nextEvtTime": 1706000000000,    // server timestamp for next state change
  "startTime": 1706000000000,      // game start timestamp
  "nm": false,
  "npz": false,
  "showRoadName": true,
  "extent": [minLng, minLat, maxLng, maxLat],
  "location": "all",               // map slug
  "displayLocation": "All Countries"
}
```

#### Server → Client: `player` (join/leave)
```json
{
  "type": "player",
  "action": "add",                 // or "remove"
  "player": {
    "id": "player-uuid",
    "username": "PlayerName",
    "score": 0,
    "countryCode": "US"
  },
  "id": "player-uuid"             // for "remove" action
}
```

#### Server → Client: `generating`
```json
{
  "type": "generating",
  "generated": 3                   // number of locations ready (out of total)
}
```

#### Server → Client: `maxDist`
```json
{
  "type": "maxDist",
  "maxDist": 20000                 // updated max distance
}
```

---

### Gameplay Messages

#### Client → Server: `place` (submit guess)
```json
{
  "type": "place",
  "latLong": [48.8566, 2.3522],   // [lat, lon]
  "final": true                    // true = finalized, false = preview
}
```

#### Server → Client: `place` (broadcast guess)
```json
{
  "type": "place",
  "id": "player-uuid",
  "final": true,
  "latLong": [48.8566, 2.3522]
}
```

#### Client → Server: `chat`
```json
{
  "type": "chat",
  "message": "Hello!"             // max 200 characters
}
```

#### Server → Client: `chat`
```json
{
  "type": "chat",
  "id": "player-uuid",
  "name": "PlayerName",
  "message": "Hello!"
}
```

#### Client → Server: `leaveGame`
```json
{ "type": "leaveGame" }
```

---

### Game End Messages

#### Server → Client: `duelEnd` (ranked duel result)
```json
{
  "type": "duelEnd",
  "winner": true,                  // did this player win?
  "draw": false,
  "newElo": 1520,
  "oldElo": 1500,
  "timeElapsed": 180000            // milliseconds
}
```

#### Server → Client: `gameCancelled`
```json
{
  "type": "gameCancelled",
  "reason": "opponent_left_before_start"
}
```

#### Server → Client: `gameShutdown`
```json
{
  "type": "gameShutdown"
}
```

---

### Friend System

#### Client → Server: Get friends
```json
{ "type": "getFriends" }
```

#### Server → Client: `friends`
```json
{
  "type": "friends",
  "friends": [
    {
      "id": "account-id",
      "name": "FriendName",
      "supporter": false,
      "online": true,
      "socketId": "player-uuid"
    }
  ],
  "sentRequests": [
    { "id": "account-id", "name": "UserName", "supporter": false }
  ],
  "receivedRequests": [
    { "id": "account-id", "name": "UserName", "supporter": false }
  ],
  "allowFriendReq": true
}
```

#### Client → Server: Friend actions
```json
// Send friend request
{ "type": "sendFriendRequest", "name": "username" }

// Accept friend request
{ "type": "acceptFriend", "id": "account-id" }

// Decline friend request
{ "type": "declineFriend", "id": "account-id" }

// Cancel sent request
{ "type": "cancelRequest", "id": "account-id" }

// Remove friend
{ "type": "removeFriend", "id": "account-id" }

// Toggle friend requests
{ "type": "setAllowFriendReq", "allow": false }
```

#### Server → Client: `friendReqState`
```json
{
  "type": "friendReqState",
  "state": 1
  // 1 = sent successfully
  // 2 = user doesn't accept requests
  // 3 = user not found
  // 4 = request already sent
  // 5 = request already received
  // 6 = already friends
  // 7 = too many requests
}
```

#### Server → Client: `friendReq` (incoming request)
```json
{
  "type": "friendReq",
  "id": "account-id",
  "name": "SenderName"
}
```

---

### Invites

#### Client → Server: Send invite
```json
{
  "type": "inviteFriend",
  "friendId": "socket-id"         // the friend's socket/player ID
}
```

#### Server → Client: `invite`
```json
{
  "type": "invite",
  "code": "123456",               // game code to join
  "invitedByName": "HostName",
  "invitedById": "account-id"
}
```

#### Client → Server: Accept invite
```json
{
  "type": "acceptInvite",
  "code": "123456"
}
```

---

### Utility Messages

#### Client → Server: `screen`
```json
{
  "type": "screen",
  "screen": "home"                 // "home"|"singleplayer"|"multiplayer"
}
```

#### Client → Server: `updateCountryCode`
```json
{
  "type": "updateCountryCode",
  "countryCode": "US"
}
```

#### Client → Server: `pong`
```json
{ "type": "pong" }
```

#### Client → Server: `timeSync`
```json
{
  "type": "timeSync",
  "clientSentAt": 1706000000000
}
```

#### Server → Client: `t` (server time)
```json
{
  "type": "t",
  "t": 1706000000000
}
```

#### Server → Client: `toast`
```json
{
  "type": "toast",
  "key": "reconnected",           // i18n translation key
  "toastType": "success"          // "success"|"error"|"info"
}
```

#### Server → Client: `restartQueued`
```json
{
  "type": "restartQueued",
  "value": true                   // server maintenance incoming
}
```

---

## Game State Machine

```
                    ┌─────────┐
                    │ WAITING │  (lobby - private games wait for host start)
                    └────┬────┘  (public games auto-start when matched)
                         │
                    ┌────▼────┐
              ┌─────│GETREADY │  (5 second countdown)
              │     └────┬────┘  (clear guesses, send locations)
              │          │
              │     ┌────▼────┐
              │     │  GUESS  │  (timePerRound countdown)
              │     │         │  (players submit guesses)
              │     └────┬────┘  (check if all final → shorten timer)
              │          │
              │     givePoints() + saveRoundToHistory()
              │          │
              │     ┌────▼─────────────┐
              │     │ curRound > rounds │───YES──→ end()
              │     │ OR health <= 0?  │
              │     └────┬─────────────┘
              │          │ NO
              │          │
              └──────────┘  (waitBetweenRounds: 10s regular, 8s duel)
                              (last round: 5s wait)

                    ┌────▼────┐
                    │   END   │  (final scores, ELO update, save to DB)
                    └─────────┘  (2 hour timeout before cleanup)
```

### State Transitions Timeline
```
t=0      : WAITING (lobby)
t=start  : GETREADY
t=+5s    : GUESS
t=+5s+T  : givePoints (T = timePerRound)
t=+5s+T  : GETREADY (next round, after waitBetweenRounds)
...repeat...
t=final  : END
```

---

## Rate Limits
| Action | Limit |
|--------|-------|
| WebSocket messages | 500ms between most messages |
| Chat messages | 500ms minimum between messages |
| Friend request toggle | 5 second cooldown |
| Invite friend | 5 second cooldown per target |
| Pong response | Every 5 seconds max |
