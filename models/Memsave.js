import mongoose from 'mongoose';

const memsaveSchema = new mongoose.Schema({
  created_at: {
    type: Date,
    default: Date.now,
  },
  players: {
    type: 'Number',
    default: 0
  },
  memusage: {
  type: 'Number',
  default: 0
},
games: {
  type:'Number',
  default: 0
}

});

const Memsave = mongoose.models.Memsave || mongoose.model('Memsave', memsaveSchema);

export default Memsave;
