import User from '../models/User.js';
import UserStats from '../models/UserStats.js';
import Map from '../models/Map.js';
import Game from '../models/Game.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Promisify readline question
const question = (query) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

async function deleteUserData() {
    console.log('🗑️  WorldGuessr User Data Deletion Script');
    console.log('========================================\n');

    try {
        // Check if MongoDB URI is available
        const mongoUri = process.env.MONGODB || process.env.MONGODB_URI || process.env.MONGO_URL;
        if (!mongoUri) {
            console.log('❌ MongoDB connection string not found!');
            console.log('Please set either MONGODB, MONGODB_URI or MONGO_URL environment variable.');
            console.log('You can either:');
            console.log('  1. Create a .env file in the root directory with MONGODB=your_connection_string');
            console.log('  2. Run: MONGODB=your_connection_string node scripts/deleteUser.js');
            console.log('  3. Export the environment variable in your shell');
            return;
        }

        // Connect to MongoDB
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get username from user input
        const username = await question('Enter username to delete (case-insensitive): ');
        
        if (!username || username.trim().length === 0) {
            console.log('❌ Invalid username provided');
            return;
        }

        const trimmedUsername = username.trim();

        // Find the user (case-insensitive)
        console.log(`🔍 Searching for user: "${trimmedUsername}"`);
        const user = await User.findOne({
            username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") }
        });

        if (!user) {
            console.log(`❌ User "${trimmedUsername}" not found`);
            return;
        }

        console.log(`\n📋 User found:`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   Account ID: ${user._id}`);
        console.log(`   Total XP: ${user.totalXp || 0}`);
        console.log(`   ELO: ${user.elo || 1000}`);
        console.log(`   Created: ${user.created_at}`);

        // Count related data
        const userStatsCount = await UserStats.countDocuments({ userId: user._id });
        const mapsCount = await Map.countDocuments({ created_by: user._id });
        const gamesCount = await Game.countDocuments({ 'players.accountId': user._id });

        console.log(`\n📊 Related data to be affected:`);
        console.log(`   UserStats entries: ${userStatsCount}`);
        console.log(`   Maps created: ${mapsCount}`);
        console.log(`   Games participated in: ${gamesCount} (user data will be anonymized)`);

        // Confirmation prompt
        console.log('\n⚠️  WARNING: This action is IRREVERSIBLE!');
        console.log('This will permanently delete:');
        console.log('- User account and all profile data');
        console.log('- All user statistics and progression history'); 
        console.log('- All maps created by this user');
        console.log('- User data in games (anonymized - games themselves will remain)');

        const confirmation = await question('\nType "DELETE" to confirm deletion: ');
        
        if (confirmation !== 'DELETE') {
            console.log('❌ Deletion cancelled');
            return;
        }

        console.log('\n🗑️  Starting deletion process...\n');
        
        let deletionStats = {
            userStatsDeleted: 0,
            mapsDeleted: 0,
            gamesPlayerDataAnonymized: 0,
            gameRoundDataAnonymized: 0,
            userAccountDeleted: 0
        };

        // 1. Delete UserStats
        if (userStatsCount > 0) {
            console.log(`🔄 Step 1/4: Deleting UserStats entries...`);
            console.log(`   📊 Found ${userStatsCount} UserStats entries to delete`);
            
            const userStatsResult = await UserStats.deleteMany({ userId: user._id });
            deletionStats.userStatsDeleted = userStatsResult.deletedCount;
            
            console.log(`   ✅ Successfully deleted ${userStatsResult.deletedCount}/${userStatsCount} UserStats entries`);
            if (userStatsResult.deletedCount !== userStatsCount) {
                console.log(`   ⚠️  Warning: Expected ${userStatsCount} but deleted ${userStatsResult.deletedCount}`);
            }
        } else {
            console.log(`🔄 Step 1/4: No UserStats entries to delete`);
        }

        // 2. Delete Maps
        if (mapsCount > 0) {
            console.log(`\n🔄 Step 2/4: Deleting Maps created by user...`);
            console.log(`   🗺️  Found ${mapsCount} maps to delete`);
            
            // Get map details before deletion for logging
            const mapsToDelete = await Map.find({ created_by: user._id }).select('name slug accepted').lean();
            console.log(`   📋 Maps to be deleted:`);
            mapsToDelete.forEach((map, index) => {
                const status = map.accepted ? '✅ Accepted' : '⏳ Pending/Rejected';
                console.log(`      ${index + 1}. "${map.name}" (${map.slug}) - ${status}`);
            });
            
            const mapsResult = await Map.deleteMany({ created_by: user._id });
            deletionStats.mapsDeleted = mapsResult.deletedCount;
            
            console.log(`   ✅ Successfully deleted ${mapsResult.deletedCount}/${mapsCount} maps`);
            if (mapsResult.deletedCount !== mapsCount) {
                console.log(`   ⚠️  Warning: Expected ${mapsCount} but deleted ${mapsResult.deletedCount}`);
            }
        } else {
            console.log(`\n🔄 Step 2/4: No maps to delete`);
        }

        // 3. Anonymize user data in Games (don't delete entire games as they may have other players)
        if (gamesCount > 0) {
            console.log(`\n🔄 Step 3/4: Anonymizing user data in games...`);
            console.log(`   🎮 Found ${gamesCount} games where user participated`);
            
            // Get some game details for logging
            const userGames = await Game.find({ 'players.accountId': user._id })
                .select('gameType gameId startedAt players.accountId')
                .limit(5)
                .lean();
            
            console.log(`   📋 Sample of games to be anonymized (showing first 5):`);
            userGames.forEach((game, index) => {
                const playerCount = game.players.length;
                console.log(`      ${index + 1}. ${game.gameType} (${game.gameId}) - ${playerCount} players - ${game.startedAt.toISOString().split('T')[0]}`);
            });
            
            if (gamesCount > 5) {
                console.log(`      ... and ${gamesCount - 5} more games`);
            }
            
            console.log(`   🔄 Anonymizing player summary data...`);
            // Update games where this user appears in players array
            const gameUpdateResult = await Game.updateMany(
                { 'players.accountId': user._id },
                { 
                    $set: {
                        'players.$[elem].username': '[Deleted User]',
                        'players.$[elem].accountId': null
                    }
                },
                { 
                    arrayFilters: [{ 'elem.accountId': user._id }],
                    multi: true 
                }
            );
            deletionStats.gamesPlayerDataAnonymized = gameUpdateResult.modifiedCount;

            console.log(`   🔄 Anonymizing round guess data...`);
            // Update games where this user appears in round guesses
            const roundUpdateResult = await Game.updateMany(
                { 'rounds.playerGuesses.accountId': user._id },
                { 
                    $set: {
                        'rounds.$[].playerGuesses.$[guess].username': '[Deleted User]',
                        'rounds.$[].playerGuesses.$[guess].accountId': null
                    }
                },
                { 
                    arrayFilters: [{ 'guess.accountId': user._id }],
                    multi: true 
                }
            );
            deletionStats.gameRoundDataAnonymized = roundUpdateResult.modifiedCount;

            console.log(`   ✅ Anonymized player data in ${gameUpdateResult.modifiedCount} games`);
            console.log(`   ✅ Anonymized round data in ${roundUpdateResult.modifiedCount} games`);
            console.log(`   ℹ️  Games preserved for other players - only user data anonymized`);
        } else {
            console.log(`\n🔄 Step 3/4: No games to anonymize`);
        }

        // 4. Delete User account (do this last)
        console.log(`\n🔄 Step 4/4: Deleting user account...`);
        console.log(`   👤 Deleting account: ${user.username} (${user._id})`);
        console.log(`   📧 Email: ${user.email || 'N/A'}`);
        console.log(`   📅 Account age: ${Math.floor((Date.now() - user.created_at) / (1000 * 60 * 60 * 24))} days`);
        
        const userResult = await User.deleteOne({ _id: user._id });
        deletionStats.userAccountDeleted = userResult.deletedCount;
        
        console.log(`   ✅ Successfully deleted user account`);

        console.log('\n🎉 User deletion completed successfully!');
        console.log('\n' + '='.repeat(60));
        console.log('📊 DELETION SUMMARY');
        console.log('='.repeat(60));
        console.log(`👤 User Account:       ${deletionStats.userAccountDeleted} deleted`);
        console.log(`📈 UserStats Entries:  ${deletionStats.userStatsDeleted} deleted`);
        console.log(`🗺️  Maps Created:       ${deletionStats.mapsDeleted} deleted`);
        console.log(`🎮 Games (Player Data): ${deletionStats.gamesPlayerDataAnonymized} anonymized`);
        console.log(`🎯 Games (Round Data):  ${deletionStats.gameRoundDataAnonymized} anonymized`);
        console.log('='.repeat(60));
        console.log('ℹ️  Note: Games were preserved for other players, only user data was anonymized');
        console.log(`⏱️  Process completed at: ${new Date().toISOString()}`);

    } catch (error) {
        console.error('\n❌ Error during deletion process:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Run if called directly
if (process.argv[1]?.endsWith('deleteUser.js')) {
    deleteUserData();
}

export default deleteUserData;