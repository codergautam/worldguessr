import mongoose from 'mongoose';

// Last-completed bookmark for each periodic job.
//
// This exists so a cron process that was DOWN across a UTC boundary still runs
// that boundary exactly once on boot, instead of skipping it forever. A job that
// only fires on a timer tick silently loses every rollover that happened while
// the process was restarting, deploying or crashed; comparing the current period
// key against lastPeriodKey turns "did the tick fire" into "has this period been
// processed", which survives arbitrary downtime.
//
// Writers must stamp lastPeriodKey only AFTER the job's work has committed —
// stamping first converts a mid-run crash into a permanently skipped period.
const cronStateSchema = new mongoose.Schema({
  // Stable job identifier, e.g. 'stampsDailyReset', 'seasonRollover',
  // 'leagueRecalibration'.
  job: {
    type: String,
    required: true,
  },
  // Period key of the last SUCCESSFULLY completed run, e.g. '2026-08-06'
  // or '2026-W32' or '2026-S3'.
  lastPeriodKey: {
    type: String,
  },
  lastRunAt: {
    type: Date,
  },
});

cronStateSchema.index({ job: 1 }, { unique: true });

const CronState = mongoose.models.CronState || mongoose.model('CronState', cronStateSchema);

export default CronState;
