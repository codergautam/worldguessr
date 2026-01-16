#!/usr/bin/env node
/**
 * Creates the case-insensitive username index with collation
 * 
 * Run with: node scripts/createUsernameIndex.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const mongoUri = process.env.MONGODB;
  
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');

  // Check existing indexes
  console.log('Current indexes on users collection:');
  const existingIndexes = await usersCollection.indexes();
  for (const idx of existingIndexes) {
    const collation = idx.collation ? `collation: ${idx.collation.locale}/${idx.collation.strength}` : 'no collation';
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (${collation})`);
  }
  console.log('');

  // Check if collation index exists
  const hasCollationIndex = existingIndexes.some(
    idx => idx.key?.username === 1 && idx.collation?.locale === 'en' && idx.collation?.strength === 2
  );

  if (hasCollationIndex) {
    console.log('✅ Collation index already exists!');
  } else {
    console.log('Creating username index with collation...');
    
    try {
      await usersCollection.createIndex(
        { username: 1 },
        { 
          collation: { locale: 'en', strength: 2 },
          name: 'username_1_collation_en_2',
          background: true
        }
      );
      console.log('✅ Index created successfully!');
    } catch (err) {
      console.error('❌ Failed to create index:', err.message);
    }
  }

  // Verify indexes after
  console.log('\nIndexes after operation:');
  const finalIndexes = await usersCollection.indexes();
  for (const idx of finalIndexes) {
    const collation = idx.collation ? `collation: ${idx.collation.locale}/${idx.collation.strength}` : 'no collation';
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (${collation})`);
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

