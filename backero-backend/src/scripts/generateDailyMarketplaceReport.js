require('dotenv').config();
const mongoose = require('mongoose');
const MarketflowSnapshot = require('../models/MarketflowSnapshot');

const PLATFORMS = {
  amazon: { name: 'Amazon', icon: '🔷' },
  flipkart: { name: 'Flipkart', icon: '🔵' },
  meesho: { name: 'Meesho', icon: '🎀' },
  snapdeal: { name: 'Snapdeal', icon: '🟡' },
  myntra: { name: 'Myntra', icon: '🔴' },
  jiomart: { name: 'JioMart', icon: '🟢' },
};

async function generateDailyReport() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fetch all platform data
    const snapshots = await MarketflowSnapshot.find({ endpoint: 'overview' }).lean();

    // Build report data
    const reportData = {};
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalImpressions = 0;

    for (const snap of snapshots) {
      const platformData = snap.data || {};
      const revenue = platformData.revenue || 0;
      const orders = platformData.orders || 0;
      const impressions = platformData.impressions || 0;

      reportData[snap.platform] = {
        revenue,
        orders,
        impressions,
        margin: platformData.margin_pct || 0,
      };

      totalRevenue += revenue;
      totalOrders += orders;
      totalImpressions += impressions;
    }

    // Generate report
    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    console.log('\n========================================');
    console.log('📊 MARKETPLACE AUTOMATION DAILY REPORT');
    console.log('========================================');
    console.log(`Generated: ${timestamp}`);
    console.log('========================================\n');

    console.log('📈 PLATFORM-WISE PERFORMANCE:\n');

    Object.entries(reportData).forEach(([platform, data]) => {
      const platformInfo = PLATFORMS[platform] || { name: platform.toUpperCase(), icon: '📦' };
      console.log(`${platformInfo.icon} ${platformInfo.name.toUpperCase()}`);
      console.log(`   Revenue: ₹${data.revenue?.toLocaleString('en-IN') || '0'}`);
      console.log(`   Orders:  ${data.orders?.toLocaleString('en-IN') || '0'}`);
      console.log(`   Impressions: ${data.impressions?.toLocaleString('en-IN') || '0'}`);
      if (data.margin > 0) console.log(`   Margin: ${data.margin.toFixed(1)}%`);
      console.log('');
    });

    console.log('========================================');
    console.log('📊 CONSOLIDATED SUMMARY (All Platforms)');
    console.log('========================================');
    console.log(`Total Revenue:    ₹${totalRevenue.toLocaleString('en-IN')}`);
    console.log(`Total Orders:     ${totalOrders.toLocaleString('en-IN')}`);
    console.log(`Total Impressions: ${totalImpressions.toLocaleString('en-IN')}`);
    console.log(`Avg Order Value:  ₹${(totalRevenue / totalOrders || 0).toFixed(2)}`);
    console.log('========================================\n');

    // Return structured data for API/email
    const report = {
      generatedAt: new Date().toISOString(),
      platforms: reportData,
      summary: {
        totalRevenue,
        totalOrders,
        totalImpressions,
        avgOrderValue: totalRevenue / totalOrders || 0,
        platformCount: Object.keys(reportData).length,
      },
    };

    console.log('✅ Report generated successfully');
    process.exit(0);

    return report;
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

generateDailyReport();
