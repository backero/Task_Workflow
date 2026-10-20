const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { forward } = require('../services/marketflow.service');
const { sendError } = require('../utils/helpers');

// Real-only: Amazon, Flipkart, Meesho, Snapdeal — the 4 platforms actually
// integrated (see marketflow.routes.js). Keyed by amazon-server's own
// /v1/dashboard/unified response, which already aggregates all 4 live
// (confirmed shape: { platforms: { amazon_in, flipkart, meesho, snapdeal },
// total_revenue, total_orders, total_impressions, avg_margin }) — no Mongo
// reads or seed data needed here.
const PLATFORM_META = {
  amazon_in: { key: 'amazon', name: 'Amazon' },
  flipkart: { key: 'flipkart', name: 'Flipkart' },
  meesho: { key: 'meesho', name: 'Meesho' },
  snapdeal: { key: 'snapdeal', name: 'Snapdeal' },
};

router.use(authenticate);

async function fetchUnified() {
  const { data } = await forward('v1', 'GET', '/dashboard/unified', {});
  return data || {};
}

function buildPlatformDetails(unified) {
  const platformsBreakdown = unified.platforms || {};
  return Object.entries(platformsBreakdown)
    .map(([rawKey, p]) => {
      const meta = PLATFORM_META[rawKey] || { key: rawKey, name: rawKey };
      const revenue = p?.revenue ?? null;
      const orders = p?.orders ?? null;
      return {
        platform: meta.key,
        name: meta.name,
        revenue,
        orders,
        openAlerts: p?.open_alerts ?? null,
        avgOrderValue: revenue != null && orders ? revenue / orders : null,
      };
    })
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
}

// GET /api/reports/marketplace/daily
// Live cross-platform totals, read straight from the already-working
// amazon-server unified dashboard — same source the Live Automation
// Cross-Platform Summary tab uses, so the numbers always agree.
router.get('/marketplace/daily', async (_req, res) => {
  try {
    const unified = await fetchUnified();
    const platformDetails = buildPlatformDetails(unified);

    res.json({
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-IN'),
      source: 'amazon-server /v1/dashboard/unified (live)',
      platforms: platformDetails,
      summary: {
        totalRevenue: unified.total_revenue ?? null,
        totalOrders: unified.total_orders ?? null,
        totalImpressions: unified.total_impressions ?? null,
        avgMargin: unified.avg_margin ?? null,
        platformCount: platformDetails.length,
      },
      generatedBy: 'Marketplace Automation System',
    });
  } catch (err) {
    return sendError(res, err.message, err.status || 500);
  }
});

// GET /api/reports/marketplace/daily/summary
// Email-ready text version of the same live figures. Fields the live
// endpoint doesn't return are labelled "not tracked" rather than defaulted
// to 0, so a missing number never reads as a real zero.
router.get('/marketplace/daily/summary', async (_req, res) => {
  try {
    const unified = await fetchUnified();
    const platformDetails = buildPlatformDetails(unified);
    const { total_revenue: totalRevenue, total_orders: totalOrders, total_impressions: totalImpressions } = unified;

    const fmtMoney = (v) => (v != null ? `₹${Number(v).toLocaleString('en-IN')}` : 'not tracked');
    const fmtNum = (v) => (v != null ? Number(v).toLocaleString('en-IN') : 'not tracked');

    const dateLabel = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const body = `
🎯 DAILY MARKETPLACE AUTOMATION REPORT

Period: ${new Date().toLocaleDateString('en-IN')}
Generated: ${new Date().toLocaleTimeString('en-IN')}

📊 KEY METRICS (All Platforms Combined):
• Total Revenue: ${fmtMoney(totalRevenue)}
• Total Orders: ${fmtNum(totalOrders)}
• Total Impressions: ${fmtNum(totalImpressions)}
${totalRevenue != null && totalOrders ? `• Average Order Value: ₹${(totalRevenue / totalOrders).toFixed(2)}\n` : ''}
📈 PLATFORM BREAKDOWN:
${platformDetails.map(p => `
${p.name}
  Revenue: ${fmtMoney(p.revenue)}
  Orders: ${fmtNum(p.orders)}
  Open Alerts: ${p.openAlerts ?? '—'}
`).join('\n')}
---
This is an automated report from Backero Marketplace Automation System.
Figures are pulled live from the marketplace dashboard; a platform with
no recent sync shows "not tracked" rather than a false zero.
      `;

    res.json({
      date: dateLabel,
      email_subject: `Marketplace Automation Report - ${new Date().toLocaleDateString('en-IN')}`,
      email_body: body,
      platforms: platformDetails,
      totals: {
        revenue: fmtMoney(totalRevenue),
        orders: fmtNum(totalOrders),
        impressions: fmtNum(totalImpressions),
      },
    });
  } catch (err) {
    return sendError(res, err.message, err.status || 500);
  }
});

module.exports = router;
