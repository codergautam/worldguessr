# Data Models

## User Model
```javascript
{
  email: String,
  secret: String (unique, UUID),
  username: String,
  countryCode: String,
  created_at: Date,
  lastLogin: Date,
  timeZone: String,
  firstLoginComplete: Boolean,
  lastNameChange: Date,

  // Stats
  totalXp: Number (default: 0),
  totalGamesPlayed: Number,
  elo: Number (default: 1000),
  elo_today: Number,
  duels_wins: Number,
  duels_losses: Number,
  duels_tied: Number,
  streak: Number,
  profileViews: Number,

  // Social
  friends: [ObjectId],
  sentReq: [ObjectId],
  receivedReq: [ObjectId],
  allowFriendReq: Boolean (default: true),

  // Permissions
  staff: Boolean,
  canMakeClues: Boolean,
  instant_accept_maps: Boolean,
  supporter: Boolean,

  // Ban
  banned: Boolean,
  banType: String (enum: none, permanent, temporary),
  banExpiresAt: Date,
  banReason: String,
  banPublicNote: String,
  pendingNameChange: Boolean,
  pendingNameChangeReason: String,
  pendingNameChangePublicNote: String,

  // Platform
  crazyGamesId: String,

  // Reporter tracking
  reporterStats: {
    helpfulReports: Number,
    unhelpfulReports: Number
  }
}
```

## Game Model
```javascript
{
  gameId: String (unique),
  gameType: String (enum: singleplayer, ranked_duel, unranked_multiplayer, private_multiplayer),

  settings: {
    location: String,
    rounds: Number,
    maxDist: Number,
    timePerRound: Number,
    official: Boolean,
    showRoadName: Boolean,
    noMove: Boolean,
    noPan: Boolean,
    noZoom: Boolean
  },

  startedAt: Date,
  endedAt: Date,
  totalDuration: Number (seconds),

  rounds: [{
    roundNumber: Number,
    location: { lat, long, panoId, country, place },
    playerGuesses: [{
      playerId: String,
      username: String,
      accountId: String,
      guessLat: Number,
      guessLong: Number,
      points: Number,
      timeTaken: Number (seconds),
      xpEarned: Number,
      guessedAt: Date,
      usedHint: Boolean
    }],
    startedAt: Date,
    endedAt: Date,
    roundTimeLimit: Number
  }],

  players: [{
    playerId: String,
    username: String,
    accountId: String,
    totalPoints: Number,
    totalXp: Number,
    averageTimePerRound: Number,
    finalRank: Number,
    elo: { before, after, change }
  }],

  result: {
    winner: String,
    isDraw: Boolean,
    maxPossiblePoints: Number
  },

  multiplayer: {
    isPublic: Boolean,
    gameCode: String,
    hostPlayerId: String,
    maxPlayers: Number
  },

  eloRefunded: Boolean,
  eloRefundedAt: Date,
  createdAt: Date
}
```

## Map Model
```javascript
{
  slug: String (unique),
  name: String,
  created_by: ObjectId,
  map_creator_name: String,
  created_at: Date,
  lastUpdated: Date,
  plays: Number,
  hearts: Number,
  data: [Object],  // array of location objects
  description_short: String,
  description_long: String,
  accepted: Boolean,
  in_review: Boolean,
  reject_reason: String,
  resubmittable: Boolean,
  countryMap: String,
  official: Boolean,
  maxDist: Number,
  spotlight: Boolean
}
```

## UserStats Model
```javascript
{
  userId: String,
  timestamp: Date,
  totalXp: Number,
  xpRank: Number,
  elo: Number,
  eloRank: Number,
  triggerEvent: String (enum: game_completed, weekly_update, account_created, elo_refund),
  gameId: String,
  eloRefundDetails: {
    amount: Number,
    bannedUserId: String,
    bannedUsername: String,
    moderationLogId: String
  },
  createdAt: Date
}
```

## Report Model
```javascript
{
  reportedBy: { accountId, username },
  reportedUser: { accountId, username },
  reason: String (enum: inappropriate_username, cheating, other),
  description: String (10-500 chars),
  gameId: String,
  gameType: String,
  status: String (enum: pending, reviewed, dismissed, action_taken),
  actionTaken: String,
  moderationLogId: ObjectId,
  moderatorNotes: String,
  reviewedBy: { accountId, username },
  reviewedAt: Date,
  createdAt: Date
}
```

## NameChangeRequest Model
```javascript
{
  user: { accountId, currentUsername },
  requestedUsername: String,
  status: String (enum: pending, approved, rejected),
  reason: String,
  originalReportId: ObjectId,
  forcedByLogId: ObjectId,
  reviewedBy: { accountId, username },
  rejectionReason: String,
  rejectionCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

## ModerationLog Model
```javascript
{
  targetUser: { accountId, username },
  moderator: { accountId, username },
  actionType: String,
  reason: String,
  notes: String,
  duration: String,
  durationString: String,
  expiresAt: Date,
  nameChange: Object,
  eloRefund: Object,
  createdAt: Date
}
```

## DailyLeaderboard Model
```javascript
{
  date: Date,
  mode: String (xp or elo),
  entries: [{
    userId: ObjectId,
    username: String,
    countryCode: String,
    currentValue: Number,
    delta: Number,
    rank: Number,
    supporter: Boolean
  }],
  createdAt: Date  // TTL: 30 days
}
```
