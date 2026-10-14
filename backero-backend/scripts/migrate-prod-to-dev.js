// One-off migration: copy every collection from the PRODUCTION Atlas database
// (backero — backs the live Render deployment) into the isolated dev database
// (backero_dev) on the SAME cluster. Read-only against production — this
// script never writes to the source database, only reads from it.
//
// Usage: node scripts/migrate-prod-to-dev.js
require('dotenv').config();
const mongoose = require('mongoose');

const SOURCE_URI = process.env.PROD_MONGODB_URI;
const TARGET_URI = process.env.MONGODB_URI;

async function main() {
  if (!SOURCE_URI || !SOURCE_URI.includes('/backero?')) {
    throw new Error('Set PROD_MONGODB_URI (production connection string, pointing at the backero database) before running this migration.');
  }
  if (!TARGET_URI || !TARGET_URI.includes('backero_dev')) {
    throw new Error('MONGODB_URI in .env must point at the backero_dev database before running this migration.');
  }

  console.log('Connecting to source (production: backero)...');
  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
  console.log('Connecting to target (backero_dev)...');
  const targetConn = await mongoose.createConnection(TARGET_URI).asPromise();

  const collections = await sourceConn.db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in production.`);

  let totalDocs = 0;
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const sourceCol = sourceConn.db.collection(name);
    const count = await sourceCol.countDocuments();
    if (!count) {
      console.log(`  ${name}: 0 docs, skipping`);
      continue;
    }
    const docs = await sourceCol.find({}).toArray();
    const targetCol = targetConn.db.collection(name);
    await targetCol.deleteMany({});
    // Large collections (e.g. activity logs) — insert in batches to avoid one huge bulk op.
    const BATCH = 1000;
    for (let i = 0; i < docs.length; i += BATCH) {
      await targetCol.insertMany(docs.slice(i, i + BATCH), { ordered: false });
    }
    totalDocs += docs.length;
    console.log(`  ${name}: ${docs.length} docs copied`);
  }

  console.log(`\nDone. ${totalDocs} total documents copied from production into backero_dev.`);
  await sourceConn.close();
  await targetConn.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
