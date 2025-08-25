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
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: String,
    required: true
  },
  map_creator_name: {
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
    required: false,
    default: ''
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
  },
  countryMap: {
    type: String,
    required: false
  },
  official: {
    type: Boolean,
    default: false
  },
  maxDist: {
    type: Number,
    required: true,
    default: 20000
  },
  spotlight: {
    type: Boolean,
    default: false
  },
});

const Map = mongoose.models.Map || mongoose.model('Map', mapSchema);

export default Map;
