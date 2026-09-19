// One-off migration: copy every collection from the local Docker Mongo
// (backero_local_dev) into the new isolated Atlas database (backero_dev) on
// the shared cluster, preserving _id and all fields exactly (raw driver
// collection copy, not Mongoose model writes, so no schema casting/validation
// gets in the way of an exact copy).
//
// Usage: node scripts/migrate-to-atlas.js
require('dotenv').config();
const mongoose = require('mongoose');

const SOURCE_URI = 'mongodb://localhost:27017/backero_local_dev';
const TARGET_URI = process.env.MONGODB_URI;

async function main() {
  if (!TARGET_URI || !TARGET_URI.includes('backero_dev')) {
    throw new Error('MONGODB_URI in .env must point at the backero_dev database before running this migration.');
  }

  console.log('Connecting to source (local)...');
  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
  console.log('Connecting to target (Atlas backero_dev)...');
  const targetConn = await mongoose.createConnection(TARGET_URI).asPromise();

  const collections = await sourceConn.db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in source.`);

  let totalDocs = 0;
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const sourceCol = sourceConn.db.collection(name);
    const docs = await sourceCol.find({}).toArray();
    if (!docs.length) {
      console.log(`  ${name}: 0 docs, skipping`);
      continue;
    }
    const targetCol = targetConn.db.collection(name);
    // Idempotent: clear any prior partial copy of this collection in the target first.
    await targetCol.deleteMany({});
    await targetCol.insertMany(docs, { ordered: false });
    totalDocs += docs.length;
    console.log(`  ${name}: ${docs.length} docs copied`);
  }

  console.log(`\nDone. ${totalDocs} total documents copied into backero_dev.`);
  await sourceConn.close();
  await targetConn.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
