# Maintenance Scripts

This directory contains maintenance scripts for UserStats management.

## Scripts

### `weeklyMaintenance.js`
Comprehensive weekly maintenance script that:
- Updates all users' UserStats with their current XP/ELO data
- Keeps inactive players' progression graphs current
- Cleans up old UserStats data (older than 2 years)

### `updateAllUserStats.js` 
Updates all users' UserStats with their latest data from the User collection.
Useful for:
- Ensuring inactive players have current data points
- Maintaining accurate progression graphs
- Batch updating after system changes

### `cleanupUserStats.js`
Removes old UserStats entries to manage database size.

## Cron Setup

Add these to your server's crontab (`crontab -e`):

```bash
# Weekly maintenance - Sundays at 3 AM
0 3 * * 0 cd /path/to/worldguessr && node scripts/weeklyMaintenance.js >> logs/maintenance.log 2>&1

# Alternative: Run individual scripts
# Weekly UserStats update - Sundays at 2 AM  
0 2 * * 0 cd /path/to/worldguessr && node scripts/updateAllUserStats.js >> logs/userstats.log 2>&1

# Monthly cleanup - 1st of month at 4 AM
0 4 1 * * cd /path/to/worldguessr && node scripts/cleanupUserStats.js >> logs/cleanup.log 2>&1
```

## Environment

Scripts require:
- `MONGODB_URI` or `MONGO_URL` environment variable
- All project dependencies installed
- MongoDB connection access

## Monitoring

Logs are written to:
- Console output (can be redirected to log files)
- Database connection status
- Progress updates during batch operations
- Error handling and reporting

## Benefits

- **Inactive Users**: Ensures progression graphs stay current even for users who don't play frequently
- **Data Integrity**: Regular snapshots maintain accurate historical data
- **Performance**: Cleanup prevents database bloat
- **Reliability**: Batch operations handle errors gracefully