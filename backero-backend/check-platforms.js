require('dotenv').config();
const mongoose = require('mongoose');
const MarketflowSnapshot = require('./src/models/MarketflowSnapshot');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n=== MEESHO DATA ===');
    const meesho = await MarketflowSnapshot.findOne({ platform: 'meesho', endpoint: 'overview' }).lean();
    if (meesho) {
      console.log('✓ Status: Found in DB');
      console.log('  Listings:', meesho.data?.kpis?.listings);
      console.log('  Live:', meesho.data?.kpis?.live);
      console.log('  SyncedAt:', meesho.syncedAt);
      console.log('  Full KPIs:', meesho.data?.kpis);
    } else {
      console.log('✗ Status: NOT FOUND in DB');
    }

    console.log('\n=== AMAZON DATA ===');
    const amazon = await MarketflowSnapshot.findOne({ platform: 'amazon', endpoint: 'overview' }).lean();
    if (amazon) {
      console.log('✓ Status: Found in DB');
      console.log('  Data keys:', Object.keys(amazon.data || {}));
      console.log('  SyncedAt:', amazon.syncedAt);
    } else {
      console.log('✗ Status: NOT FOUND in DB');
      console.log('  Reason: Amazon service needs separate amazon-server deployment');
    }

    console.log('\n=== ALL PLATFORMS ===');
    const all = await MarketflowSnapshot.find({}).lean();
    console.log(`Total: ${all.length} documents`);
    all.forEach(doc => {
      console.log(`  - ${doc.platform}: ${doc.endpoint} (${new Date(doc.syncedAt).toLocaleTimeString()})`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
