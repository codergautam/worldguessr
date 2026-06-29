# User System

## User Profile Data

### Core Fields
| Field | Type | Description |
|-------|------|-------------|
| _id | ObjectId | MongoDB ID |
| email | String | Google OAuth email |
| secret | String | Auth token (UUID) |
| username | String | Display name (3-30 chars) |
| countryCode | String | ISO 3166-1 alpha-2 country code |
| created_at | Date | Account creation |
| lastLogin | Date | Last login timestamp |
| totalXp | Number | Cumulative XP earned |
| totalGamesPlayed | Number | Total games played |
| elo | Number | ELO rating (default: 1000) |
| supporter | Boolean | Premium supporter status |
| staff | Boolean | Moderator flag |

### Duel Statistics
| Field | Type | Description |
|-------|------|-------------|
| duels_wins | Number | Ranked duel wins |
| duels_losses | Number | Ranked duel losses |
| duels_tied | Number | Ranked duel draws |
| elo_today | Number | ELO change today |

### Profile Features
| Field | Type | Description |
|-------|------|-------------|
| streak | Number | Login streak (days) |
| profileViews | Number | Times profile viewed |
| lastNameChange | Date | Last username change |
| timeZone | String | User's timezone |

## League System
| League | ELO Range | Color |
|--------|-----------|-------|
| Trekker | 0 - 1999 | Grey |
| Explorer | 2000 - 4999 | Bronze |
| Voyager | 5000 - 7999 | Gold |
| Nomad | 8000+ | Diamond/Blue |

## Friend System

### Data Structure (per user)
- `friends`: Array of account IDs (max 100)
- `sentReq`: Array of outgoing request IDs (max 100)
- `receivedReq`: Array of incoming request IDs (max 100)
- `allowFriendReq`: Boolean toggle

### Friend Operations (via WebSocket)
1. **Get Friends**: `{ type: "getFriends" }` → returns friends with online status
2. **Send Request**: `{ type: "sendFriendRequest", name: "username" }`
3. **Accept**: `{ type: "acceptFriend", id: "accountId" }`
4. **Decline**: `{ type: "declineFriend", id: "accountId" }`
5. **Cancel**: `{ type: "cancelRequest", id: "accountId" }`
6. **Remove**: `{ type: "removeFriend", id: "accountId" }`
7. **Toggle Requests**: `{ type: "setAllowFriendReq", allow: boolean }`

### Friend Request States
| Code | Meaning |
|------|---------|
| 1 | Request sent successfully |
| 2 | User doesn't accept requests |
| 3 | User not found |
| 4 | Request already sent |
| 5 | Request already received |
| 6 | Already friends |
| 7 | Too many requests |

### Friend Invite to Game
- Only works for actual friends
- Send: `{ type: "inviteFriend", friendId: "socketId" }`
- Friend receives: `{ type: "invite", code: "123456", invitedByName: "..." }`
- Friend accepts: `{ type: "acceptInvite", code: "123456" }`

## Leaderboard System

### All-Time Leaderboard
- Top 100 users by XP or ELO
- Excludes banned users
- 1-minute cache per mode
- User's own rank included if authenticated

### Daily Leaderboard
- Pre-computed via DailyLeaderboard model
- Stored at midnight UTC
- Top 50,000 users
- Shows daily change (delta)
- Auto-deletes after 30 days

### Rank Calculation
- ELO rank = count of users with higher ELO + 1
- XP rank = count of users with higher XP + 1
- Cached for performance

## User Progression Charts
- Tracked via UserStats model
- Records: totalXp, xpRank, elo, eloRank at each event
- Events: game_completed, weekly_update, account_created, elo_refund
- Accessible via POST /api/userProgression
- Supports time filtering (7d, 30d, all time)
- Used for XP and ELO progression graphs on profile

## Public Profile Page
- Accessible at `/user?username=X`
- Shows: username, country flag, member since, XP, games, ELO, league, duel stats
- Profile views tracked (5-min cooldown per IP)
- Progression charts for XP and ELO
- Report username button (if logged in)
- 60-second cache per profile

## Username Management
- Initial: set on first login via SetUsernameModal
- Change: 30-day cooldown between changes
- Rules: 3-30 chars, alphanumeric + underscore, profanity filtered
- Forced change: moderator can require name change for policy violation
  - User blocked from gameplay until new name submitted and approved
  - Submitted via /api/submitNameChange
  - Reviewed by staff via /api/mod/reviewNameChange

## Ban System
- **Permanent**: `banned: true, banType: "permanent"`
- **Temporary**: `banned: true, banType: "temporary", banExpiresAt: Date`
- Auto-unban on login when temp ban expires
- Banned users cannot: play multiplayer, earn XP, report others, create maps
- `pendingNameChange` also blocks gameplay (treated as soft ban)

## Moderation Data (User's View)
Users can see their own:
- ELO refunds received (from banned cheaters)
- Moderation actions taken against them (public notes only)
- Reports they submitted and their status
They cannot see: reports against them, internal reasons
