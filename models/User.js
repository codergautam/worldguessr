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
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
