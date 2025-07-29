# Games Collection Schema Examples

This document shows example documents for each game type in the new `games` collection.

## 1. Singleplayer Game Example

```json
{
  "_id": "ObjectId(...)",
  "gameId": "sp_674bd2a8f1c234567890abcd",
  "gameType": "singleplayer",
  
  "settings": {
    "location": "all",
    "rounds": 5,
    "maxDist": 20000,
    "timePerRound": 30000,
    "official": true,
    "showRoadName": false,
    "noMove": false,
    "noPan": false,
    "noZoom": false
  },
  
  "startedAt": "2024-07-29T10:30:00.000Z",
  "endedAt": "2024-07-29T10:35:30.000Z",
  "totalDuration": 330000,
  
  "rounds": [
    {
      "roundNumber": 1,
      "location": {
        "lat": 48.8566,
        "long": 2.3522,
        "country": "FR",
        "place": "Paris"
      },
      "playerGuesses": [
        {
          "playerId": "user123",
          "username": "PlayerName",
          "accountId": "user123",
          "guessLat": 48.8500,
          "guessLong": 2.3400,
          "points": 4850,
          "timeTaken": 45,
          "xpEarned": 97,
          "guessedAt": "2024-07-29T10:30:45.000Z",
          "usedHint": false
        }
      ],
      "startedAt": "2024-07-29T10:30:00.000Z",
      "endedAt": "2024-07-29T10:30:45.000Z",
      "roundTimeLimit": 30000
    }
    // ... 4 more rounds
  ],
  
  "players": [
    {
      "playerId": "user123",
      "username": "PlayerName",
      "accountId": "user123",
      "totalPoints": 18750,
      "totalXp": 375,
      "averageTimePerRound": 42,
      "finalRank": 1,
      "elo": {
        "before": null,
        "after": null,
        "change": null
      }
    }
  ],
  
  "result": {
    "winner": null,
    "isDraw": false,
    "maxPossiblePoints": 25000
  },
  
  "multiplayer": {
    "isPublic": false,
    "gameCode": null,
    "hostPlayerId": null,
    "maxPlayers": 1
  },
  
  "gameVersion": "1.0",
  "dataVersion": "1.0",
  "createdAt": "2024-07-29T10:30:00.000Z"
}
```

## 2. Ranked Duel Example

```json
{
  "_id": "ObjectId(...)",
  "gameId": "duel_674bd2a8f1c234567890abce",
  "gameType": "ranked_duel",
  
  "settings": {
    "location": "all",
    "rounds": 5,
    "maxDist": 20000,
    "timePerRound": 60000,
    "official": true,
    "showRoadName": false,
    "noMove": false,
    "noPan": false,
    "noZoom": false
  },
  
  "startedAt": "2024-07-29T10:30:00.000Z",
  "endedAt": "2024-07-29T10:40:15.000Z",
  "totalDuration": 615000,
  
  "rounds": [
    {
      "roundNumber": 1,
      "location": {
        "lat": 35.6762,
        "long": 139.6503,
        "country": "JP",
        "place": "Tokyo"
      },
      "playerGuesses": [
        {
          "playerId": "player1",
          "username": "ProPlayer",
          "accountId": "acc_12345",
          "guessLat": 35.6800,
          "guessLong": 139.6600,
          "points": 4750,
          "timeTaken": 35,
          "xpEarned": 0,
          "guessedAt": "2024-07-29T10:30:35.000Z",
          "usedHint": false
        },
        {
          "playerId": "player2",
          "username": "Challenger",
          "accountId": "acc_67890",
          "guessLat": 35.6500,
          "guessLong": 139.6200,
          "points": 4200,
          "timeTaken": 42,
          "xpEarned": 0,
          "guessedAt": "2024-07-29T10:30:42.000Z",
          "usedHint": false
        }
      ],
      "startedAt": "2024-07-29T10:30:00.000Z",
      "endedAt": "2024-07-29T10:31:00.000Z",
      "roundTimeLimit": 60000
    }
    // ... 4 more rounds
  ],
  
  "players": [
    {
      "playerId": "player1",
      "username": "ProPlayer",
      "accountId": "acc_12345",
      "totalPoints": 22500,
      "totalXp": 0,
      "averageTimePerRound": 38,
      "finalRank": 1,
      "elo": {
        "before": 1450,
        "after": 1465,
        "change": 15
      }
    },
    {
      "playerId": "player2",
      "username": "Challenger",
      "accountId": "acc_67890",
      "totalPoints": 19800,
      "totalXp": 0,
      "averageTimePerRound": 44,
      "finalRank": 2,
      "elo": {
        "before": 1350,
        "after": 1335,
        "change": -15
      }
    }
  ],
  
  "result": {
    "winner": "player1",
    "isDraw": false,
    "maxPossiblePoints": 25000
  },
  
  "multiplayer": {
    "isPublic": true,
    "gameCode": null,
    "hostPlayerId": null,
    "maxPlayers": 2
  },
  
  "gameVersion": "1.0",
  "dataVersion": "1.0",
  "createdAt": "2024-07-29T10:30:00.000Z"
}
```

