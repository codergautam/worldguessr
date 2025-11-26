import mongoose from 'mongoose';

const playerGuessSchema = new mongoose.Schema({
  playerId: { type: String, required: true }, // accountId for logged in users, socketId for guests
  username: { type: String, required: true },
  accountId: { type: String, default: null }, // null for guest players

  // Guess data
  guessLat: { type: Number, required: false, default: null },
  guessLong: { type: Number, required: false, default: null },
  points: { type: Number, required: true },
  timeTaken: { type: Number, required: true }, // seconds
  xpEarned: { type: Number, default: 0 },

  // Additional metadata
  guessedAt: { type: Date, default: Date.now },
  usedHint: { type: Boolean, default: false }
}, { _id: false });

const roundSchema = new mongoose.Schema({
  roundNumber: { type: Number, required: true },

  // Location data
  location: {
    lat: { type: Number, required: true },
    long: { type: Number, required: true },
    panoId: { type: String, default: null },
    country: { type: String, default: null },
    place: { type: String, default: null } // city/region if available
  },

  // All player guesses for this round
  playerGuesses: [playerGuessSchema],

  // Round metadata
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  roundTimeLimit: { type: Number, default: null } // milliseconds (null for singleplayer, set for multiplayer)
}, { _id: false });

const playerSummarySchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  username: { type: String, required: true },
  accountId: { type: String, default: null },

  // Final scores
  totalPoints: { type: Number, required: true },
  totalXp: { type: Number, default: 0 },
  averageTimePerRound: { type: Number, default: 0 }, // seconds

  // Ranking
  finalRank: { type: Number, required: true }, // 1st, 2nd, 3rd place

  // Duel-specific data (only for ranked duels)
  elo: {
    before: { type: Number, default: null },
    after: { type: Number, default: null },
    change: { type: Number, default: null }
  }
}, { _id: false });

const gameSchema = new mongoose.Schema({
  // Game identification
  gameId: { type: String, required: true, unique: true },
  gameType: {
    type: String,
    required: true,
    enum: ['singleplayer', 'ranked_duel', 'unranked_multiplayer', 'private_multiplayer']
  },

  // Game settings
  settings: {
    location: { type: String, default: 'all' }, // 'all', country code, or custom map
    rounds: { type: Number, default: 5 },
    maxDist: { type: Number, default: 20000 }, // km
    timePerRound: { type: Number, default: null }, // milliseconds (null for singleplayer, set for multiplayer)
    official: { type: Boolean, default: true }, // affects XP

    // Additional settings
    showRoadName: { type: Boolean, default: false },
    noMove: { type: Boolean, default: false },
    noPan: { type: Boolean, default: false },
    noZoom: { type: Boolean, default: false }
  },

  // Game timing
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, required: true },
  totalDuration: { type: Number, required: true }, // seconds

  // Round data
  rounds: [roundSchema],

  // Player summaries
  players: [playerSummarySchema],

  // Game result metadata
  result: {
    winner: { type: String, default: null }, // playerId of winner (for duels)
    isDraw: { type: Boolean, default: false }, // for duels
    maxPossiblePoints: { type: Number, required: true } // rounds * 5000
  },

  // Multiplayer-specific data
  multiplayer: {
    isPublic: { type: Boolean, default: false },
    gameCode: { type: String, default: null }, // 6-digit code for private games
    hostPlayerId: { type: String, default: null },
    maxPlayers: { type: Number, default: 100 }
  },

  // Version and metadata
  gameVersion: { type: String, default: '1.0' }, // for future compatibility
  dataVersion: { type: String, default: '1.0' }, // schema version

  // Moderation - tracks if ELO has been refunded for this game (to prevent double refunds on re-ban)
  eloRefunded: { type: Boolean, default: false },
  eloRefundedAt: { type: Date, default: null },

  // Indexes for efficient querying
  createdAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
gameSchema.index({ gameType: 1, createdAt: -1 });
gameSchema.index({ 'players.accountId': 1, createdAt: -1 }); // User's game history
gameSchema.index({ gameType: 1, 'players.accountId': 1, createdAt: -1 }); // User's games by type
gameSchema.index({ gameId: 1 }); // Unique game lookup
gameSchema.index({ 'multiplayer.gameCode': 1 }); // Private game code lookup

const Game = mongoose.model('Game', gameSchema);

export default Game;