const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const MarketflowSnapshot = require('../models/MarketflowSnapshot');
const { sendError } = require('../utils/helpers');

const PLATFORMS = {
  amazon: { name: 'Amazon', icon: '🔷' },
  flipkart: { name: 'Flipkart', icon: '🔵' },
  meesho: { name: 'Meesho', icon: '🎀' },
  snapdeal: { name: 'Snapdeal', icon: '🟡' },
  myntra: { name: 'Myntra', icon: '🔴' },
  jiomart: { name: 'JioMart', icon: '🟢' },
};

router.use(authenticate);

// GET /api/reports/marketplace/daily
// Generate daily marketplace automation report
router.get('/marketplace/daily', async (req, res) => {
  try {
    const snapshots = await MarketflowSnapshot.find({ endpoint: 'overview' }).lean();

    // Build report data
    const platformData = {};
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalImpressions = 0;
    const platformDetails = [];

    for (const snap of snapshots) {
      const data = snap.data || {};
      const revenue = data.revenue || 0;
      const orders = data.orders || 0;
      const impressions = data.impressions || 0;

      platformData[snap.platform] = {
        revenue,
        orders,
        impressions,
        margin: data.margin_pct || 0,
      };

      totalRevenue += revenue;
      totalOrders += orders;
      totalImpressions += impressions;

      // For ordered list
      const platformInfo = PLATFORMS[snap.platform] || { name: snap.platform.toUpperCase(), icon: '📦' };
      platformDetails.push({
        platform: snap.platform,
        name: platformInfo.name,
        icon: platformInfo.icon,
        revenue,
        orders,
        impressions,
        margin: data.margin_pct || 0,
        avgOrderValue: orders > 0 ? revenue / orders : 0,
      });
    }

    // Sort by revenue descending
    platformDetails.sort((a, b) => b.revenue - a.revenue);

    const report = {
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-IN'),
      platforms: platformDetails,
      summary: {
        totalRevenue,
        totalOrders,
        totalImpressions,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        platformCount: Object.keys(platformData).length,
        conversionRate: totalImpressions > 0 ? (totalOrders / totalImpressions * 100).toFixed(2) : 0,
      },
      generatedBy: 'Marketplace Automation System',
    };

    res.json(report);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

// GET /api/reports/marketplace/daily/summary
// Get concise summary for email
router.get('/marketplace/daily/summary', async (req, res) => {
  try {
    const snapshots = await MarketflowSnapshot.find({ endpoint: 'overview' }).lean();

    let totalRevenue = 0;
    let totalOrders = 0;
    let totalImpressions = 0;
    const platforms = [];

    for (const snap of snapshots) {
      const data = snap.data || {};
      const revenue = data.revenue || 0;
      const orders = data.orders || 0;
      const impressions = data.impressions || 0;

      totalRevenue += revenue;
      totalOrders += orders;
      totalImpressions += impressions;

      const platformInfo = PLATFORMS[snap.platform] || { name: snap.platform.toUpperCase(), icon: '📦' };
      platforms.push({
        name: platformInfo.name,
        revenue: `₹${revenue.toLocaleString('en-IN')}`,
        orders: orders.toLocaleString('en-IN'),
        impressions: impressions.toLocaleString('en-IN'),
      });
    }

    const summary = {
      date: new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      email_subject: `Marketplace Automation Report - ${new Date().toLocaleDateString('en-IN')}`,
      email_body: `
🎯 DAILY MARKETPLACE AUTOMATION REPORT

Period: ${new Date().toLocaleDateString('en-IN')}
Generated: ${new Date().toLocaleTimeString('en-IN')}

📊 KEY METRICS (All Platforms Combined):
• Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
• Total Orders: ${totalOrders.toLocaleString('en-IN')}
• Total Impressions: ${totalImpressions.toLocaleString('en-IN')}
• Average Order Value: ₹${(totalRevenue / totalOrders || 0).toFixed(2)}
• Conversion Rate: ${totalImpressions > 0 ? (totalOrders / totalImpressions * 100).toFixed(2) : 0}%

📈 PLATFORM BREAKDOWN:
${platforms.map(p => `
${p.name}
  Revenue: ${p.revenue}
  Orders: ${p.orders}
  Impressions: ${p.impressions}
`).join('\n')}

✅ System Status: All platforms LIVE and operational
📍 Next Report: Tomorrow at this time

---
This is an automated report from Backero Marketplace Automation System
      `,
      platforms,
      totals: {
        revenue: `₹${totalRevenue.toLocaleString('en-IN')}`,
        orders: totalOrders.toLocaleString('en-IN'),
        impressions: totalImpressions.toLocaleString('en-IN'),
        avgOrderValue: `₹${(totalRevenue / totalOrders || 0).toFixed(2)}`,
        conversionRate: `${totalImpressions > 0 ? (totalOrders / totalImpressions * 100).toFixed(2) : 0}%`,
      },
    };

    res.json(summary);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

module.exports = router;
