// One-off drain of the applied:false backlog left by the transaction outage.
// Identical logic to cron.js's sweep: CLAIM (CAS on applied:false) then pay,
// so it cannot double-pay a row a deployed sweep is also working on.
import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import StampLedger from './models/StampLedger.js';

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB);

const rows = await StampLedger.find({ applied: false }).lean();
console.log(`${rows.length} stranded rows`);

let paid = 0, cancelled = 0, contended = 0, stamps = 0;
for (const row of rows) {
  if (row.delta < 0) {
    // Stranded debit: the sweep cancels these (it cannot replay delivery).
    if (apply) await StampLedger.deleteOne({ _id: row._id, applied: false });
    cancelled++;
    continue;
  }
  if (!apply) { paid++; stamps += row.delta; continue; }
  const claimed = await StampLedger.findOneAndUpdate(
    { _id: row._id, applied: false },
    { $set: { applied: true, appliedAt: new Date() } },
    { new: true },
  );
  if (!claimed) { contended++; continue; }
  await User.updateOne({ _id: row.userId }, { $inc: { stamps: row.delta } });
  paid++; stamps += row.delta;
}

console.log(`${apply ? 'PAID' : 'would pay'}: ${paid} rows, ${stamps} stamps | cancelled debits: ${cancelled} | contended: ${contended}`);
await mongoose.disconnect();
