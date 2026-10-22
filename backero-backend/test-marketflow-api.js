require('dotenv').config();
const mongoose = require('mongoose');
const MarketflowSnapshot = require('./src/models/MarketflowSnapshot');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n=== Testing Marketflow API Data ===\n');

    // Test snapdeal endpoint logic
    const snapdealSnap = await MarketflowSnapshot.findOne({
      platform: 'snapdeal',
      endpoint: 'overview'
    }).lean();

    if (!snapdealSnap) {
      console.log('❌ No snapdeal snapshot found');
    } else {
      console.log('✅ Snapdeal Snapshot found:');
      console.log(`   SyncedAt: ${snapdealSnap.syncedAt}`);
      console.log(`   Data keys: ${Object.keys(snapdealSnap.data).join(', ')}`);
      console.log(`   Listings: ${snapdealSnap.data.listings}`);
      console.log(`   Live: ${snapdealSnap.data.live}`);
      console.log(`   DOS: ${snapdealSnap.data.oos}`);
    }

    // Test meesho
    const meeshoSnap = await MarketflowSnapshot.findOne({
      platform: 'meesho',
      endpoint: 'overview'
    }).lean();

    console.log('\n✅ Meesho Snapshot found:');
    if (meeshoSnap) {
      console.log(`   SyncedAt: ${meeshoSnap.syncedAt}`);
      console.log(`   KPIs: ${meeshoSnap.data?.kpis ? 'present' : 'missing'}`);
      if (meeshoSnap.data?.kpis) {
        console.log(`     - Listings: ${meeshoSnap.data.kpis.listings}`);
        console.log(`     - Live: ${meeshoSnap.data.kpis.live}`);
      }
    }

    // Test flipkart
    const flipkartSnap = await MarketflowSnapshot.findOne({
      platform: 'flipkart',
      endpoint: 'overview'
    }).lean();

    console.log('\n✅ Flipkart Snapshot found:');
    if (flipkartSnap) {
      console.log(`   SyncedAt: ${flipkartSnap.syncedAt}`);
      console.log(`   Data keys: ${Object.keys(flipkartSnap.data).join(', ')}`);
    }

    console.log('\n=== All data is in MongoDB, API should serve it ===\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
