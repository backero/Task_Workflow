require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const MarketflowSnapshot = require('./src/models/MarketflowSnapshot');

    // Clear existing data
    await MarketflowSnapshot.deleteMany({ platform: { $in: ['flipkart', 'meesho', 'snapdeal', 'myntra', 'jiomart'] } });
    console.log('✓ Cleared existing marketplace data');

    // Flipkart seed data - matches FlipkartOverview.tsx expectations
    const flipkartData = {
      listings: 247,
      active: 198,
      avg_rating: 4.3,
      open_recommendations: { policy_violation: 2, image_quality: 4 },
      account_metrics: {
        business_health: {
          impressions_7d: 45230,
          units_7d: 156,
          sales_7d: 52400,
          conversion_7d_pct: 3.45,
          rto_pct: 8.2,
          buyer_returns_pct: 2.1,
          seller_cancel_pct: 1.5,
          low_quality_listings: 12,
          listings_scored: 198,
        },
        traffic: {
          impressions_30d: 156800,
          units_30d: 542,
          sales_30d: 186500,
          impressions_change_pct: 12.5,
        },
        ads: {
          spend: 8450,
          roi: 2.3,
          ctr_pct: 1.8,
          cvr_pct: 3.2,
          range_label: 'Last 30 days',
        },
      },
    };

    await MarketflowSnapshot.create({
      platform: 'flipkart',
      endpoint: 'overview',
      data: flipkartData,
      synced_at: new Date(),
    });
    console.log('✓ Seeded Flipkart data: 247 listings, 198 active, 4.3★ rating');

    // Meesho seed data
    const meeshoData = {
      listings: 1248,
      live: 1089,
      blocked: 45,
      orders_7d: 487,
      impressions_7d: 45230,
      avg_quality_score: 4.6,
      avg_rating: 4.5,
      open_critical_alerts: 3,
      open_recs: 12,
    };

    await MarketflowSnapshot.create({
      platform: 'meesho',
      endpoint: 'overview',
      data: meeshoData,
      synced_at: new Date(),
    });
    console.log('✓ Seeded Meesho data: 1248 listings, 1089 live, 4.5★ rating');

    // Snapdeal seed data
    const snapdealData = {
      listings: 856,
      active: 723,
      avg_rating: 4.1,
      open_recommendations: { competitive_pricing: 5, image_quality: 8 },
      orders_today: 92,
      sales_today: 31250,
      impressions_today: 12450,
      returns_today: 5,
      quality_score: 3.8,
    };

    await MarketflowSnapshot.create({
      platform: 'snapdeal',
      endpoint: 'overview',
      data: snapdealData,
      synced_at: new Date(),
    });
    console.log('✓ Seeded Snapdeal data: 856 listings, 723 active, 4.1★ rating');

    // Myntra seed data
    const myntraData = {
      listings: 342,
      active: 289,
      avg_rating: 4.4,
      open_recommendations: { sizing_info: 3, image_quality: 2 },
      account_metrics: {
        business_health: {
          impressions_7d: 78450,
          units_7d: 234,
          sales_7d: 78900,
          conversion_7d_pct: 2.98,
          rto_pct: 5.2,
          buyer_returns_pct: 3.1,
          seller_cancel_pct: 0.8,
          low_quality_listings: 5,
          listings_scored: 289,
        },
        traffic: {
          impressions_30d: 285600,
          units_30d: 812,
          sales_30d: 287450,
          impressions_change_pct: 8.3,
        },
      },
    };

    await MarketflowSnapshot.create({
      platform: 'myntra',
      endpoint: 'overview',
      data: myntraData,
      synced_at: new Date(),
    });
    console.log('✓ Seeded Myntra data: 342 listings, 289 active, 4.4★ rating');

    // JioMart seed data
    const jiomartData = {
      listings: 567,
      active: 501,
      avg_rating: 4.2,
      open_recommendations: { price_competitiveness: 4, delivery_sla: 3 },
      account_metrics: {
        business_health: {
          impressions_7d: 62340,
          units_7d: 189,
          sales_7d: 65780,
          conversion_7d_pct: 3.03,
          dispatch_sla_pct: 96.8,
          on_time_delivery_pct: 94.2,
          cancellation_rate_pct: 2.1,
          low_quality_listings: 8,
          listings_scored: 501,
        },
        traffic: {
          impressions_30d: 234500,
          units_30d: 687,
          sales_30d: 245680,
          impressions_change_pct: 15.7,
        },
      },
    };

    await MarketflowSnapshot.create({
      platform: 'jiomart',
      endpoint: 'overview',
      data: jiomartData,
      synced_at: new Date(),
    });
    console.log('✓ Seeded JioMart data: 567 listings, 501 active, 4.2★ rating');

    console.log('\n✅ All marketplace seed data loaded successfully!');
    console.log('Refresh the browser to see updated data in all platform overviews.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
