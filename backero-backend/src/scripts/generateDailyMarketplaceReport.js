require('dotenv').config();
const axios = require('axios');

// CLI counterpart to GET /api/reports/marketplace/daily — reads the same
// live source (amazon-server's /v1/dashboard/unified, loopback-only, no
// auth needed) instead of MongoDB, so it never needs seed data and can't
// drift from what the API route reports.
const { MARKETFLOW_AMAZON_PORT = 4000 } = process.env;

const PLATFORM_META = {
  amazon_in: { name: 'Amazon', icon: '🔷' },
  flipkart: { name: 'Flipkart', icon: '🔵' },
  meesho: { name: 'Meesho', icon: '🎀' },
  snapdeal: { name: 'Snapdeal', icon: '🟡' },
};

async function generateDailyReport() {
  try {
    const { data: unified } = await axios.get(
      `http://127.0.0.1:${MARKETFLOW_AMAZON_PORT}/v1/dashboard/unified`,
      { timeout: 20000 },
    );

    const platformsBreakdown = unified.platforms || {};
    const { total_revenue: totalRevenue, total_orders: totalOrders, total_impressions: totalImpressions } = unified;

    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    console.log('\n========================================');
    console.log('📊 MARKETPLACE AUTOMATION DAILY REPORT');
    console.log('========================================');
    console.log(`Generated: ${timestamp}`);
    console.log('Source: amazon-server /v1/dashboard/unified (live)');
    console.log('========================================\n');

    console.log('📈 PLATFORM-WISE PERFORMANCE:\n');
    for (const [rawKey, data] of Object.entries(platformsBreakdown)) {
      const meta = PLATFORM_META[rawKey] || { name: rawKey, icon: '📦' };
      console.log(`${meta.icon} ${meta.name.toUpperCase()}`);
      console.log(`   Revenue: ${data?.revenue != null ? `₹${Number(data.revenue).toLocaleString('en-IN')}` : 'not tracked'}`);
      console.log(`   Orders:  ${data?.orders != null ? Number(data.orders).toLocaleString('en-IN') : 'not tracked'}`);
      console.log(`   Open Alerts: ${data?.open_alerts ?? '—'}`);
      console.log('');
    }

    console.log('========================================');
    console.log('📊 CONSOLIDATED SUMMARY (All Platforms)');
    console.log('========================================');
    console.log(`Total Revenue:     ${totalRevenue != null ? `₹${Number(totalRevenue).toLocaleString('en-IN')}` : 'not tracked'}`);
    console.log(`Total Orders:      ${totalOrders != null ? Number(totalOrders).toLocaleString('en-IN') : 'not tracked'}`);
    console.log(`Total Impressions: ${totalImpressions != null ? Number(totalImpressions).toLocaleString('en-IN') : 'not tracked'}`);
    if (totalRevenue != null && totalOrders) {
      console.log(`Avg Order Value:   ₹${(totalRevenue / totalOrders).toFixed(2)}`);
    }
    console.log('========================================\n');

    console.log('✅ Report generated successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.response?.data?.error || err.message);
    console.error('   (is amazon-server running on port ' + MARKETFLOW_AMAZON_PORT + '?)');
    process.exit(1);
  }
}

generateDailyReport();
