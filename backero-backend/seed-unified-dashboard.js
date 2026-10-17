require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const MarketflowSnapshot = require('./src/models/MarketflowSnapshot');

    // Clear existing data for better fresh data
    await MarketflowSnapshot.deleteMany({});
    console.log('✓ Cleared all marketplace data');

    // Flipkart - unified dashboard format
    const flipkartData = {
      revenue: 52400,
      orders: 156,
      impressions: 156800,
      margin_pct: 18.5,
      listings: 247,
      active: 198,
      avg_rating: 4.3,
    };

    // Meesho - unified dashboard format
    const meeshoData = {
      revenue: 42800,
      orders: 234,
      impressions: 145230,
      margin_pct: 22.3,
      listings: 1248,
      live: 1089,
      blocked: 45,
      avg_rating: 4.5,
    };

    // Snapdeal - unified dashboard format
    const snapdealData = {
      revenue: 31250,
      orders: 92,
      impressions: 62340,
      margin_pct: 16.8,
      listings: 856,
      active: 723,
      avg_rating: 4.1,
    };

    // Myntra - unified dashboard format
    const myntraData = {
      revenue: 78900,
      orders: 234,
      impressions: 285600,
      margin_pct: 24.5,
      listings: 342,
      active: 289,
      avg_rating: 4.4,
    };

    // JioMart - unified dashboard format
    const jiomartData = {
      revenue: 65780,
      orders: 189,
      impressions: 234500,
      margin_pct: 19.2,
      listings: 567,
      active: 501,
      avg_rating: 4.2,
    };

    await Promise.all([
      MarketflowSnapshot.create({ platform: 'flipkart', endpoint: 'overview', data: flipkartData, synced_at: new Date() }),
      MarketflowSnapshot.create({ platform: 'meesho', endpoint: 'overview', data: meeshoData, synced_at: new Date() }),
      MarketflowSnapshot.create({ platform: 'snapdeal', endpoint: 'overview', data: snapdealData, synced_at: new Date() }),
      MarketflowSnapshot.create({ platform: 'myntra', endpoint: 'overview', data: myntraData, synced_at: new Date() }),
      MarketflowSnapshot.create({ platform: 'jiomart', endpoint: 'overview', data: jiomartData, synced_at: new Date() }),
    ]);

    console.log('✓ Seeded Flipkart: ₹52,400 revenue, 156 orders');
    console.log('✓ Seeded Meesho: ₹42,800 revenue, 234 orders');
    console.log('✓ Seeded Snapdeal: ₹31,250 revenue, 92 orders');
    console.log('✓ Seeded Myntra: ₹78,900 revenue, 234 orders');
    console.log('✓ Seeded JioMart: ₹65,780 revenue, 189 orders');
    console.log('\n✅ Dashboard data seeded! Total: ₹271,130 (without Amazon)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