## 3. Unranked Multiplayer Example

```json
{
  "_id": "ObjectId(...)",
  "gameId": "mp_674bd2a8f1c234567890abcf",
  "gameType": "unranked_multiplayer",
  
  "settings": {
    "location": "US",
    "rounds": 5,
    "maxDist": 20000,
    "timePerRound": 30000,
    "official": true,
    "showRoadName": false,
    "noMove": false,
    "noPan": false,
    "noZoom": false
  },
  
  "startedAt": "2024-07-29T10:30:00.000Z",
  "endedAt": "2024-07-29T10:40:00.000Z",
  "totalDuration": 600000,
  
  "rounds": [
    {
      "roundNumber": 1,
      "location": {
        "lat": 40.7128,
        "long": -74.0060,
        "country": "US",
        "place": "New York"
      },
      "playerGuesses": [
        {
          "playerId": "p1",
          "username": "Player1",
          "accountId": "acc_111",
          "guessLat": 40.7500,
          "guessLong": -74.0200,
          "points": 4650,
          "timeTaken": 28,
          "xpEarned": 93,
          "guessedAt": "2024-07-29T10:30:28.000Z",
          "usedHint": false
        },
        {
          "playerId": "p2",
          "username": "GuestPlayer",
          "accountId": null,
          "guessLat": 40.6500,
          "guessLong": -73.9500,
          "points": 3800,
          "timeTaken": 25,
          "xpEarned": 0,
          "guessedAt": "2024-07-29T10:30:25.000Z",
          "usedHint": false
        }
        // ... more players
      ],
      "startedAt": "2024-07-29T10:30:00.000Z",
      "endedAt": "2024-07-29T10:31:00.000Z",
      "roundTimeLimit": 30000
    }
    // ... 4 more rounds
  ],
  
  "players": [
    {
      "playerId": "p1",
      "username": "Player1",
      "accountId": "acc_111",
      "totalPoints": 20500,
      "totalXp": 410,
      "averageTimePerRound": 26,
      "finalRank": 1,
      "elo": {
        "before": null,
        "after": null,
        "change": null
      }
    },
    {
      "playerId": "p2",
      "username": "GuestPlayer",
      "accountId": null,
      "totalPoints": 18200,
      "totalXp": 0,
      "averageTimePerRound": 23,
      "finalRank": 2,
      "elo": {
        "before": null,
        "after": null,
        "change": null
      }
    }
  ],
  
  "result": {
    "winner": null,
    "isDraw": false,
    "maxPossiblePoints": 25000
  },
  
  "multiplayer": {
    "isPublic": true,
    "gameCode": null,
    "hostPlayerId": "p1",
    "maxPlayers": 100
  },
  
  "gameVersion": "1.0",
  "dataVersion": "1.0",
  "createdAt": "2024-07-29T10:30:00.000Z"
}
```

## Key Features of the Schema:

### Flexibility
- **Single schema** supports all game types (singleplayer, ranked duels, unranked multiplayer)
- **Guest player support** with `accountId: null`
- **Extensible settings** for future game modes

### Rich Data Storage
- **Complete round history** with all player guesses
- **Timing data** at both game and round level
- **XP tracking** for official games
- **ELO changes** for ranked duels

### Efficient Querying
- **Indexed fields** for user game history, game type filtering
- **Embedded round data** for fast retrieval
- **Player summaries** for leaderboards and statistics

### Future-Proof Design
- **Version fields** for schema evolution
- **Metadata fields** for additional game features
- **Flexible settings object** for new game options

This schema will enable:
- User game history pages
- Detailed replay functionality
- Statistics and analytics
- Leaderboards across different game types
- Tournament and competition tracking