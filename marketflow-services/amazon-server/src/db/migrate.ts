import { sqlite } from './client.js'

// Hand-written DDL kept in lockstep with schema.ts. At this scale (single SQLite
// file, Phase 1 seed/demo data) a migration framework would be over-engineering —
// idempotent CREATE TABLE IF NOT EXISTS is enough per Design Doc §5's "don't
// over-engineer the warehouse" guidance.
export function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dim_marketplace (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dim_product (
      asin TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      marketplace_code TEXT NOT NULL,
      price REAL,
      cogs REAL,
      cogs_updated_at TEXT,
      watches_asin TEXT, -- for competitor rows: which own ASIN they're benchmarked against (Competitor Watchlist, Design Doc §9)
      is_hero INTEGER NOT NULL DEFAULT 0,
      is_own INTEGER NOT NULL DEFAULT 1,
      fulfilment TEXT,
      fee_per_unit REAL
    );

    CREATE TABLE IF NOT EXISTS dim_keyword (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      is_hero_target INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dim_campaign (
      campaign_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fact_listing_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL,
      date TEXT NOT NULL,
      sessions INTEGER NOT NULL,
      page_views INTEGER NOT NULL,
      buy_box_pct REAL NOT NULL,
      units_ordered INTEGER NOT NULL,
      ordered_product_sales REAL NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'api'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fact_listing_daily_asin_date ON fact_listing_daily(asin, date);

    CREATE TABLE IF NOT EXISTS fact_ads_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      keyword TEXT,
      asin TEXT NOT NULL,
      date TEXT NOT NULL,
      impressions INTEGER NOT NULL,
      clicks INTEGER NOT NULL,
      spend REAL NOT NULL,
      ad_orders INTEGER NOT NULL,
      ad_sales REAL NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'api'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fact_ads_daily_uniq ON fact_ads_daily(campaign_id, keyword, asin, date);

    CREATE TABLE IF NOT EXISTS fact_price_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      price REAL NOT NULL,
      coupon_deal_flag INTEGER NOT NULL DEFAULT 0,
      bsr INTEGER,
      category TEXT,
      rating REAL,
      review_count INTEGER,
      buy_box_seller TEXT, -- who the storefront showed as the seller of the featured offer
      data_quality TEXT NOT NULL DEFAULT 'observed'
    );

    CREATE TABLE IF NOT EXISTS fact_keyword_rank_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      asin TEXT NOT NULL,
      date TEXT NOT NULL,
      organic_rank INTEGER,
      sponsored_rank INTEGER,
      data_quality TEXT NOT NULL DEFAULT 'observed'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fact_keyword_rank_daily_uniq ON fact_keyword_rank_daily(keyword, asin, date);

    CREATE TABLE IF NOT EXISTS fact_inventory_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      date TEXT NOT NULL,
      available INTEGER NOT NULL,
      days_of_cover REAL,
      data_quality TEXT NOT NULL DEFAULT 'api'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fact_inventory_daily_uniq ON fact_inventory_daily(sku, date);

    CREATE TABLE IF NOT EXISTS connections (
      source TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'not_connected',
      last_seen_at TEXT,
      last_error TEXT,
      credentials_json TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL DEFAULT 'amazon_in',
      rule_id TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'amber',
      fired_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      ai_analysis TEXT
    );

    -- Seller Central "Account Health": what Amazon judges the seller on. Not in the founder's
    -- parameter list, but a seller-fulfilled offer deactivation would end sales, so it is tracked.
    CREATE TABLE IF NOT EXISTS fact_account_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      at_risk INTEGER NOT NULL DEFAULT 0,
      banner TEXT,
      ahr INTEGER,
      odr_fbm_pct REAL, odr_fbm_defects INTEGER, odr_fbm_orders INTEGER, odr_target_pct REAL,
      odr_fba_pct REAL, odr_fba_defects INTEGER, odr_fba_orders INTEGER,
      late_dispatch_pct REAL, late_dispatch_late INTEGER, late_dispatch_orders INTEGER, late_dispatch_target_pct REAL,
      cancel_pct REAL, cancel_count INTEGER, cancel_orders INTEGER, cancel_target_pct REAL,
      valid_tracking_pct REAL,
      policy_issues INTEGER,
      emergency_contact_verified INTEGER,
      data_quality TEXT NOT NULL DEFAULT 'observed'
    );

    -- Sponsored-ads sentinel: the Ads console's headline numbers for the range it shows.
    CREATE TABLE IF NOT EXISTS fact_ads_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      range_label TEXT,
      impressions INTEGER NOT NULL,
      clicks INTEGER NOT NULL,
      sales REAL NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'observed'
    );

    -- One row per active listing per Manage All Inventory read: the seller's own view of status,
    -- stock, price, Buy Box price, sales rank, 30-day sales and Amazon's estimated fees.
    CREATE TABLE IF NOT EXISTS fact_listing_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      asin TEXT NOT NULL,
      sku TEXT,
      status TEXT,
      fulfilment TEXT,
      available INTEGER,
      inbound INTEGER,
      unfulfillable INTEGER,
      price REAL,
      featured_offer_price REAL,
      sales_rank INTEGER,
      sales_rank_category TEXT,
      units_sold_30d INTEGER,
      sales_30d REAL,
      total_fees REAL,
      fba_fee REAL,
      data_quality TEXT NOT NULL DEFAULT 'observed'
    );
    CREATE INDEX IF NOT EXISTS fact_listing_snapshot_asin_time ON fact_listing_snapshot(asin, captured_at);

    -- Design Doc §4.1 "share_of_search": how many of the top organic results for a keyword are yours.
    CREATE TABLE IF NOT EXISTS fact_search_share (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      date TEXT NOT NULL,
      top_n INTEGER NOT NULL,
      organic_results INTEGER NOT NULL,
      own_organic INTEGER NOT NULL,
      sponsored_results INTEGER NOT NULL,
      own_sponsored INTEGER NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'observed'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fact_search_share_uniq ON fact_search_share(keyword, date);

    -- Robots page: one row per job run reported by Amazon Robo ("what did it just do, and how did it end?").
    CREATE TABLE IF NOT EXISTS robot_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      robot TEXT NOT NULL,
      job TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'skipped', 'needs_you', 'failed')),
      detail TEXT,
      every_minutes REAL
    );
    CREATE INDEX IF NOT EXISTS robot_runs_job_time ON robot_runs(robot, job, finished_at);

    CREATE TABLE IF NOT EXISTS ingest_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      received_at TEXT NOT NULL
    );

    -- Design Doc §5 "Raw landing store": every accepted payload exactly as received, append-only,
    -- so a parsing bug can be fixed later and the history re-derived instead of lost.
    CREATE TABLE IF NOT EXISTS raw_ingest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL,
      source TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      payload_type TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      idempotency_key TEXT,
      record_count INTEGER NOT NULL,
      body_json TEXT NOT NULL
    );

    -- Design Doc §6: "unknown metrics are stored but flagged, never dropped". The values live in
    -- raw_ingest; this register is the flag — which metric names arrived that no column understands.
    CREATE TABLE IF NOT EXISTS unknown_metrics (
      payload_type TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 1,
      last_value TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (payload_type, metric_key)
    );

    -- === PROFITABILITY & COST TRACKING TABLES ===

    -- Track COGS (Cost of Goods Sold) per SKU for margin calculations
    CREATE TABLE IF NOT EXISTS dim_product_cost (
      sku TEXT PRIMARY KEY,
      cogs REAL NOT NULL,
      shipping_cost REAL,
      packaging_cost REAL,
      updated_at TEXT NOT NULL,
      source TEXT DEFAULT 'manual'
    );

    -- Order-level data for profitability analysis (aggregated across platforms)
    CREATE TABLE IF NOT EXISTS fact_order (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      order_date TEXT NOT NULL,
      asin TEXT,
      sku TEXT,
      quantity INTEGER NOT NULL,
      order_price REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      ad_spend REAL DEFAULT 0,
      referral_fee REAL,
      platform_fee REAL,
      shipping_cost REAL,
      fulfillment_fee REAL,
      other_fees REAL DEFAULT 0,
      return_flag INTEGER DEFAULT 0,
      return_reason TEXT,
      return_date TEXT,
      customer_segment TEXT,
      region TEXT,
      customer_id TEXT,
      email TEXT,
      data_quality TEXT DEFAULT 'api'
    );
    CREATE INDEX IF NOT EXISTS fact_order_date ON fact_order(order_date);
    CREATE INDEX IF NOT EXISTS fact_order_sku ON fact_order(sku);

    -- Settlement records with parsed fee breakdown
    CREATE TABLE IF NOT EXISTS fact_settlement (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      settlement_date TEXT NOT NULL,
      order_id TEXT,
      sku TEXT,
      units INTEGER,
      gross_amount REAL,
      referral_fee_pct REAL,
      referral_fee_amt REAL,
      fba_fee_amt REAL,
      fulfillment_fee_amt REAL,
      closing_fee_amt REAL,
      other_fee_amt REAL,
      net_amount REAL,
      data_quality TEXT DEFAULT 'api'
    );
    CREATE INDEX IF NOT EXISTS fact_settlement_date ON fact_settlement(settlement_date);
    CREATE INDEX IF NOT EXISTS fact_settlement_sku ON fact_settlement(sku);

    -- Calculated profitability metrics (refreshed daily)
    CREATE TABLE IF NOT EXISTS metrics_product_profitability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calculated_at TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      asin TEXT,
      sku TEXT NOT NULL,
      period_days INTEGER,
      units_sold INTEGER,
      gross_revenue REAL,
      total_cogs REAL,
      total_fees REAL,
      total_ad_spend REAL,
      total_returns REAL,
      net_profit REAL,
      margin_pct REAL,
      roi_pct REAL,
      return_rate REAL,
      data_quality TEXT DEFAULT 'calculated'
    );
    CREATE INDEX IF NOT EXISTS metrics_product_profitability_sku_time ON metrics_product_profitability(sku, calculated_at);

    -- Customer cohort analysis (repeat customers, LTV)
    CREATE TABLE IF NOT EXISTS dim_customer_cohort (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marketplace TEXT NOT NULL,
      cohort_month TEXT NOT NULL,
      cohort_size INTEGER,
      first_purchase_date TEXT,
      region TEXT,
      customer_segment TEXT
    );

    CREATE TABLE IF NOT EXISTS fact_customer_repeat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marketplace TEXT NOT NULL,
      customer_id TEXT,
      cohort_month TEXT,
      month TEXT,
      month_number INTEGER,
      orders INTEGER,
      revenue REAL,
      repeat_customer INTEGER
    );
    CREATE INDEX IF NOT EXISTS fact_customer_repeat_cohort ON fact_customer_repeat(cohort_month, month);

    -- Regional performance breakdown
    CREATE TABLE IF NOT EXISTS metrics_regional_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calculated_at TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      region TEXT NOT NULL,
      period TEXT,
      total_orders INTEGER,
      total_revenue REAL,
      total_returns INTEGER,
      return_rate REAL,
      avg_order_value REAL,
      repeat_customer_rate REAL,
      top_category TEXT,
      top_sku TEXT
    );

    -- Category benchmarking and comparison
    CREATE TABLE IF NOT EXISTS metrics_category_benchmark (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calculated_at TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      category TEXT NOT NULL,
      your_avg_price REAL,
      market_avg_price REAL,
      your_avg_rating REAL,
      market_avg_rating REAL,
      your_reviews INTEGER,
      market_avg_reviews INTEGER,
      your_bsr INTEGER,
      market_avg_bsr INTEGER
    );

    -- Returns analysis and quality metrics
    CREATE TABLE IF NOT EXISTS fact_return_detail (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      order_id TEXT,
      asin TEXT,
      sku TEXT,
      return_date TEXT NOT NULL,
      return_reason TEXT,
      reason_category TEXT,
      refund_amount REAL,
      refund_method TEXT,
      customer_segment TEXT,
      frequency_for_customer INTEGER
    );
    CREATE INDEX IF NOT EXISTS fact_return_detail_date ON fact_return_detail(return_date);
    CREATE INDEX IF NOT EXISTS fact_return_detail_reason ON fact_return_detail(reason_category);

    -- Promotional campaign tracking
    CREATE TABLE IF NOT EXISTS fact_promotion (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      sku TEXT,
      promotion_type TEXT,
      discount_pct REAL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      baseline_revenue REAL,
      promo_revenue REAL,
      promo_units INTEGER,
      promo_ad_spend REAL,
      lift_pct REAL
    );

    -- AI-generated insights and analysis
    CREATE TABLE IF NOT EXISTS ai_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      marketplace TEXT,
      summary_json TEXT,
      recommendations TEXT,
      data_quality TEXT,
      confidence_score REAL,
      user_feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ai_insights_time ON ai_insights(generated_at DESC);

    -- Trend snapshots for graphing (daily)
    CREATE TABLE IF NOT EXISTS metrics_trend_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      ctr_pct REAL,
      cvr_pct REAL,
      impressions INTEGER,
      clicks INTEGER,
      orders INTEGER,
      revenue REAL,
      alerts_open INTEGER,
      alerts_critical INTEGER,
      avg_rating REAL,
      data_quality TEXT DEFAULT 'collected',
      UNIQUE(date, marketplace)
    );
    CREATE INDEX IF NOT EXISTS metrics_trend_date ON metrics_trend_snapshot(marketplace, date DESC);

    -- Unified cross-platform comparison snapshots (daily)
    CREATE TABLE IF NOT EXISTS metrics_platform_comparison (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      impressions INTEGER,
      clicks INTEGER,
      orders INTEGER,
      revenue REAL,
      ctr_pct REAL,
      cvr_pct REAL,
      avg_order_value REAL,
      total_cogs REAL,
      total_fees REAL,
      net_profit REAL,
      margin_pct REAL,
      open_alerts INTEGER,
      critical_alerts INTEGER,
      avg_rating REAL,
      return_rate REAL,
      wow_change_pct REAL,
      mom_change_pct REAL,
      data_quality TEXT DEFAULT 'collected',
      UNIQUE(snapshot_date, marketplace)
    );
    CREATE INDEX IF NOT EXISTS metrics_platform_comparison_date ON metrics_platform_comparison(snapshot_date DESC);
    CREATE INDEX IF NOT EXISTS metrics_platform_comparison_mp ON metrics_platform_comparison(marketplace, snapshot_date DESC);

    -- AI-generated platform insights
    CREATE TABLE IF NOT EXISTS ai_platform_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      analysis_type TEXT NOT NULL,
      marketplace TEXT,
      summary TEXT NOT NULL,
      findings_json TEXT,
      recommendations TEXT,
      confidence_score REAL DEFAULT 0.8,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ai_platform_insights_time ON ai_platform_insights(generated_at DESC);
    CREATE INDEX IF NOT EXISTS ai_platform_insights_type ON ai_platform_insights(analysis_type);

    -- Recommendations with action plans
    CREATE TABLE IF NOT EXISTS recommendations_with_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      marketplace TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      action_steps TEXT,
      priority TEXT NOT NULL,
      estimated_impact REAL,
      implementation_effort TEXT,
      success_metrics TEXT,
      status TEXT DEFAULT 'open',
      dismissed_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS recommendations_actions_mp_time ON recommendations_with_actions(marketplace, generated_at DESC);
    CREATE INDEX IF NOT EXISTS recommendations_status ON recommendations_with_actions(status);

    -- Data quality tracking per platform
    CREATE TABLE IF NOT EXISTS data_quality_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      data_freshness_hours REAL,
      collection_success_rate REAL,
      data_completeness_pct REAL,
      status TEXT,
      last_successful_sync TEXT,
      last_error TEXT,
      metrics_available TEXT,
      UNIQUE(checked_at, marketplace)
    );
    CREATE INDEX IF NOT EXISTS data_quality_time ON data_quality_report(marketplace, checked_at DESC);

    -- Historical performance for trending
    CREATE TABLE IF NOT EXISTS metrics_hourly_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hour_timestamp TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      impressions INTEGER,
      clicks INTEGER,
      orders INTEGER,
      revenue REAL,
      conversion_events INTEGER,
      data_quality TEXT DEFAULT 'sampled',
      UNIQUE(hour_timestamp, marketplace)
    );
    CREATE INDEX IF NOT EXISTS metrics_hourly_marketplace ON metrics_hourly_summary(marketplace, hour_timestamp DESC);
  `)

  // CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already exists
  // on disk from before this field was introduced — patch it in directly.
  try {
    sqlite.exec('ALTER TABLE alerts ADD COLUMN ai_analysis TEXT')
  } catch {
    // column already exists
  }
  try {
    sqlite.exec('ALTER TABLE alerts ADD COLUMN marketplace TEXT NOT NULL DEFAULT "amazon_in"')
  } catch {
    // column already exists
  }
  // Real per-unit Amazon fees (referral + FBA + closing) as Seller Central estimates them, for FBA
  // listings — a flat 22% is badly wrong for cheap items with a fixed FBA fee.
  for (const col of ['fulfilment TEXT', 'fee_per_unit REAL']) {
    try {
      sqlite.exec(`ALTER TABLE dim_product ADD COLUMN ${col}`)
    } catch {
      // column already exists
    }
  }
  try {
    sqlite.exec('ALTER TABLE fact_price_snapshot ADD COLUMN buy_box_seller TEXT')
  } catch {
    // column already exists
  }

  // Add missing columns to existing profitability tables (if they existed before)
  for (const [table, col] of [
    // Each CTR/CVR is stored with a plain-language note of what it is measured on (platforms report different things).
    ['metrics_platform_comparison', 'ctr_basis TEXT'],
    ['metrics_platform_comparison', 'cvr_basis TEXT'],
    ['metrics_platform_comparison', 'traffic_basis TEXT'],
    ['metrics_trend_snapshot', 'ctr_basis TEXT'],
    ['metrics_trend_snapshot', 'cvr_basis TEXT'],
    ['metrics_trend_snapshot', 'traffic_basis TEXT'],
    ['dim_product_cost', 'cogs REAL'],
    ['dim_product_cost', 'shipping_cost REAL'],
    // deduplicateCustomers() (data-collectors.ts) reads these for LTV cohorting — their absence
    // was crashing runDataCollectors() and, with it, every step after it in the 4-hourly
    // scheduler run (trend capture, unified snapshot, alerts, recommendations, AI insights).
    ['fact_order', 'customer_id TEXT'],
    ['fact_order', 'email TEXT'],
  ] as const) {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`)
    } catch {
      // already exists
    }
  }
}
