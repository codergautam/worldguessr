import UserStatsService from '../components/utils/userStatsService.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function updateAllUserStats() {
    console.log('Starting bulk UserStats update...');

    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB);
        console.log('Connected to MongoDB');

        // Get all users (in batches to avoid memory issues)
        const batchSize = 100;
        let skip = 0;
        let totalUpdated = 0;
        let totalErrors = 0;

        while (true) {
            const users = await User.find({ banned: { $ne: true } })
                .select('_id username totalXp elo')
                .skip(skip)
                .limit(batchSize)
                .lean();

            if (users.length === 0) {
                break; // No more users
            }

            console.log(`Processing batch of ${users.length} users (starting from ${skip})`);

            // Process each user in the batch
            for (const user of users) {
                try {
                    // Record current stats snapshot
                    const result = await UserStatsService.recordGameStats(user._id, null, {
                        triggerEvent: 'weekly_update',
                        batchUpdate: true
                    });

                    if (result) {
                        totalUpdated++;
                        if (totalUpdated % 50 === 0) {
                            console.log(`Updated ${totalUpdated} users so far...`);
                        }
                    } else {
                        console.warn(`Failed to update stats for user: ${user.username || user._id}`);
                        totalErrors++;
                    }
                } catch (error) {
                    console.error(`Error updating user ${user.username || user._id}:`, error.message);
                    totalErrors++;
                }
            }

            skip += batchSize;

            // Small delay between batches to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\nBulk UserStats update completed!`);
        console.log(`✅ Successfully updated: ${totalUpdated} users`);
        console.log(`❌ Errors: ${totalErrors} users`);

    } catch (error) {
        console.error('Bulk update failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    updateAllUserStats();
}

export default updateAllUserStats;