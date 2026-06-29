# Authentication

## Overview
WorldGuessr supports two authentication providers:
1. **Google OAuth 2.0** - Primary login method
2. **CrazyGames SDK JWT** - For CrazyGames platform integration

Both methods result in a `secret` token (UUID) stored client-side for session persistence.

## Authentication Flow

### Google OAuth (Primary)
```
1. User taps "Login" button
2. App opens Google Sign-In (native on mobile)
3. User authenticates with Google
4. App receives OAuth authorization code
5. App sends POST /api/googleAuth { code: "..." }
6. Server verifies with Google OAuth2Client
7. Server creates/finds user in MongoDB
8. Server returns { secret: "uuid", username: "...", ... }
9. App stores secret in AsyncStorage
10. App uses secret for all subsequent API calls
```

### CrazyGames SDK (Platform-Specific)
```
1. CrazyGames SDK provides JWT token
2. App sends POST /api/crazyAuth { token: "jwt", username: "desired" }
3. Server verifies JWT using CrazyGames public key (RS256)
4. Server creates/finds user by crazyGamesId
5. Returns same response as googleAuth
```

### Session Refresh
```
1. App has stored secret from previous login
2. App sends POST /api/googleAuth { secret: "uuid" }
3. Server looks up user by secret
4. Returns full user data (same as initial login)
5. If secret invalid: returns error, app clears stored secret
```

### Guest Mode
- Users can play without logging in
- WebSocket verify with: { type: "verify", secret: "not_logged_in" }
- Server assigns guest name: "Guest #XXXX"
- Guests cannot: play ranked duels, earn XP, save game history, use friends

## Token Storage

### Web (Current)
- `localStorage.wg_secret` = secret token
- `window.cConfig` = client configuration

### React Native (Recommended)
- `AsyncStorage` or `react-native-mmkv` for secret token
- React Context for client config and session state

## Session Object Structure
```javascript
{
  token: {
    secret: "uuid-token",
    username: "PlayerName",
    email: "user@email.com",
    staff: false,
    canMakeClues: false,
    supporter: false,
    accountId: "mongodb-id",
    countryCode: "US",
    banned: false,
    banType: "none",
    banExpiresAt: null,
    pendingNameChange: false,
    totalXp: 5000,
    elo: 1500,
    rank: 234,
    league: { name: "Explorer", ... },
    duels_wins: 10,
    duels_losses: 5,
    duels_tied: 2,
    win_rate: 58.8
  }
}
```

## Auth States
```
false     → Loading (checking stored secret)
null      → Not logged in (guest)
{object}  → Logged in (session data available)
```

## Security Notes
- Secret tokens are UUIDs (cryptographically secure)
- Bearer token sent in Authorization header or body parameter
- Rate limiting: 30 req/min on auth endpoints
- Ban status checked on every login
- Temp bans auto-expire when `banExpiresAt` passes
- `pendingNameChange` blocks gameplay (treated as banned)

## WebSocket Authentication
After HTTP auth, the WebSocket connection also verifies:
```json
// Client sends on WS connect:
{
  "type": "verify",
  "secret": "uuid-token",
  "tz": "America/New_York",
  "rejoinCode": "previous-rejoin-code"
}

// Server validates secret against MongoDB
// Server returns: { type: "verify" }
// If invalid: { type: "error", failedToLogin: true }
```

## React Native Implementation Notes
- Use `@react-native-google-signin/google-signin` for Google auth
- Exchange the idToken/serverAuthCode with your backend
- The backend endpoint remains the same (/api/googleAuth)
- For CrazyGames: not needed in standalone mobile app
