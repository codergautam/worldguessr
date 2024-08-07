import mongoose from 'mongoose';

const clueSchema = new mongoose.Schema({
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  clue: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: String,
    required: true,
  },
  rating: {
    type: mongoose.Types.Decimal128,
    default: 0,
  },
  ratingCnt: {
    type: Number,
    default: 0,
  }
});

const Clue = mongoose.models.Clue || mongoose.model('Clue', clueSchema);

export default Clue;
