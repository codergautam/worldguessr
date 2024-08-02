import mongoose from 'mongoose';

const mapSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    unique: true
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: String,
    required: true
  },
  plays: {
    type: Number,
    default: 0
  },
  hearts: {
    type: Number,
    default: 0
  },
  data: {
    type: Object,
    required: true
  },
  description_short: {
    type: String,
    required: true
  },
  description_long: {
    type: String,
    required: true
  },
  accepted: {
    type: Boolean,
    default: false
  },
  in_review: {
    type: Boolean,
    default: true
  },
  reject_reason: {
    type: String
  },
  resubmittable: {
    type: Boolean,
    default: true
  }
});

const Map = mongoose.models.Map || mongoose.model('Map', mapSchema);

export default Map;
