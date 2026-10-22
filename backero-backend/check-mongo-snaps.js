require('dotenv').config();
const mongoose = require('mongoose');
const MarketflowSnapshot = require('./src/models/MarketflowSnapshot');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n=== MarketflowSnapshot Collection ===');
    const snaps = await MarketflowSnapshot.find({}).lean();
    console.log(`Total documents: ${snaps.length}\n`);

    snaps.forEach(s => {
      console.log(`Platform: ${s.platform}`);
      console.log(`Endpoint: ${s.endpoint}`);
      console.log(`SyncedAt: ${s.syncedAt}`);
      if (s.data) {
        console.log(`Data: ${JSON.stringify(s.data).substring(0, 200)}...`);
      } else {
        console.log('Data: EMPTY');
      }
      console.log('---');
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
