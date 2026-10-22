require('dotenv').config();
const mongoose = require('mongoose');
const MarketflowSnapshot = require('./src/models/MarketflowSnapshot');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n=== Debugging MongoDB Field Names ===\n');

    // Get raw MongoDB documents to see exact field names
    const db = mongoose.connection;
    const collection = db.collection('marketflowsnapshots');

    const docs = await collection.find({}).toArray();
    console.log(`Found ${docs.length} raw documents:\n`);

    docs.forEach((doc, i) => {
      console.log(`Document ${i + 1}:`);
      console.log(`  _id: ${doc._id}`);
      console.log(`  platform: ${doc.platform} (type: ${typeof doc.platform})`);
      console.log(`  endpoint: ${doc.endpoint} (type: ${typeof doc.endpoint})`);
      console.log(`  syncedAt: ${doc.syncedAt}`);
      console.log(`  All keys: ${Object.keys(doc).join(', ')}`);

      // Test exact query
      console.log(`\n  Testing exact query for this doc:`);
      const query = { platform: doc.platform, endpoint: doc.endpoint };
      console.log(`    Query: ${JSON.stringify(query)}`);
    });

    // Now test with Mongoose
    console.log('\n=== Testing Mongoose Queries ===\n');

    const snapdealTest = await MarketflowSnapshot.findOne({
      platform: 'snapdeal',
      endpoint: 'overview'
    }).lean();
    console.log(`✓ findOne({platform: 'snapdeal', endpoint: 'overview'}): ${snapdealTest ? 'FOUND' : 'NOT FOUND'}`);

    const meeshoTest = await MarketflowSnapshot.findOne({
      platform: 'meesho',
      endpoint: 'overview'
    }).lean();
    console.log(`✓ findOne({platform: 'meesho', endpoint: 'overview'}): ${meeshoTest ? 'FOUND' : 'NOT FOUND'}`);

    const flipkartTest = await MarketflowSnapshot.findOne({
      platform: 'flipkart',
      endpoint: 'overview'
    }).lean();
    console.log(`✓ findOne({platform: 'flipkart', endpoint: 'overview'}): ${flipkartTest ? 'FOUND' : 'NOT FOUND'}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
