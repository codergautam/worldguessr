import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  secret: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  totalXp: {
    type: Number,
    default: 0,
  },
  games: {
    type: Array,
    default: [],
  },
  totalGamesPlayed: {
    type: Number,
    default: 0,
  },
  banned: {
    type: Boolean,
    default: false,
  },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sentReq: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  receivedReq: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allowFriendReq: {
    type: Boolean,
    default: true,
  },
  timeZone: {
    type: String,
    default: 'America/Los_Angeles',
  },
  streak: {
    type: Number,
    default: 0,
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  firstLoginComplete: {
    type: Boolean,
    default: false
  },
  staff: {
    type: Boolean,
    default: false
  },
  canMakeClues: {
    type: Boolean,
    default: false
  },
  rated_clues: {
    type: Map,
    of: Number,
    default: {},
  },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
