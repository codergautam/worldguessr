import mongoose from 'mongoose';

const playerGuessSchema = new mongoose.Schema({
  playerId: { type: String, required: true }, // accountId for logged in users, socketId for guests
  username: { type: String, required: true },
  accountId: { type: String, default: null }, // null for guest players
  countryCode: { type: String, default: null }, // player's flag at game time (null if unset/guest)

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

  // Team-party rounds: the server-computed team score for this round under
  // the game's scoring method ('average' is not reconstructable client-side —
  // its denominator is the roster at scoring time). null for solo modes.
  teamRoundScores: {
    a: { type: Number, default: null },
    b: { type: Number, default: null }
  },

  // 2v2 rounds: the HP actually applied to the losing team and the multiplier
  // it was computed with (damage = best-guess gap × multiplier; the value may
  // change or become per-round — ws/classes/Game.js teamDamageMultiplier is
  // the source of truth). null for other modes and pre-stamp saves.
  teamDamage: { type: Number, default: null },
  teamDamageMultiplier: { type: Number, default: null },

  // Round metadata
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  roundTimeLimit: { type: Number, default: null } // milliseconds (null for singleplayer, set for multiplayer)
}, { _id: false });

const playerSummarySchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  username: { type: String, required: true },
  accountId: { type: String, default: null },
  countryCode: { type: String, default: null }, // player's flag at game time (null if unset/guest)

  // Final scores
  totalPoints: { type: Number, required: true },
  totalXp: { type: Number, default: 0 },
  averageTimePerRound: { type: Number, default: 0 }, // seconds

  // Ranking. CAUTION — semantics differ by mode:
  //   solo / FFA / party (incl. teamGame): INDIVIDUAL rank by personal points.
  //   2v2 team duels (gameType '2v2'):     TEAM result — 1 for every winner,
  //                                        2 for every loser (draw → all 1).
  // Never treat finalRank uniformly across game types; team W/L should be
  // read from result.winningTeam + players[].team instead.
  finalRank: { type: Number, required: true },

  // Team identifier for team modes (e.g. 2v2). null/undefined for solo modes.
  team: { type: String, default: null }, // 'a' | 'b'

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
    enum: ['singleplayer', 'ranked_duel', 'unranked_multiplayer', 'private_multiplayer', 'daily_challenge', '2v2']
  },

  // Game settings
  settings: {
    location: { type: String, default: 'all' }, // 'all', country code, or custom map
    rounds: { type: Number, default: 5 },
    maxDist: { type: Number, default: 20000 }, // km
    timePerRound: { type: Number, default: null }, // milliseconds (null for singleplayer, set for multiplayer)
    official: { type: Boolean, default: true }, // affects XP
    countryGuesser: { type: Boolean, default: false }, // country/continent guesser mode (1000 pts per round)
    countryGuessrSubMode: { type: String, default: null }, // 'country' or 'continent'

    // Additional settings
    showRoadName: { type: Boolean, default: false },
    noMove: { type: Boolean, default: false },
    noPan: { type: Boolean, default: false },
    noZoom: { type: Boolean, default: false },

    // Intra-party team mode (private_multiplayer only)
    teamGame: { type: Boolean, default: false },
    teamScoring: { type: String, default: null } // 'average' | 'closest'
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
    winningTeam: { type: String, default: null }, // 'a' | 'b' for team modes (2v2)
    // Final shared-HP per team for team modes — lets history render the same
    // "Your team ❤️ vs Enemy ❤️" summary the live end screen shows. null on
    // solo modes and on team games saved before this field existed.
    teamScores: {
      a: { type: Number, default: null },
      b: { type: Number, default: null }
    },
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
  // Tracks if the opponents' duel WIN/LOSS counters were reconciled for this
  // refunded game (so a cheater's games don't drag down victims' win rate).
  // Separate from eloRefunded so historical refunds can be backfilled exactly
  // once (scripts/backfillRefundedDuelWinLoss.js); set alongside eloRefunded on
  // the live refund path (serverUtils/eloRefunds.js).
  winLossAdjusted: { type: Boolean, default: false },

  // Indexes for efficient querying
  createdAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
gameSchema.index({ gameType: 1, createdAt: -1 });
gameSchema.index({ 'players.accountId': 1, createdAt: -1 }); // User's game history
gameSchema.index({ gameType: 1, 'players.accountId': 1, createdAt: -1 }); // User's games by type
gameSchema.index({ gameId: 1 }); // Unique game lookup
gameSchema.index({ 'multiplayer.gameCode': 1 }); // Private game code lookup
gameSchema.index({ 'rounds.playerGuesses.accountId': 1 }); // Deletion cascade: round-guess anonymize (previously a full collection scan)

const Game = mongoose.model('Game', gameSchema);

export default Game;